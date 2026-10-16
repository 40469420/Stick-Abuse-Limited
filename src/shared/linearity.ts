export const LIN_FRONTIER_EPS = 0.0001
export const LIN_GRID = 100

/** Minimum passes before analysis is offered. */
export const LIN_MIN_PASSES = 3

export interface LinSample {
  t: number
  r: number
}

/**
 * Keep the advancing frontier: first sample plus every sample that beats
 * the running peak by at least eps. Drops backtracks and flat repeats —
 * the dropped share is the tremor signal.
 */
export function linFrontier(values: ReadonlyArray<number>, eps = LIN_FRONTIER_EPS): { kept: number[]; dropped: number } {
  const kept: number[] = []
  let peak = -Infinity
  let dropped = 0
  for (const v of values) {
    if (kept.length === 0 || v - peak >= eps) {
      kept.push(v)
      peak = v
    } else {
      dropped++
    }
  }
  return { kept, dropped }
}

/** Tremor % = share of samples the frontier filter drops. */
export function linTremor(total: number, kept: number): number {
  if (total <= 0) return 0
  return Math.max(0, 100 - (100 * kept) / total)
}

/** Resolution = 1 / mean frontier step, floored; 0 when stepless. */
export function linResolution(frontier: ReadonlyArray<number>): number {
  if (frontier.length < 2) return 0
  let sum = 0
  for (let i = 1; i < frontier.length; i++) sum += Math.abs(frontier[i] - frontier[i - 1])
  const mean = sum / (frontier.length - 1)
  if (!(mean > 0)) return 0
  return Math.floor(1 / mean)
}

function linAt(points: ReadonlyArray<number>, times: ReadonlyArray<number>, t: number): number {
  const n = points.length
  if (n === 0) return 0
  if (t <= times[0]) return points[0]
  if (t >= times[n - 1]) return points[n - 1]
  let i = 0
  while (i < n - 2 && times[i + 1] < t) i++
  const t0 = times[i]
  const t1 = times[i + 1]
  if (!(t1 > t0)) return points[i]
  return points[i] + ((t - t0) / (t1 - t0)) * (points[i + 1] - points[i])
}

/** Resample one pass onto a uniform 0..1 time grid (linear, clamped). */
export function linResample(points: ReadonlyArray<number>, times: ReadonlyArray<number>, grid = LIN_GRID): number[] {
  const out: number[] = []
  if (points.length === 0 || times.length === 0 || grid < 2) return out
  const t0 = times[0]
  const t1 = times[times.length - 1]
  for (let i = 0; i < grid; i++) {
    const t = t1 > t0 ? t0 + ((t1 - t0) * i) / (grid - 1) : t0
    out.push(linAt(points, times, t))
  }
  return out
}

/** Per-grid-point median across passes (proper even-count averaging). */
export function linMedian(grids: ReadonlyArray<ReadonlyArray<number>>): number[] {
  if (grids.length === 0) return []
  const width = Math.min(...grids.map((g) => g.length))
  const med: number[] = []
  for (let i = 0; i < width; i++) {
    const col = grids.map((g) => g[i]).sort((a, b) => a - b)
    const n = col.length
    med.push(n % 2 === 1 ? col[(n - 1) / 2] : (col[n / 2 - 1] + col[n / 2]) / 2)
  }
  return med
}

/** Index of the pass closest (L1) to the median curve. */
export function linRepresentative(grids: ReadonlyArray<ReadonlyArray<number>>, median: ReadonlyArray<number>): number {
  let best = 0
  let bestDist = Infinity
  for (let k = 0; k < grids.length; k++) {
    const g = grids[k]
    let d = 0
    for (let i = 0; i < median.length && i < g.length; i++) d += Math.abs(g[i] - median[i])
    if (d < bestDist) {
      bestDist = d
      best = k
    }
  }
  return best
}

export interface LinNonlinearity {
  avgPct: number
  maxPct: number
  score: number
}

/**
 * Deviation from the time-interpolated ideal, as % of pass range.
 * Score = min(100, 1.5 × (0.4 × avg + 0.6 × max)) — max-heavy by design,
 * so single kinks count more than uniform wobble.
 */
export function linNonlinearity(points: ReadonlyArray<number>, times: ReadonlyArray<number>): LinNonlinearity {
  const n = points.length
  const empty = { avgPct: 0, maxPct: 0, score: 0 }
  if (n < 3 || times.length < 3) return empty
  const start = points[0]
  const end = points[n - 1]
  const t0 = times[0]
  const t1 = times[times.length - 1]
  const range = Math.abs(end - start)
  if (!(range > 0) || !(t1 > t0)) return empty
  let total = 0
  let max = 0
  let count = 0
  for (let i = 1; i < n - 1; i++) {
    const progress = (times[i] - t0) / (t1 - t0)
    const ideal = start + progress * (end - start)
    const dev = Math.abs(points[i] - ideal)
    total += dev
    if (dev > max) max = dev
    count++
  }
  if (count === 0) return empty
  const avgPct = ((total / count) / range) * 100
  const maxPct = (max / range) * 100
  return { avgPct, maxPct, score: Math.min(100, 1.5 * (0.4 * avgPct + 0.6 * maxPct)) }
}

/** Linearity % = 100 − nonlinearity score. */
export function linLinearity(points: ReadonlyArray<number>, times: ReadonlyArray<number>): number {
  return 100 - linNonlinearity(points, times).score
}
