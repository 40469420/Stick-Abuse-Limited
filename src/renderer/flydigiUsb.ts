/**
 * Flydigi Apex 5 USB layer (renderer side).
 *
 * Transport runs in main via scripts/flybridge.py (hidapi interrupt-OUT —
 * neither node-hid nor WebHID could reliably send these reports). This
 * module owns the pad flows: identify, store reads, ack-verified writes.
 * Close Space Station first — it holds the handle.
 */
import { api } from './api'
import {
  FLY_SEC_LEFT,
  FLY_SEC_LEFT_LEN,
  FLY_SEC_RGB,
  FLY_SEC_RGB_LEN,
  FLY_SEC_RIGHT,
  FLY_SEC_RIGHT_LEN,
  FLY_STORE_CHUNKS,
  FLY_STORE_LEN,
  FlyCmd,
  FlyStore,
  flyAnnounce,
  flyCurveWindow,
  flyLedWindow,
  flyNonce,
  flyReplyOk,
  flyRightWindow,
  flySaveArgs,
  flyUidHex,
  flyVersionStamp,
  parseFlyStore,
} from '@shared/flydigi'

export interface FlyIdentity {
  uid: string
  version: { b0: number; b1: number }
}

class FlyTransport {
  private open = false

  get connected(): boolean {
    return this.open
  }

  async connect(): Promise<void> {
    await api().flyOpen()
    this.open = true
    try {
      await this.identify()
    } catch (err) {
      this.open = false
      try {
        await api().flyClose()
      } catch {
        /* ignore */
      }
      throw err
    }
  }

  disconnect(): void {
    this.open = false
    void api().flyClose().catch(() => undefined)
  }

  /** One command round-trip; resolves with the full frame ([rid, 5A, A5, cmd, ...]). */
  async send(cmd: number, args: ArrayLike<number> = []): Promise<Uint8Array> {
    if (!this.open) return Promise.reject(new Error('Flydigi not connected'))
    let raw: number[]
    try {
      raw = await api().flySend(cmd, Array.from(args))
    } catch (err) {
      throw err instanceof Error ? err : new Error(String(err))
    }
    return new Uint8Array(raw)
  }

  async identify(): Promise<FlyIdentity> {
    const uid = await this.send(FlyCmd.Uid)
    const ver = await this.send(FlyCmd.Version)
    return { uid: flyUidHex(uid.slice(4)), version: flyVersionStamp(ver) }
  }

  /**
   * Dump the 1092 B config store (42 chunks, E-stripped). Throws on timeout,
   * short reads, or an unrecognized layout.
   */
  async readStore(): Promise<FlyStore> {
    if (!this.open) throw new Error('Flydigi not connected')
    const frames = await api().flyCollect(FlyCmd.ReadSection, [0x06, 0x00, 0x14, 0x01, 0x14, 0x2a], FLY_STORE_CHUNKS)
    const chunks = new Map<number, Uint8Array>()
    for (const f of frames) {
      const bytes = new Uint8Array(f)
      if (bytes.length < 8 || bytes[1] !== 0x5a || bytes[2] !== 0xa5 || bytes[3] !== FlyCmd.ReadSection) continue
      const idx = bytes[5] ?? -1
      if (idx < 0 || idx >= FLY_STORE_CHUNKS || chunks.has(idx)) continue
      chunks.set(idx, bytes.slice(7, 32))
    }
    if (chunks.size < FLY_STORE_CHUNKS) throw new Error(`store short: ${chunks.size}/${FLY_STORE_CHUNKS} chunks`)
    const img = new Uint8Array(FLY_STORE_LEN)
    for (const [idx, data] of [...chunks.entries()].sort((a, b) => a[0] - b[0])) {
      img.set(data.subarray(0, Math.min(25, FLY_STORE_LEN - idx * 25)), idx * 25)
    }
    const parsed = parseFlyStore(img)
    if (!parsed) throw new Error('store layout unrecognized — report it')
    return parsed
  }

  /**
   * Write one section pack (no save). Returns nothing; caller saves.
   */
  async writePack(section: number, length: number, window: number[]): Promise<void> {
    const a4 = await this.send(FlyCmd.WriteStart, flyAnnounce(section, length))
    if (!flyReplyOk(a4, FlyCmd.WriteStart)) throw new Error(`pad refused the write announce (section 0x${section.toString(16)})`)
    const a5 = await this.send(FlyCmd.WritePack, [0x17, 0x00, ...window])
    if (!flyReplyOk(a5, FlyCmd.WritePack)) throw new Error('pad refused the pack')
  }

  async saveCommit(): Promise<{ stamp: string }> {
    const nonce = flyNonce()
    const a6 = await this.send(FlyCmd.Save, flySaveArgs(nonce))
    if (!flyReplyOk(a6, FlyCmd.Save)) throw new Error('pad refused the save')
    const ver = await this.send(FlyCmd.Version)
    const stamp = flyVersionStamp(ver)
    if (stamp.b0 !== (nonce[1] ?? -1) || stamp.b1 !== (nonce[2] ?? -1)) {
      throw new Error('save did not commit (version stamp mismatch) — retry or restore in Space Station')
    }
    return { stamp: `${stamp.b0.toString(16)}${stamp.b1.toString(16)}` }
  }

  async writeLeftCurve(type: number, points: number[]): Promise<{ stamp: string }> {
    await this.writePack(FLY_SEC_LEFT, FLY_SEC_LEFT_LEN, flyCurveWindow(type, points))
    return this.saveCommit()
  }

  /**
   * Write both sticks + save, then re-read the store and compare.
   * Throws otherwise (pad state unknown — restore in Space Station).
   */
  async writeCurves(
    left: { type: number; points: number[] },
    right: { type: number; points: number[] },
    readBack: () => Promise<FlyStore | null>
  ): Promise<{ stamp: string }> {
    await this.writePack(FLY_SEC_LEFT, FLY_SEC_LEFT_LEN, flyCurveWindow(left.type, left.points))
    await this.writePack(FLY_SEC_RIGHT, FLY_SEC_RIGHT_LEN, flyRightWindow(right.type, right.points))
    const { stamp } = await this.saveCommit()
    const after = await readBack().catch(() => null)
    if (!after) throw new Error(`saved (stamp ${stamp}) but the store would not re-read — verify feel in game`)
    // NOTE: rightType is intentionally not compared — the pad stores 0
    // there no matter what type byte the pack carries (observed live).
    const same =
      after.leftType === left.type &&
      after.leftPoints.length === left.points.length &&
      after.leftPoints.every((p, i) => p === left.points[i]) &&
      after.rightPoints.length === right.points.length &&
      after.rightPoints.every((p, i) => p === right.points[i])
    if (!same) throw new Error(`save committed but read-back differs (stamp ${stamp}) — restore in Space Station`)
    return { stamp }
  }

  /** LED brightness + save (visible on the pad itself). */
  async writeLed(brightness: number): Promise<{ stamp: string }> {
    await this.writePack(FLY_SEC_RGB, FLY_SEC_RGB_LEN, flyLedWindow(brightness))
    return this.saveCommit()
  }
}

export const flyTransport = new FlyTransport()
