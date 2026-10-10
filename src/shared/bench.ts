/** Host-observed measurements. None of these statistics establishes physical input latency. */
export interface Distribution {
  count: number; min: number; median: number; p95: number; p99: number; max: number; mean: number; stdDev: number
  histogram: number[]
}
export const INTERVAL_BINS = [.125, .25, .5, 1, 2, 4, 8, 16]
export function distribution(values: readonly number[]): Distribution | null {
  if (!values.length) return null
  if (values.some(v => !Number.isFinite(v) || v < 0)) throw new Error('Invalid timing samples.')
  const sorted = [...values].sort((a, b) => a - b)
  const quantile = (q: number): number => {
    const pos = (sorted.length - 1) * q, lo = Math.floor(pos)
    return sorted[lo] + (sorted[Math.ceil(pos)] - sorted[lo]) * (pos - lo)
  }
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  const histogram = Array<number>(INTERVAL_BINS.length + 1).fill(0)
  for (const v of values) { const i = INTERVAL_BINS.findIndex(b => v <= b); histogram[i < 0 ? INTERVAL_BINS.length : i]++ }
  return { count: values.length, min: sorted[0], median: quantile(.5), p95: quantile(.95), p99: quantile(.99),
    max: sorted[sorted.length - 1], mean, stdDev: Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length), histogram }
}
export type BenchMode = 'timing' | 'rest' | 'range' | 'release' | 'triggers'
export interface BenchSample { t: number; axes: number[]; triggers: number[] }
export interface AxisMetrics { min: number; max: number; mean: number; rmsNoise: number; unique: number; smallestStep: number | null }
export interface StickMetrics {
  centerOffset: number; rmsNoise: number; angularCoverage: number; circularityError: number | null
  oppositePeak: number | null; settleMs: number | null; releases: number
}
export interface BenchCapture {
  source: 'vendor'; mode: BenchMode; durationMs: number; reports: number; reportHz: number; changedReports: number
  changedHz: number; repeatedPercent: number; intervals: Distribution | null; axes: AxisMetrics[]; sticks: StickMetrics[]
  triggers: AxisMetrics[]; triggerTransitions: number[]; trace: BenchSample[]; limited: boolean
}
export interface XInputBench {
  slot: number; durationMs: number; polls: number; packetChanges: number; stickChanges: number[]
  pollHz: number; changeHz: number; intervals: Distribution | null; calls: Distribution | null; pollIntervals: Distribution | null
}
export interface BenchLive { id: string; reportHz: number; reports: number; intervals: Distribution | null; elapsedMs: number }
function axisMetrics(values: number[]): AxisMetrics {
  const n = values.length
  const mean = values.reduce((a, b) => a + b, 0) / n
  const unique = [...new Set(values)].sort((a, b) => a - b)
  let step = Infinity
  for (let i = 1; i < unique.length; i++) step = Math.min(step, unique[i] - unique[i - 1])
  return { min: unique[0], max: unique[unique.length - 1], mean,
    rmsNoise: Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n), unique: unique.length, smallestStep: Number.isFinite(step) ? step : null }
}
export function analyzeCapture(samples: readonly BenchSample[], durationMs: number, mode: BenchMode, limited = false): BenchCapture {
  if (samples.length < 2 || samples.length > 150000 || !Number.isFinite(durationMs) || durationMs <= 0) throw new Error('Not enough valid input to analyze.')
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]
    if (!Number.isFinite(s.t) || s.t < 0 || s.t > durationMs + 1 || (i && s.t < samples[i - 1].t) ||
      s.axes.length !== 4 || s.triggers.length !== 2 || [...s.axes, ...s.triggers].some(v => !Number.isFinite(v)) ||
      s.axes.some(v => Math.abs(v) > 1.01) || s.triggers.some(v => v < 0 || v > 1)) throw new Error('Invalid capture samples.')
  }
  const axes = [0, 1, 2, 3].map(i => axisMetrics(samples.map(s => s.axes[i])))
  const triggers = [0, 1].map(i => axisMetrics(samples.map(s => s.triggers[i])))
  const gaps: number[] = []; let changed = 0
  for (let i = 1; i < samples.length; i++) {
    gaps.push(samples[i].t - samples[i - 1].t)
    if (samples[i].axes.some((v, j) => v !== samples[i - 1].axes[j]) || samples[i].triggers.some((v, j) => v !== samples[i - 1].triggers[j])) changed++
  }
  const sticks = [0, 1].map(side => {
    const x = axes[side * 2], y = axes[side * 2 + 1], sectors = Array<number>(36).fill(0)
    let releases = 0, oppositePeak: number | null = null, settleMs: number | null = null, unsettled = false
    for (const s of samples) {
      const sx = s.axes[side * 2], sy = s.axes[side * 2 + 1], radius = Math.hypot(sx, sy)
      if (radius >= .7) { const a = (Math.atan2(sy, sx) + Math.PI) / (Math.PI * 2); const bin = Math.min(35, Math.floor(a * 36)); sectors[bin] = Math.max(sectors[bin], radius) }
    }
    // A release starts on crossing below 70% after reaching 80%. Measure the
    // opposite projection over 200 ms; settled means 50 ms continuously within 5%.
    let armed: number[] | null = null
    if (mode === 'release') for (let i = 0; i < samples.length; i++) {
      const s = samples[i], v = s.axes.slice(side * 2, side * 2 + 2), radius = Math.hypot(...v)
      if (radius >= .8) armed = v.map(a => a / radius)
      if (!armed || radius >= .7) continue
      releases++; let peak = 0, insideAt: number | null = null, settled: number | null = null
      let j = i
      for (; j < samples.length && samples[j].t - s.t <= 200; j++) {
        const p = samples[j], px = p.axes[side * 2], py = p.axes[side * 2 + 1]
        peak = Math.max(peak, -(px * armed[0] + py * armed[1]))
        if (Math.hypot(px, py) <= .05) {
          insideAt ??= p.t
          if (p.t - insideAt >= 50 && settled === null) settled = insideAt - s.t
        } else { insideAt = null; settled = null }
      }
      oppositePeak = Math.max(oppositePeak ?? 0, peak)
      if (settled !== null) settleMs = Math.max(settleMs ?? 0, settled)
      else unsettled = true
      armed = null; i = Math.max(i, j - 1)
    }
    const reached = sectors.filter(v => v > 0)
    return { centerOffset: Math.hypot(x.mean, y.mean), rmsNoise: Math.hypot(x.rmsNoise, y.rmsNoise), angularCoverage: reached.length / 36,
      circularityError: mode === 'range' && reached.length >= 30 ? reached.reduce((sum, r) => sum + Math.abs(r - 1), 0) / reached.length : null,
      oppositePeak, settleMs: unsettled ? null : settleMs, releases }
  })
  const triggerTransitions = [0, 1].map(side => {
    let transitions = 0, down = samples[0].triggers[side] >= .5
    for (const s of samples.slice(1)) { const next = s.triggers[side] >= .5; if (next !== down) transitions++; down = next }
    return transitions
  })
  const stride = Math.max(1, Math.ceil(samples.length / 2000))
  return { source: 'vendor', mode, durationMs, reports: samples.length, reportHz: samples.length * 1000 / durationMs,
    changedReports: changed, changedHz: changed * 1000 / durationMs, repeatedPercent: 100 * (1 - changed / (samples.length - 1)),
    intervals: distribution(gaps), axes, sticks, triggers, triggerTransitions, trace: samples.filter((_, i) => i % stride === 0), limited }
}
