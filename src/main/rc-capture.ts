import { measureRcRest, type RcMeasurement } from '../shared/rc'

export interface RcCaptureResult {
  left: RcMeasurement
  right: RcMeasurement
  durationMs: number
  reportHz: number
}
type Sample = { lx: number; ly: number; rx: number; ry: number; live: boolean }

/** Collect before display throttling; send only the final summary over IPC. */
export class RcCapture {
  private active: {
    id: string; started: number; valid: () => boolean
    left: Array<{ x: number; y: number }>; right: Array<{ x: number; y: number }>
    resolve: (result: RcCaptureResult) => void; reject: (error: Error) => void
    timer: ReturnType<typeof setTimeout>
  } | null = null

  constructor(private readonly durationMs = 3000, private readonly now = () => performance.now()) {}

  start(id: string, valid: () => boolean): Promise<RcCaptureResult> {
    if (this.active) return Promise.reject(new Error('An RC capture is already running.'))
    if (!valid()) return Promise.reject(new Error('Connect your controller before measuring.'))
    return new Promise((resolve, reject) => {
      this.active = { id, started: this.now(), valid, left: [], right: [], resolve, reject,
        timer: setTimeout(() => this.finish(), this.durationMs) }
    })
  }

  push(s: Sample): void {
    const c = this.active
    if (!c) return
    if (!c.valid()) { this.finish('Controller connection changed. Capture discarded.'); return }
    if (!s.live) return
    if (![s.lx, s.ly, s.rx, s.ry].every((v) => Number.isFinite(v) && v >= 0 && v <= 255)) return
    if (c.left.length >= 100000) { this.finish('Capture exceeded its report limit.'); return }
    c.left.push({ x: s.lx, y: s.ly }); c.right.push({ x: s.rx, y: s.ry })
  }

  cancel(id: string): void {
    if (this.active?.id === id) this.finish('Capture cancelled.')
  }

  private finish(error?: string): void {
    const c = this.active
    if (!c) return
    this.active = null
    clearTimeout(c.timer)
    if (!error && !c.valid()) error = 'Controller connection changed. Capture discarded.'
    const durationMs = this.now() - c.started
    const left = measureRcRest(c.left), right = measureRcRest(c.right)
    if (error) { c.reject(new Error(error)); return }
    if (!left || !right || left.count < 30 || durationMs <= 0) {
      c.reject(new Error('Not enough live reports. Check the connection and try again.')); return
    }
    c.resolve({ left, right, durationMs, reportHz: left.count * 1000 / durationMs })
  }
}
