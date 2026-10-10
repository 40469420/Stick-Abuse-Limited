import { analyzeCapture, distribution, type BenchCapture, type BenchLive, type BenchMode, type BenchSample } from '../shared/bench'

/** A renewable page lease: stale renderers and hidden windows cannot leave a test running. */
export class BenchSession {
  private id: string | null = null
  private renewed = 0
  private started = 0
  private lastWindow = 0
  private previous: number | null = null
  private total = 0
  private windowCount = 0
  private gaps: number[] = []
  private timer: ReturnType<typeof setInterval> | null = null
  private capture: { samples: BenchSample[]; started: number; mode: BenchMode; limited: boolean; timer: ReturnType<typeof setTimeout>; resolve: (v: BenchCapture) => void; reject: (e: Error) => void } | null = null
  cancelJob: (() => void) | null = null
  constructor(private emit: (v: BenchLive) => void, private now: () => number = () => performance.now()) {}
  get active(): boolean { return this.id !== null }
  get measuring(): boolean { return !!this.capture || !!this.cancelJob }
  start(id: string): void {
    if (typeof id !== 'string' || !/^[\w-]{1,80}$/.test(id)) throw new Error('Invalid Lab session.')
    if (this.id === id) { this.renew(id); return }
    this.stop()
    this.id = id; this.renewed = this.started = this.lastWindow = this.now()
    this.total = this.windowCount = 0; this.previous = null; this.gaps = []
    this.timer = setInterval(() => this.tick(), 1000)
    this.timer.unref()
  }
  renew(id: string): void { this.require(id); this.renewed = this.now() }
  require(id: string): void {
    if (!this.id || this.id !== id || this.now() - this.renewed > 3000) { if (this.id === id) this.stop(); throw new Error('Lab is inactive. Open the Lab page to measure.') }
  }
  stop(id?: string): void {
    if (id && id !== this.id) return
    this.id = null
    if (this.timer) clearInterval(this.timer)
    this.timer = null; this.gaps = []; this.previous = null
    this.cancelCapture('Measurement cancelled; Lab closed, paused, or controller disconnected.')
    const cancel = this.cancelJob; this.cancelJob = null; cancel?.()
  }
  tick(): void {
    if (!this.id) return
    const now = this.now()
    if (now - this.renewed > 3000) { this.stop(); return }
    const duration = now - this.lastWindow
    this.emit({ id: this.id, reportHz: duration > 0 ? this.windowCount * 1000 / duration : 0,
      reports: this.total, intervals: distribution(this.gaps), elapsedMs: now - this.started })
    this.lastWindow = now; this.windowCount = 0; this.gaps = []
    // Never bridge a silence with a subsequent connection's interval.
    if (!duration || (this.previous !== null && now - this.previous > 1000)) this.previous = null
  }
  push(input: { live: boolean; centerRaw?: { lx: number; ly: number; rx: number; ry: number }; lt: number; rt: number }): void {
    if (!this.active) return
    if (!input.live) {
      this.previous = null; this.cancelCapture('Controller input stopped. Capture discarded.')
      const cancel = this.cancelJob; this.cancelJob = null; cancel?.()
      return
    }
    const now = this.now()
    if (now - this.renewed > 3000) { this.stop(); return }
    if (this.previous !== null && this.gaps.length < 100000) this.gaps.push(now - this.previous)
    this.previous = now; this.total++; this.windowCount++
    const capture = this.capture
    if (!capture) return
    if (!input.centerRaw) { this.cancelCapture('Original-axis data is unavailable on this controller.'); return }
    if (capture.samples.length >= 150000) { capture.limited = true; this.finishCapture(); return }
    const { lx, ly, rx, ry } = input.centerRaw
    capture.samples.push({ t: now - capture.started, axes: [lx, ly, rx, ry], triggers: [input.lt / 255, input.rt / 255] })
  }
  startCapture(id: string, mode: BenchMode, seconds: number): Promise<BenchCapture> {
    this.require(id)
    if (this.measuring) throw new Error('Finish or cancel the current test first.')
    if (!['timing', 'rest', 'range', 'release', 'triggers'].includes(mode) || ![5, 10, 30].includes(seconds)) throw new Error('Invalid capture settings.')
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.finishCapture(), seconds * 1000)
      this.capture = { samples: [], mode, limited: false, started: this.now(), timer, resolve, reject }
    })
  }
  cancelCapture(message = 'Capture cancelled.'): void {
    const capture = this.capture; this.capture = null
    if (capture) { clearTimeout(capture.timer); capture.reject(new Error(message)) }
  }
  private finishCapture(): void {
    const c = this.capture; this.capture = null
    if (!c) return
    clearTimeout(c.timer)
    try { c.resolve(analyzeCapture(c.samples, this.now() - c.started, c.mode, c.limited)) } catch (e) { c.reject(e as Error) }
  }
}
