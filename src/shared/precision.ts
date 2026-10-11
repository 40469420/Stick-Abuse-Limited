/** Output-code evidence, never an estimate of physical ADC resolution. */
export interface CodeEvidence {
  count: number; unique: number; min: number; max: number; span: number
  smallestStep: number | null; stepP10: number | null; stepMedian: number | null
  lattice: number | null; lowNibbleValues: number; rms: number
}
export function axisCode(v: number): number { return Math.round(v * (v > 0 ? 32767 : 32768)) }
function gcd(a: number, b: number): number { while (b) { const t = a % b; a = b; b = t } return a }
export function codeEvidence(codes: readonly number[], count = codes.length, rms?: number): CodeEvidence {
  if (!codes.length || codes.some(v => !Number.isInteger(v) || v < -32768 || v > 32767)) throw new Error('Invalid axis codes.')
  const sorted = [...new Set(codes)].sort((a, b) => a - b), steps = sorted.slice(1).map((v, i) => v - sorted[i]).sort((a, b) => a - b)
  const mean = codes.reduce((a, b) => a + b, 0) / codes.length
  return { count, unique: sorted.length, min: sorted[0], max: sorted[sorted.length - 1], span: sorted[sorted.length - 1] - sorted[0],
    smallestStep: steps[0] ?? null, stepP10: steps.length ? steps[Math.floor((steps.length - 1) * .1)] : null,
    stepMedian: steps.length ? steps[Math.floor((steps.length - 1) * .5)] : null,
    lattice: steps.length ? steps.reduce(gcd) : null, lowNibbleValues: new Set(sorted.map(v => v & 15)).size,
    rms: rms ?? Math.sqrt(codes.reduce((a, v) => a + (v - mean) ** 2, 0) / codes.length) }
}
export interface PrecisionPair { rest: CodeEvidence[]; sweep: CodeEvidence[] }
export function comparePrecision(base: PrecisionPair, test: PrecisionPair): Array<{ verdict: string; reason: string }> {
  return base.sweep.map((b, i) => {
    const t = test.sweep[i], br = base.rest[i], tr = test.rest[i]
    if (!t || !br || !tr || Math.min(b.count, t.count, br.count, tr.count) < 100 || Math.min(b.span, t.span) < 26000 || Math.min(b.unique, t.unique) < 100 || Math.max(br.span, tr.span) > 6554 ||
      Math.min(b.span, t.span) / Math.max(b.span, t.span) < .8 || !b.stepP10 || !t.stepP10 || !b.lattice || !t.lattice)
      return { verdict: 'Inconclusive', reason: 'Repeat with still rest captures and wider, comparable slow sweeps on this axis.' }
    const finer = t.stepP10 < b.stepP10 && t.lattice < b.lattice
    const noisier = tr.rms > br.rms * 1.5 + 1
    if (noisier) return { verdict: 'Additional noise observed', reason: finer ? 'Smaller output steps also appeared, but rest noise increased. Usable precision is not established.' : 'Rest noise increased without consistent evidence of finer output steps.' }
    if (finer) return { verdict: 'Finer reported output', reason: 'Both the lower step percentile and output-code lattice became finer. Repeat the test; interpolation and noise can still explain extra codes.' }
    if (b.stepP10 === t.stepP10 && b.lattice === t.lattice) return { verdict: 'No measurable change', reason: 'Observed step spacing and code lattice stayed the same. This does not prove the setting is ignored in every condition.' }
    return { verdict: 'Inconclusive', reason: 'Output spacing changed without consistent evidence of finer precision. Repeat with matched movement.' }
  })
}
