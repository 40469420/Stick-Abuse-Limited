// Spline slot sampling: smooth like the Marius curves feature, honest
// within the 5-slot hardware limit (the orange overlay is what's written).
import { resampleSpline, resampleCurve, traceSpline, HW_CURVE_XS } from '../src/shared/sticklab'

let failed = 0
function check(name: string, cond: boolean): void {
  if (cond) console.log(`✓ ${name}`)
  else {
    console.log(`✗ FAIL: ${name}`)
    failed++
  }
}

// linear design → spline is exactly linear (no fake smoothing)
{
  const design = HW_CURVE_XS.map((x) => ({ x, y: x }))
  const out = resampleSpline(design)
  check('linear design samples to identity slots', JSON.stringify(out) === JSON.stringify(HW_CURVE_XS.map((x) => ({ x, y: x }))))
}

// endpoints pinned, everything in byte range
{
  const design = [
    { x: 0, y: 0 }, { x: 64, y: 30 }, { x: 128, y: 120 }, { x: 191, y: 200 }, { x: 255, y: 255 }
  ]
  const out = resampleSpline(design)
  check('5 slot outputs', out.length === 5 && out.every((q, i) => q.x === HW_CURVE_XS[i]))
  check('endpoints pinned (0 and 255)', out[0].y === 0 && out[4].y === 255)
  check('all bytes in range', out.every((q) => q.y >= 0 && q.y <= 255))
}

// monotone design stays monotone — never wiggles backwards
{
  const design = [
    { x: 0, y: 0 }, { x: 40, y: 90 }, { x: 100, y: 110 }, { x: 180, y: 240 }, { x: 255, y: 255 }
  ]
  const out = resampleSpline(design)
  check('monotone design stays monotone', out.every((q, i) => i === 0 || q.y >= out[i - 1].y))
}

// a bent free-point design actually smooths (differs from straight segments)
{
  const design = [{ x: 0, y: 0 }, { x: 100, y: 140 }, { x: 255, y: 255 }]
  const spl = resampleSpline(design)
  const lin = resampleCurve(design)
  check('spline rounds the corners (differs from linear)', spl.some((q, i) => q.y !== lin[i].y))
  check('spline stays monotone on bent shape', spl.every((q, i) => i === 0 || q.y >= spl[i - 1].y))
}

// degenerate input falls back to linear, like resampleCurve
{
  const out = resampleSpline([{ x: 128, y: 200 }])
  check('degenerate design falls back to linear', JSON.stringify(out) === JSON.stringify(HW_CURVE_XS.map((x) => ({ x, y: x }))))
  const empty = resampleSpline([])
  check('empty design falls back to linear', JSON.stringify(empty) === JSON.stringify(HW_CURVE_XS.map((x) => ({ x, y: x }))))
}

// traceSpline: dense draw path used by the graph — same spline, more samples
{
  const design = [{ x: 0, y: 0 }, { x: 100, y: 140 }, { x: 255, y: 255 }]
  const trace = traceSpline(design, 64)
  check('trace has samples+1 points', trace.length === 65)
  check('trace endpoints pinned', trace[0].x === 0 && trace[0].y === 0 && trace[64].x === 255 && trace[64].y === 255)
  check('trace evenly spaced in x', trace.every((p, i) => Math.abs(p.x - (i * 255) / 64) < 1e-9))
  check('trace monotone on bent shape', trace.every((p, i) => i === 0 || p.y >= trace[i - 1].y))
  const slots = resampleSpline(design)
  const atSlot = (x: number): number => {
    let lo = trace[0]
    for (const p of trace) {
      if (p.x > x) break
      lo = p
    }
    return lo.y
  }
  check(
    'trace agrees with slot sampler at hardware slots',
    slots.every((q) => Math.abs(atSlot(q.x) - q.y) <= 3)
  )
  const lin = traceSpline(HW_CURVE_XS.map((x) => ({ x, y: x })), 16)
  check('trace of linear design is the diagonal (byte rounding only)', lin.every((p) => Math.abs(p.y - p.x) <= 0.5))
}

{
  const { addDesignPoint, DESIGN_MAX_POINTS } = await import('../src/shared/sticklab')
  const full = Array.from({ length: DESIGN_MAX_POINTS }, (_, i) => ({ x: i * 25, y: i * 25 }))
  const copy = addDesignPoint(full)
  check('full curve returns a new array', copy !== full)
  check('full curve keeps all points', JSON.stringify(copy) === JSON.stringify(full))
}

if (failed > 0) {
  console.log(`${failed} FAILURES`)
  process.exit(1)
}
console.log('ALL SPLINE TESTS PASSED')
