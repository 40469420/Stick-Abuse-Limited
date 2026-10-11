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
  FLY_USAGE_CMD,
  FLY_VID,
  FlyCmd,
  flyAnnounce,
  flyCurveWindow,
  flyFrame,
  flyNonce,
  flyReplyOk,
  flySaveArgs,
  flyUidHex,
  flyVersionStamp,
  FLY_SEC_LEFT,
  FLY_SEC_LEFT_LEN,
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
  resolve: (frame: Uint8Array) => void
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
        const [entry] = this.pending.splice(i, 1)
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
    const granted = await h.getDevices()
    let dev = granted.find((d) => d.vendorId === FLY_VID) ?? null
    if (!dev) {
      const picked = await h.requestDevice({ filters: [{ vendorId: FLY_VID, productId: FLY_PID_APEX5, usagePage: FLY_USAGE_CMD }] })
      dev = picked[0] ?? null
    }
    if (!dev) throw new Error('No Flydigi device selected')
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
   * Write one left-curve pack + save, verified by ack + version-stamp oracle.
   * Throws otherwise. Reads nothing back (curve store has no read path).
   */
  async writeLeftCurve(type: number, points: number[]): Promise<{ stamp: string }> {
    const window = flyCurveWindow(type, points)
    const a4 = await this.send(FlyCmd.WriteStart, flyAnnounce(FLY_SEC_LEFT, FLY_SEC_LEFT_LEN))
    if (!flyReplyOk(a4, FlyCmd.WriteStart)) throw new Error('pad refused the write announce')
    const a5 = await this.send(FlyCmd.WritePack, [0x17, 0x00, ...window])
    if (!flyReplyOk(a5, FlyCmd.WritePack)) throw new Error('pad refused the curve pack')
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
}

export const flyTransport = new FlyTransport()
