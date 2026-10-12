// Write guarantee: flaky verifies retry the whole cycle, persistent
// mismatches roll back to the pre-write bytes — proven here against a
// scripted fake pad, no hardware needed.
import { Controller } from '../src/main/controller'
import { Transport } from '../src/main/hid'

const PROFILE = 3
const TOTAL = 1070
const CHUNKS = Math.ceil(TOTAL / 58)

function pattern(): Uint8Array {
  const out = new Uint8Array(TOTAL)
  for (let i = 0; i < TOTAL; i++) out[i] = (i * 7 + 13) & 0xff
  return out
}

/**
 * Scripted pad: 1070-byte EEPROM, per-chunk acks, optional sabotage.
 * - corruptVerifyBudget: that many upcoming verify-read chunks come back
 *   bit-flipped (flaky reads, not bad writes).
 * - sabotageDataWrites: stored write payloads get flipped, so verifies can
 *   never match — but the rollback (which rewrites the original bytes) is
 *   stored cleanly, exercising the restore path.
 */
class FakePad extends Transport {
  eeprom = new Uint8Array(TOTAL)
  corruptVerifyBudget = 0
  sabotageBudget = 0
  writeChunks = 0
  private resSubs = new Set<(raw: Uint8Array) => void>()

  override get isOpen(): boolean {
    return true
  }

  override onResponse(fn: (raw: Uint8Array) => void): () => void {
    this.resSubs.add(fn)
    return () => {
      this.resSubs.delete(fn)
    }
  }

  override onError(): () => void {
    return () => undefined
  }

  override onInput(): () => void {
    return () => undefined
  }

  override open(): void {}
  override close(): void {}
  override heartbeat(): void {}
  override startHeartbeat(): void {}
  override stopHeartbeat(): void {}

  private deliver(raw: Uint8Array): void {
    this.resSubs.forEach((fn) => fn(raw))
  }

  private reply(raw: Uint8Array): void {
    void Promise.resolve().then(() => this.deliver(raw))
  }

  override write(report: number[] | Uint8Array): void {
    const b = report instanceof Uint8Array ? report : Uint8Array.from(report)
    const cmd = b[1]
    if (cmd === 0x04) {
      // read chunk [0F 04 profile hi lo len]
      const off = (b[3] << 8) | b[4]
      const len = b[5]
      let data = this.eeprom.slice(off, off + len)
      if (this.corruptVerifyBudget > 0) {
        this.corruptVerifyBudget--
        data = data.map((x) => x ^ 0xff)
      }
      const raw = new Uint8Array(64)
      raw[0] = 0x10
      raw[1] = 5
      raw[2] = b[2]
      raw[3] = b[3]
      raw[4] = b[4]
      raw[5] = len
      raw.set(data, 6)
      this.reply(raw)
    } else if (cmd === 0x03) {
      // write chunk [0F 03 profile hi lo len data...]
      const off = (b[3] << 8) | b[4]
      const len = b[5]
      const payload = b.slice(6, 6 + len)
      this.writeChunks++
      // Sabotage budget covers exactly the data attempts; the rollback
      // that follows is stored cleanly, exercising the restore path.
      let stored = payload
      if (this.sabotageBudget > 0) {
        this.sabotageBudget--
        stored = payload.map((x) => x ^ 0x01)
      }
      this.eeprom.set(stored, off)
      const raw = new Uint8Array(64)
      raw[0] = 0x10
      raw[1] = 6
      this.reply(raw)
    }
  }
}

let failed = 0
function check(name: string, cond: boolean): void {
  if (cond) console.log(`✓ ${name}`)
  else {
    console.log(`✗ FAIL: ${name}`)
    failed++
  }
}

const data = pattern()

// 1. Flaky first verify: whole cycle retries, then proves the write.
{
  const pad = new FakePad()
  pad.corruptVerifyBudget = CHUNKS * 2 // poison the rollback-copy read + exactly one full verify pass
  const c = new Controller(pad)
  const res = await c.writeProfileVerified(PROFILE, data, TOTAL)
  check('flaky verify still ends verified', res.verified && !res.rolledBack)
  check('retried the full write (2 cycles)', pad.writeChunks === CHUNKS * 2)
  check('pad holds the new bytes', pad.eeprom.every((x, i) => x === data[i]))
}

// 2. Nothing ever lands: rollback restores the original bytes, proven too.
{
  const pad = new FakePad()
  pad.sabotageBudget = CHUNKS * 3 // poison all data attempts, spare the rollback
  const c = new Controller(pad)
  const res = await c.writeProfileVerified(PROFILE, data, TOTAL)
  check('reports verified=false, rolledBack=true', !res.verified && res.rolledBack)
  check('pad restored to pre-write bytes (zeros)', pad.eeprom.every((x) => x === 0))
}

if (failed > 0) {
  console.log(`${failed} FAILURES`)
  process.exit(1)
}
console.log('ALL WRITE GUARANTEE TESTS PASSED')
