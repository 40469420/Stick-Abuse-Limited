// Spline/linear toggle stacking check: staging must overwrite, never compose.
import { Packet, stick } from '../src/shared/profile'
import { resampleCurve, resampleSpline } from '../src/shared/sticklab'

let failures = 0
function check(name: string, cond: boolean): void {
  if (cond) console.log(`✓ ${name}`)
  else {
    console.error(`✗ ${name}`)
    failures++
  }
}

// kinked design whose x's MISS the hardware slots, so smoothing genuinely
// differs from straight segments at the sampled positions
const design = [{ x: 0, y: 0 }, { x: 96, y: 100 }, { x: 128, y: 120 }, { x: 200, y: 200 }, { x: 255, y: 255 }]
const frozen = JSON.stringify(design)

function stage(p: Packet, useSpline: boolean): void {
  const q = useSpline ? resampleSpline(design) : resampleCurve(design)
  stick.setCurve(p, q.map((x) => ({ ...x })))
  stick.markCurveIdentity(p)
}

const snap = (p: Packet): string => JSON.stringify(stick.curve(p))

// samplers never mutate the design
resampleCurve(design)
resampleSpline(design)
check('design untouched by both samplers', JSON.stringify(design) === frozen)

// toggle does something real on a kinked design
const p0 = new Packet(new Uint8Array(36))
stage(p0, false)
const linearBytes = snap(p0)
const p1 = new Packet(new Uint8Array(36))
stage(p1, true)
const splineBytes = snap(p1)
check('spline output differs from linear on kinked design', linearBytes !== splineBytes)

// toggle forth and back lands on EXACT bytes — nothing stacks
const p = new Packet(new Uint8Array(36))
stage(p, false)
check('L baseline', snap(p) === linearBytes)
stage(p, true)
check('L->S', snap(p) === splineBytes)
stage(p, false)
check('L->S->L restores exact linear bytes', snap(p) === linearBytes)
stage(p, true)
check('L->S->L->S restores exact spline bytes', snap(p) === splineBytes)
for (let i = 0; i < 5; i++) stage(p, true)
check('5x spline staging is a fixed point', snap(p) === splineBytes)

// linear-module transform is reset identically by both modes
check(
  'identity transform after both modes',
  JSON.stringify(stick.linearModule(p)) === JSON.stringify({ en: true, type: 0, rate: 100 })
)

if (failures > 0) {
  console.error(`${failures} FAILURES`)
  process.exit(1)
} else console.log('ALL SPLINE-MODE TESTS PASSED')
