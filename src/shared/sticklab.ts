/**
 * Stick Lab helpers — insane stick configuration on top of the proven codec.
 *
 * Hardware truth (see docs in g7-forge):
 * - stick resolution wire byte (Fun_Data +16) = 12 - bits, so 0..4 = 12..8 bit.
 *   12-bit = 4096 levels is the ADC max. Anything beyond is raw-byte
 *   experimentation, not a supported mode — the UI must say so.
 * - RC filter wire byte (Fun_Data +17/+18) = level + 11 (1..21), level -10..+10,
 *   0 = off. Wire 0 = never-written default (treated as 0/off).
 */

/** Standard hardware range. */
export const BITS_MIN = 8
export const BITS_MAX = 12

export function bitsToLevels(bits: number): number {
  return 2 ** Math.round(bits)
}

export function bitsToStep(bits: number): number {
  return 65536 / bitsToLevels(bits)
}

/** Wire byte for a standard bit depth. */
export function bitsToWire(bits: number): number {
  return 12 - Math.max(BITS_MIN, Math.min(BITS_MAX, Math.round(bits)))
}

/** Effective bits implied by a raw wire byte (may be outside 8-12). */
export function wireToBits(wire: number): number {
  return 12 - (wire & 0xff)
}

/** Wire byte implied by a requested bit depth, even past silicon (wraps u8). */
export function bitsToWireRaw(bits: number): number {
  return (12 - Math.round(bits)) & 0xff
}

/** Beyond-silicon quick picks — experimental, firmware will clamp/ignore. */
export const EXTENDED_BITS: ReadonlyArray<number> = [13, 14, 16, 20, 24]

export interface RawResolutionInfo {
  wire: number
  bits: number
  levels: number
  step: number
  standard: boolean
  label: string
}

export function describeRawResolution(wire: number): RawResolutionInfo {
  const w = Math.max(0, Math.min(255, Math.round(wire)))
  const bits = wireToBits(w)
  const standard = w >= 0 && w <= 4
  let levels: number
  let step: number
  let label: string
  if (bits >= 1 && bits <= 16) {
    levels = 2 ** bits
    step = 65536 / levels
    label = `${bits}-bit · ${levels.toLocaleString()} levels · step ${step}`
  } else {
    levels = NaN
    step = NaN
    label = `wire ${w} → ${bits}-bit (out of ADC range — experimental)`
  }
  return { wire: w, bits, levels, step, standard, label }
}

// ---------------------------------------------------------------------------
// RC filter model
// ---------------------------------------------------------------------------

import { rcWireToLevel } from './rc'
export { RC_MIN, RC_MAX, rcLevelToWire, rcWireToLevel } from './rc'

export interface RawRcInfo {
  wire: number
  level: number
  standard: boolean
  label: string
}

export function describeRawRc(wire: number): RawRcInfo {
  const w = Math.max(0, Math.min(255, Math.round(wire)))
  const standard = (w >= 1 && w <= 21) || w === 0
  const level = rcWireToLevel(w)
  const label =
    w === 0
      ? 'unset / factory byte (displayed as neutral)'
      : standard
        ? `level ${level > 0 ? `+${level}` : `${level}`}${level === 0 ? ' (neutral)' : ''}`
        : `wire ${w} → level ${level} clamped (experimental, outside 1..21)`
  return { wire: w, level, standard, label }
}

/** X grid of the 5 firmware curve slots (bytes +14..+23). */
export const HW_CURVE_XS: ReadonlyArray<number> = [0, 64, 128, 191, 255]

export const DESIGN_MIN_POINTS = 2
export const DESIGN_MAX_POINTS = 10

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)))
}

function cleanDesign(design: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  return [...design]
    .map((p) => ({ x: clampByte(p.x), y: clampByte(p.y) }))
    .sort((a, b) => a.x - b.x)
    .filter((p, i, arr) => i === 0 || p.x !== arr[i - 1].x)
}

/**
 * Shared monotone-cubic core: cleaned control points plus an evaluator.
 * Returns null for degenerate designs (<2 distinct points).
 */
function buildMonoSpline(
  design: Array<{ x: number; y: number }>
): { pts: Array<{ x: number; y: number }>; at: (x: number) => number } | null {
  const pts = cleanDesign(design)
  if (pts.length < 2) return null
  const n = pts.length
  const sec: number[] = []
  for (let i = 0; i < n - 1; i++) sec.push((pts[i + 1].y - pts[i].y) / (pts[i + 1].x - pts[i].x))
  // Endpoint tangents follow the end segments; interior tangents are the
  // secant average, zeroed at direction changes and limited to 3× the
  // smaller neighbour secant — the Fritsch–Carlson monotonicity gate.
  const tan: number[] = new Array(n)
  tan[0] = sec[0]
  tan[n - 1] = sec[n - 2]
  for (let i = 1; i < n - 1; i++) {
    if (sec[i - 1] === 0 || sec[i] === 0 || Math.sign(sec[i - 1]) !== Math.sign(sec[i])) {
      tan[i] = 0
    } else {
      const lim = 3 * Math.min(Math.abs(sec[i - 1]), Math.abs(sec[i]))
      tan[i] = Math.max(-lim, Math.min(lim, (sec[i - 1] + sec[i]) / 2))
    }
  }
  const at = (x: number): number => {
    if (x <= pts[0].x) return pts[0].y
    if (x >= pts[n - 1].x) return pts[n - 1].y
    let i = 0
    while (i < n - 2 && x > pts[i + 1].x) i++
    const x0 = pts[i].x
    const h = pts[i + 1].x - x0
    const s = (x - x0) / h
    const s2 = s * s
    const s3 = s2 * s
    return (
      (2 * s3 - 3 * s2 + 1) * pts[i].y +
      (s3 - 2 * s2 + s) * h * tan[i] +
      (-2 * s3 + 3 * s2) * pts[i + 1].y +
      (s3 - s2) * h * tan[i + 1]
    )
  }
  return { pts, at }
}

/**
 * Resample a free-point design polyline down to the 5 firmware slots.
 *
 * The pad stores five straight-line segments on a fixed X grid. Fit the
 * interior heights to reduce worst-case deviation from the design; keep
 * endpoints pinned. Designs already on the grid remain exact. Degenerate
 * designs fall back to linear. Adapted from upstream fa5049f.
 */
export function resampleCurve(
  design: Array<{ x: number; y: number }>,
  xs: ReadonlyArray<number> = HW_CURVE_XS
): Array<{ x: number; y: number }> {
  const pts = [...design]
    .map((p) => ({ x: clampByte(p.x), y: clampByte(p.y) }))
    .sort((a, b) => a.x - b.x)
    .filter((p, i, arr) => i === 0 || p.x !== arr[i - 1].x)
  if (pts.length < 2) return HW_CURVE_XS.map((x) => ({ x, y: x }))
  const at = (x: number): number => {
    if (x <= pts[0].x) return pts[0].y
    for (let i = 1; i < pts.length; i++) {
      if (x <= pts[i].x) {
        const a = pts[i - 1]
        const b = pts[i]
        const t = (x - a.x) / (b.x - a.x)
        return a.y + t * (b.y - a.y)
      }
    }
    return pts[pts.length - 1].y
  }
  // Naive sample first: optimal already for on-slot/smooth designs, and the
  // starting point the descent only ever improves on.
  const y = xs.map((x) => at(x))
  // Worst deviation of the current slot heights over an x-range.
  const worst = (yy: number[], xa: number, xb: number): number => {
    let m = 0
    const lo = Math.max(0, Math.ceil(Math.min(xa, xb)))
    const hi = Math.min(255, Math.floor(Math.max(xa, xb)))
    for (let x = lo; x <= hi; x++) {
      let seg = yy[yy.length - 1]
      for (let i = 1; i < xs.length; i++) {
        if (x <= xs[i]) {
          const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1])
          seg = yy[i - 1] + t * (yy[i] - yy[i - 1])
          break
        }
      }
      const d = Math.abs(at(x) - seg)
      if (d > m) m = d
    }
    return m
  };
  // Coordinate descent: each free node minimizes the worst deviation over
  // its two adjacent segments (convex in the node height: ternary search).
  for (let sweep = 0; sweep < 25; sweep++) {
    let moved = false
    for (let i = 1; i < xs.length - 1; i++) {
      const xa = xs[i - 1]
      const xb = xs[i + 1]
      let lo = 0
      let hi = 255
      for (let it = 0; it < 40; it++) {
        const m1 = lo + (hi - lo) / 3
        const m2 = hi - (hi - lo) / 3
        const save = y[i]
        y[i] = m1
        const e1 = worst(y, xa, xb)
        y[i] = m2
        const e2 = worst(y, xa, xb)
        y[i] = save
        if (e1 < e2) hi = m2
        else lo = m1
      }
      const nv = (lo + hi) / 2
      if (Math.abs(nv - y[i]) > 1e-9) {
        y[i] = nv
        moved = true
      }
    }
    if (!moved) break
  }
  return xs.map((x, i) => ({ x, y: clampByte(y[i]) }))
}

/**
 * Resample a free-point design through a smooth spline down to the firmware
 * slots — the Marius-style "curves" feel on GameSir hardware.
 *
 * Same input/output contract as resampleCurve, but segments are joined with
 * a monotone cubic (Fritsch–Carlson tangents) instead of straight lines, so
 * corners between control points round off instead of kinking. Monotone
 * designs stay monotone: the output never wiggles backwards, it just bends
 * more smoothly. A degenerate design (<2 distinct points) falls back to
 * linear, exactly like resampleCurve.
 *
 * The pad still stores 5 linear segments, so this is honest smoothing within
 * the hardware's resolution — the orange overlay in the UI is exactly what
 * gets written, spline or not.
 */
export function resampleSpline(
  design: Array<{ x: number; y: number }>,
  xs: ReadonlyArray<number> = HW_CURVE_XS
): Array<{ x: number; y: number }> {
  const s = buildMonoSpline(design)
  if (!s) return HW_CURVE_XS.map((x) => ({ x, y: x }))
  return xs.map((x) => ({ x, y: clampByte(s.at(x)) }))
}

/**
 * Dense trace of the same spline for drawing: `samples + 1` evenly spaced
 * points across 0–255. Powers the smooth red design line in the graph so
 * what you drag is what the spline sampler writes.
 */
export function traceSpline(
  design: Array<{ x: number; y: number }>,
  samples = 64
): Array<{ x: number; y: number }> {
  const s = buildMonoSpline(design)
  if (!s) return [{ x: 0, y: 0 }, { x: 255, y: 255 }]
  const out: Array<{ x: number; y: number }> = []
  for (let i = 0; i <= samples; i++) {
    const x = (i * 255) / samples
    out.push({ x, y: clampByte(s.at(x)) })
  }
  return out
}

/** Insert a point at the middle of the longest segment (up to MAX). */
export function addDesignPoint(design: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {  if (design.length >= DESIGN_MAX_POINTS) return [...design]
  const pts = [...design].sort((a, b) => a.x - b.x)
  let best = 0
  let bestGap = -1
  for (let i = 1; i < pts.length; i++) {
    const gap = pts[i].x - pts[i - 1].x
    if (gap > bestGap) {
      bestGap = gap
      best = i
    }
  }
  const a = pts[best - 1] ?? { x: 0, y: 0 }
  const b = pts[best] ?? { x: 255, y: 255 }
  const mid = { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) }
  return [...pts.slice(0, best), mid, ...pts.slice(best)]
}

export const RC_PRESETS: ReadonlyArray<{ name: string; level: number; hint: string }> = [
  { name: '−10', level: -10, hint: 'negative endpoint' },
  { name: '−5', level: -5, hint: 'negative midpoint' },
  { name: 'Neutral 0', level: 0, hint: 'neutral stored setting' },
  { name: '+5', level: 5, hint: 'positive midpoint' },
  { name: '+10', level: 10, hint: 'positive endpoint' }
]

/**
 * Outer threshold as a signed buffer %, Steam-style:
 * "width of the outer buffer defining the boundary of max stick input".
 *
 * Positive buffer B: max output starts at (100−B)% deflection — hotter rim.
 *   → End = (100−B)%, output ceiling untouched.
 * Negative buffer −B: max output is soft-capped at (100−B)% — tames the rim,
 *   exactly the zone where extra yaw/pitch-style effects bite.
 *   → End stays 100%, output ceiling (endAnti) = (100−B)%.
 * Zero / infinite: no software boundary — the pad's full physical range.
 *   → End 100%, ceiling 100%. "Infinite" is just these neutral bytes.
 *
 * All values in percent; bytes are tenths. begin/beginAnti untouched.
 */
export const OUTER_MIN = -100
export const OUTER_MAX = 95

export function outerBufferToBytes(bufferPct: number): { end: number; endAnti: number } {
  const b = Math.max(OUTER_MIN, Math.min(OUTER_MAX, bufferPct))
  if (b >= 0) return { end: Math.round((100 - b) * 10), endAnti: 1000 }
  return { end: 1000, endAnti: Math.round((100 + b) * 10) }
}

/** Recover the buffer from pad bytes. Neutral (1000/1000) reads as 0 = unlimited. */
export function outerBufferFromBytes(end: number, endAnti: number): number {
  if (endAnti < 1000) return endAnti / 10 - 100
  return 100 - end / 10
}

export function isOuterUnlimited(end: number, endAnti: number): boolean {
  return end === 1000 && endAnti === 1000
}

export const OUTER_PRESETS: ReadonlyArray<{ name: string; buffer: number; hint: string }> = [
  { name: 'Flick +35', buffer: 35, hint: 'max at 65% deflection' },
  { name: 'Hot +20', buffer: 20, hint: 'max at 80% deflection' },
  { name: 'Mild +10', buffer: 10, hint: 'max at 90% deflection' },
  { name: 'Neutral 0', buffer: 0, hint: 'full physical range' },
  { name: 'Cap −10', buffer: -10, hint: 'output tops at 90%' },
  { name: 'Cap −25', buffer: -25, hint: 'output tops at 75%' }
]
