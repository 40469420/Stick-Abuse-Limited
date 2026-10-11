/**
 * Flydigi Apex 5 USB transport over WebHID (renderer side).
 *
 * node-hid cannot speak this pad: it sends feature/control transfers while
 * the pad only answers 32 B interrupt OUT on the 0xFFA0 collection
 * (report 3 out, report 4 back). WebHID sendReport does interrupt OUT.
 * Requires a user gesture (Connect button) + the main-process 'hid'
 * permission grant. Close Space Station first — it holds the handle.
 */
import {
  FLY_PID_APEX5,
  FLY_REPORT_OUT,
  FLY_STORE_CHUNKS,
  FLY_STORE_LEN,
  FLY_USAGE_CMD,
  FLY_VID,
  FlyCmd,
  FlyStore,
  flyAnnounce,
  flyCurveWindow,
  flyFrame,
  flyNonce,
  flyReplyOk,
  flyRightWindow,
  flySaveArgs,
  flyUidHex,
  flyVersionStamp,
  parseFlyStore,
  FLY_SEC_LEFT,
  FLY_SEC_LEFT_LEN,
  FLY_SEC_RIGHT,
  FLY_SEC_RIGHT_LEN,
} from '@shared/flydigi'

interface HidReportEventLike {
  reportId: number
  data: DataView
}

interface HidDeviceLike extends EventTarget {
  readonly opened: boolean
  readonly vendorId: number
  readonly productId: number
  open(): Promise<void>
  close(): Promise<void>
  sendReport(reportId: number, data: BufferSource): Promise<void>
}

interface HidLike {
  getDevices(): Promise<HidDeviceLike[]>
  requestDevice(options: { filters: Array<{ vendorId: number; productId?: number; usagePage?: number; usage?: number }> }): Promise<HidDeviceLike[]>
}

function hid(): HidLike | null {
  const n = navigator as unknown as { hid?: HidLike }
  return n.hid ?? null
}

export interface FlyIdentity {
  uid: string
  version: { b0: number; b1: number }
}

interface Pending {
  cmd: number
  multi: boolean
  resolve: (frame: Uint8Array) => void
  onFrame?: (frame: Uint8Array) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

const ROUNDTRIP_MS = 3000

class FlyTransport {
  device: HidDeviceLike | null = null
  private pending: Pending[] = []
  private onReport = (e: Event): void => {
    const ev = e as unknown as HidReportEventLike
    const bytes = new Uint8Array(ev.data.buffer, ev.data.byteOffset, ev.data.byteLength)
    // WebHID strips the report ID: body is [5A, A5, cmd, ...].
    if (bytes.length < 3 || bytes[0] !== 0x5a || bytes[1] !== 0xa5) return
    const cmd = bytes[2] ?? -1
    const full = new Uint8Array(1 + bytes.length)
    full[0] = ev.reportId
    full.set(bytes, 1)
    for (let i = this.pending.length - 1; i >= 0; i--) {
      if (this.pending[i].cmd === cmd) {
        const entry = this.pending[i]
        if (entry.multi) {
          entry.onFrame?.(full)
          continue
        }
        this.pending.splice(i, 1)
        clearTimeout(entry.timer)
        entry.resolve(full)
      }
    }
  }

  get connected(): boolean {
    return !!this.device?.opened
  }

  async scan(): Promise<Array<{ vendorId: number; productId: number }>> {
    const h = hid()
    if (!h) throw new Error('WebHID unavailable in this context')
    const devs = await h.getDevices()
    return devs
      .filter((d) => d.vendorId === FLY_VID)
      .map((d) => ({ vendorId: d.vendorId, productId: d.productId }))
  }

  async connect(): Promise<HidDeviceLike> {
    const h = hid()
    if (!h) throw new Error('WebHID unavailable — use the desktop app build')
    // requestDevice FIRST, before any await: Chromium may only allow the
    // picker while the click's user gesture is current.
    let picked: HidDeviceLike[] = []
    try {
      picked = await h.requestDevice({
        filters: [
          { vendorId: FLY_VID, productId: FLY_PID_APEX5, usagePage: FLY_USAGE_CMD },
          { vendorId: FLY_VID, productId: FLY_PID_APEX5 },
        ],
      })
    } catch {
      picked = []
    }
    let dev: HidDeviceLike | null = picked[0] ?? null
    if (!dev) {
      // Fall back to an already-granted device (no picker needed).
      const granted = await h.getDevices().catch(() => [] as HidDeviceLike[])
      dev = granted.find((d) => d.vendorId === FLY_VID) ?? null
    }
    if (!dev) {
      throw new Error('No Flydigi device selected — if the list was empty, quit Space Station fully (window + service: it locks the pad) and retry')
    }
    if (!dev.opened) await dev.open()
    this.disconnect()
    this.device = dev
    dev.addEventListener('inputreport', this.onReport as EventListener)
    return dev
  }

  disconnect(): void {
    const d = this.device
    this.device = null
    for (const p of this.pending.splice(0)) {
      clearTimeout(p.timer)
      p.reject(new Error('disconnected'))
    }
    if (d) {
      d.removeEventListener('inputreport', this.onReport as EventListener)
      void d.close().catch(() => undefined)
    }
  }

  /**
   * One command round-trip. Resolves with the FULL frame including a
   * synthetic report-ID prefix ([04, 5A, A5, cmd, ...]) so the shared
   * parsers see the exact wire shape.
   */
  send(cmd: number, args: ArrayLike<number> = []): Promise<Uint8Array> {
    const dev = this.device
    if (!dev?.opened) return Promise.reject(new Error('Flydigi not connected'))
    const frame = flyFrame(cmd, args)
    const body = new Uint8Array(frame.slice(1))
    return new Promise<Uint8Array>((resolve, reject) => {
      const timer = setTimeout(() => {
        const i = this.pending.findIndex((p) => p.timer === timer)
        if (i >= 0) this.pending.splice(i, 1)
        reject(new Error(`Flydigi cmd 0x${cmd.toString(16)} timed out — close Space Station (it holds the handle) and retry`))
      }, ROUNDTRIP_MS)
      const drop = (): void => {
        const i = this.pending.findIndex((p) => p.timer === timer)
        if (i >= 0) this.pending.splice(i, 1)
        clearTimeout(timer)
      }
      const entry: Pending = {
        cmd,
        multi: false,
        resolve: (frame) => {
          drop()
          resolve(frame)
        },
        reject: (err) => {
          drop()
          reject(err)
        },
        timer,
      }
      this.pending.push(entry)
      void dev.sendReport(FLY_REPORT_OUT, body).catch((e: unknown) => {
        entry.reject(e instanceof Error ? e : new Error(String(e)))
      })
    })
  }

  async identify(): Promise<FlyIdentity> {
    const uid = await this.send(FlyCmd.Uid)
    const ver = await this.send(FlyCmd.Version)
    return { uid: flyUidHex(uid.slice(4)), version: flyVersionStamp(ver) }
  }

  /**
   * Dump the 1092 B config store (section byte 0x14, 42 chunks, E-stripped).
   * Throws on timeout or short reads.
   */
  async readStore(): Promise<FlyStore> {
    const dev = this.device
    if (!dev?.opened) throw new Error('Flydigi not connected')
    const chunks = new Map<number, Uint8Array>()
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const i = this.pending.findIndex((p) => p.timer === timer)
        if (i >= 0) this.pending.splice(i, 1)
        reject(new Error('store read timed out'))
      }, 15000)
      const entry: Pending = {
        cmd: FlyCmd.ReadSection,
        multi: true,
        resolve: () => undefined,
        onFrame: (frame) => {
          // frame: [04, 5A, A5, A3, X, idx, E, 25 data]
          if (frame.length < 32) return
          const idx = frame[5] ?? -1
          if (idx < 0 || idx >= FLY_STORE_CHUNKS || chunks.has(idx)) return
          chunks.set(idx, frame.slice(7, 32))
          if (chunks.size >= FLY_STORE_CHUNKS) {
            const i = this.pending.indexOf(entry)
            if (i >= 0) this.pending.splice(i, 1)
            clearTimeout(timer)
            resolve()
          }
        },
        reject: (err) => {
          const i = this.pending.indexOf(entry)
          if (i >= 0) this.pending.splice(i, 1)
          clearTimeout(timer)
          reject(err)
        },
        timer,
      }
      this.pending.push(entry)
      const body = new Uint8Array(flyFrame(FlyCmd.ReadSection, [0x06, 0x00, 0x14, 0x01, 0x14, 0x2a]).slice(1))
      void dev.sendReport(FLY_REPORT_OUT, body).catch((e: unknown) => {
        entry.reject(e instanceof Error ? e : new Error(String(e)))
      })
    })
    if (chunks.size < FLY_STORE_CHUNKS) throw new Error(`store short: ${chunks.size}/${FLY_STORE_CHUNKS} chunks`)
    const img = new Uint8Array(FLY_STORE_LEN)
    for (const [idx, data] of [...chunks.entries()].sort((a, b) => a[0] - b[0])) {
      img.set(data.subarray(0, Math.min(25, FLY_STORE_LEN - idx * 25)), idx * 25)
    }
    const parsed = parseFlyStore(img)
    if (!parsed) throw new Error('store layout unrecognized — E bytes or offsets shifted, report it')
    return parsed
  }

  /**
   * Write one section pack (no save). Returns the pack ack.
   * Caller must Save + verify the version stamp (see writeCurves).
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

  /**
   * Write one left-curve pack + save, verified by ack + version-stamp oracle.
   * Throws otherwise. Reads nothing back (curve store has no read path).
   */
  async writeLeftCurve(type: number, points: number[]): Promise<{ stamp: string }> {
    const window = flyCurveWindow(type, points)
    const a4 = await this.send(FlyCmd.WriteStart, flyAnnounce(FLY_SEC_LEFT, FLY_SEC_LEFT_LEN))
    if (!flyReplyOk(a4, FlyCmd.WriteStart)) throw new Error('pad refused the write announce')
    const a5 = await this.send(FlyCmd.WritePack, [0x17, 0x00, ...window])
    if (!flyReplyOk(a5, FlyCmd.WritePack)) throw new Error('pad refused the curve pack')
    return this.saveCommit()
  }

  /**
   * Write both sticks + save, then re-read the store and compare.
   * On mismatch, rewrites the original windows + saves (best-effort
   * restore) and throws.
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
    const same =
      after.leftType === left.type &&
      after.rightType === right.type &&
      after.leftPoints.length === left.points.length &&
      after.leftPoints.every((p, i) => p === left.points[i]) &&
      after.rightPoints.length === right.points.length &&
      after.rightPoints.every((p, i) => p === right.points[i])
    if (!same) throw new Error(`save committed but read-back differs (stamp ${stamp}) — restore in Space Station`)
    return { stamp }
  }
}

export const flyTransport = new FlyTransport()
