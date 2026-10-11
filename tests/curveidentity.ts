// Curve identity: curve writes must reset the linear-module transform bytes,
// and the raw state must be the calibrated identity (not a bare enable flip).
import { Packet, stick, LINEAR_CURVE } from '../src/shared/profile'

let failed = 0
function check(name: string, cond: boolean): void {
  if (cond) console.log(`✓ ${name}`)
  else {
    console.log(`✗ FAIL: ${name}`)
    failed++
  }
}

function blankStick(): Packet {
  return new Packet(new Uint8Array(36))
}

// applyPhysics produces the full raw identity state
{
  const p = blankStick()
  stick.applyPhysics(p)
  const lm = stick.linearModule(p)
  check('physics: linear module en=1/type=0/rate=100', lm.en && lm.type === 0 && lm.rate === 100)
  const dz = stick.deadzone(p)
  check('physics: deadzone 0/1000/0/1000', dz.begin === 0 && dz.end === 1000 && dz.beginAnti === 0 && dz.endAnti === 1000)
  check('physics: dead_en on (else firmware falls back to 5%)', stick.deadEnabled(p))
  check('physics: linear points', JSON.stringify(stick.curve(p)) === JSON.stringify(LINEAR_CURVE.map((q) => ({ ...q }))))
  check('physics: axis ratio neutral 50', stick.axisRatio(p) === 50)
}

// a GameSir-shaped state (like profile_1 stick1: type=3/rate=74) is NOT raw,
// and rewriting identity over it heals it
{
  const p = blankStick()
  stick.setEnabled(p, true)
  stick.setDeadzone(p, { begin: 0, end: 1000, beginAnti: 0, endAnti: 1000 })
  stick.setCurve(p, [
    { x: 38, y: 46 }, { x: 77, y: 82 }, { x: 128, y: 122 }, { x: 179, y: 176 }, { x: 217, y: 219 }
  ])
  stick.setLinearModule(p, true, 3, 74)
  stick.setAxisRatio(p, 50)
  check('shaped state is not raw', !stick.isRawState(p))
  check('shaped state is not identity curve', !stick.isIdentityCurve(p))
  // what every curve Send now does: points + identity mark
  stick.setCurve(p, LINEAR_CURVE.map((q) => ({ ...q })))
  stick.markCurveIdentity(p)
  check('rewritten linear is identity curve', stick.isIdentityCurve(p))
}

// legacy bypass (stick_en clear, written by older app versions) still reads as raw
{
  const p = blankStick()
  stick.applyPhysics(p)
  stick.setEnabled(p, false)
  check('legacy stick_en=0 reads as raw', stick.isRawState(p))
}

// full raw write path: physics + enabled + round gate reads as raw
{
  const p = blankStick()
  stick.setLinearModule(p, true, 1, 65)
  stick.setDeadzone(p, { begin: 50, end: 800, beginAnti: 80, endAnti: 1000 })
  stick.applyPhysics(p)
  stick.setEnabled(p, true)
  stick.setSquareGate(p, false)
  check('raw write path reads as raw', stick.isRawState(p))
  const lm = stick.linearModule(p)
  check('raw write path: b11/b12/b13 = 1/0/100', p.u8(11) === 1 && lm.type === 0 && lm.rate === 100)
}

// square gate or leftover deadzone disqualifies raw
{
  const p = blankStick()
  stick.applyPhysics(p)
  stick.setEnabled(p, true)
  stick.setSquareGate(p, true)
  check('square gate is not raw', !stick.isRawState(p))
  stick.setSquareGate(p, false)
  stick.setDeadzone(p, { begin: 50, end: 1000, beginAnti: 0, endAnti: 1000 })
  check('5% deadzone is not raw', !stick.isRawState(p))
}

if (failed > 0) {
  console.log(`${failed} FAILURES`)
  process.exit(1)
}
console.log('ALL CURVE IDENTITY TESTS PASSED')
