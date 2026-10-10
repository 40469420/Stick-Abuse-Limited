/** Profile encoding, not a model of the controller's filter algorithm. */
export const RC_MIN = -10
export const RC_MAX = 10

export function rcLevelToWire(level: number): number {
  if (!Number.isFinite(level)) throw new RangeError('RC level must be finite')
  return Math.max(1, Math.min(21, Math.round(level) + 11))
}

export function rcWireToLevel(wire: number): number {
  return wire === 0 ? 0 : Math.max(RC_MIN, Math.min(RC_MAX, wire - 11))
}

export interface RcMeasurement {
  count: number
  meanX: number
  meanY: number
  rms: number
  spanX: number
  spanY: number
  centerOffset: number
}

/** Units are vendor-report axis counts (0–255), not milliseconds or ADC bits. */
export function measureRcRest(samples: ReadonlyArray<{ x: number; y: number }>): RcMeasurement | null {
  if (samples.length < 2 || samples.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null
  const count = samples.length
  const meanX = samples.reduce((sum, p) => sum + p.x, 0) / count
  const meanY = samples.reduce((sum, p) => sum + p.y, 0) / count
  let variance = 0
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of samples) {
    variance += (p.x - meanX) ** 2 + (p.y - meanY) ** 2
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
  }
  return { count, meanX, meanY, rms: Math.sqrt(variance / count), spanX: maxX - minX,
    spanY: maxY - minY, centerOffset: Math.hypot(meanX - 128, meanY - 128) }
}
