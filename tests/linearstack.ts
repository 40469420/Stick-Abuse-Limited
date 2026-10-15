// "Two curves in Linear?" audit: what Linear mode actually writes and where
// every bend in the output path comes from. Packet-exact, no firmware model.
import { Packet, stick, LINEAR_CURVE } from '../src/shared/profile'
import { resampleCurve } from '../src/shared/sticklab'

let failures = 0
function check(name: string, cond: boolean): void {
  if (cond) console.log(`✓ ${name}`)
  else {
    console.error(`✗ ${name}`)
    failures++
  }
}

function linearPacket(): Packet {
  const p = new Packet(new Uint8Array(36))
  stick.setDeadzone(p, { begin: 50, end: 1000, beginAnti: 0, endAnti: 1000 })
  stick.setCurve(p, LINEAR_CURVE.map((q) => ({ ...q })))
  stick.markCurveIdentity(p)
  return p
}

// 1. factory+Linear packet bytes: deadzone window 5%/100%, anti neutral,
// diagonal points, identity transform — each stage pinned separately
{
  const p = linearPacket()
  const dz = stick.deadzone(p)
  check('factory window 50/1000/0/1000', dz.begin === 50 && dz.end === 1000 && dz.beginAnti === 0 && dz.endAnti === 1000)
  check('curve bytes are pure diagonal', JSON.stringify(stick.curve(p)) === JSON.stringify(LINEAR_CURVE.map((q) => ({ ...q }))))
  const lm = stick.linearModule(p)
  check('transform identity en=1/type=0/rate=100', lm.en && lm.type === 0 && lm.rate === 100)
}

// 2. staging a curve never touches the shape-processing flags: Linear
// smuggles in no second shaper — shape lives in its own bits, set by its card
{
  for (const flags of [[true, false], [true, true], [false, false]] as const) {
    const p = new Packet(new Uint8Array(36))
    stick.setEnabled(p, flags[0])
    stick.setSquareGate(p, flags[1])
    stick.setCurve(p, LINEAR_CURVE.map((q) => ({ ...q })))
    stick.markCurveIdentity(p)
    const same = stick.enabled(p) === flags[0] && stick.squareGate(p) === flags[1]
    check(`curve write preserves shape flags ${flags}`, same)
  }
}

// 3. quantization: a 5-point on-slot design survives bit-exact; a 10-point
// kinked design loses inter-slot detail to firmware re-linearization.
// Pure math on documented behavior (pad stores 5, segments are linear).
function firmwareOut(stored: Array<{ x: number; y: number }>, x: number): number {
  const pts = [...stored].sort((a, b) => a.x - b.x)
  if (x <= pts[0].x) return pts[0].y
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i].x) {
      const t = (x - pts[i - 1].x) / (pts[i].x - pts[i - 1].x)
      return pts[i - 1].y + t * (pts[i].y - pts[i - 1].y)
    }
  }
  return pts[pts.length - 1].y
}
function designOut(design: Array<{ x: number; y: number }>, x: number): number {
  const pts = [...design].sort((a, b) => a.x - b.x)
  if (x <= pts[0].x) return pts[0].y
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i].x) {
      const t = (x - pts[i - 1].x) / (pts[i].x - pts[i - 1].x)
      return pts[i - 1].y + t * (pts[i].y - pts[i - 1].y)
    }
  }
  return pts[pts.length - 1].y
}
function maxDivergence(design: Array<{ x: number; y: number }>): number {
  const stored = resampleCurve(design)
  let m = 0
  for (let x = 0; x <= 255; x++) m = Math.max(m, Math.abs(firmwareOut(stored, x) - designOut(design, x)))
  return m
}
{
  const five = LINEAR_CURVE.map((q) => ({ ...q }))
  check('5-pt on-slot design: zero divergence', maxDivergence(five) === 0)
  const ten = [
    { x: 0, y: 0 }, { x: 28, y: 40 }, { x: 55, y: 60 }, { x: 96, y: 100 },
    { x: 128, y: 120 }, { x: 160, y: 150 }, { x: 200, y: 200 }, { x: 220, y: 215 },
    { x: 240, y: 240 }, { x: 255, y: 255 }
  ]
  const div = maxDivergence(ten)
  console.log(`  (10-pt kinked design max re-linearization divergence: ${div.toFixed(2)} steps)`)
  check('10-pt kinked design: lossy but bounded (pinned 9.81)', div > 0 && div < 16 && Math.abs(div - 9.81) < 0.01)
  const smooth = [
    { x: 0, y: 0 }, { x: 30, y: 28 }, { x: 60, y: 58 }, { x: 90, y: 88 },
    { x: 128, y: 128 }, { x: 165, y: 168 }, { x: 195, y: 198 }, { x: 220, y: 222 },
    { x: 242, y: 243 }, { x: 255, y: 255 }
  ]
  const divS = maxDivergence(smooth)
  console.log(`  (10-pt near-linear design divergence: ${divS.toFixed(2)} steps)`)
  check('10-pt near-linear design: slot-miss cost small (pinned 1.24)', divS > 0 && divS < 3 && Math.abs(divS - 1.24) < 0.01)
}

if (failures > 0) {
  console.error(`${failures} FAILURES`)
  process.exit(1)
} else console.log('ALL LINEAR-STACK TESTS PASSED')
