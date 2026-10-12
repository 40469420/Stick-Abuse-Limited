// Center trim command: [0x0F, 0xE2, stick, direction, magHi, magLo, 0...].
//
// Recovered from GameSir Connect 1.16.7's Km() builder
// (n[0]=15, n[1]=226, magnitude u16 BE, called as Km(stick, dir, 32)):
// stick 0 = Left, 1 = Right; direction 0 = left, 1 = right, 2 = up, 3 = down.
// The pad acks with type 227 (SetStickCenterAck in Connect's report parser).
import { setStickCenter, CENTER_NUDGE, CenterStick, CenterDirection, Resp, REPORT_LENGTH } from '../src/shared/protocol'

let failed = 0
function check(name: string, cond: boolean): void {
  if (cond) console.log(`✓ ${name}`)
  else {
    console.log(`✗ FAIL: ${name}`)
    failed++
  }
}

// default nudge: left stick, left, 32 units
{
  const r = setStickCenter(0, 0)
  check('64-byte report', r.length === REPORT_LENGTH)
  check('header is 0F E2', r[0] === 0x0f && r[1] === 0xe2)
  check('stick/dir/mag bytes', r[2] === 0 && r[3] === 0 && r[4] === 0 && r[5] === 32)
  check('tail is zero', r.slice(6).every((b) => b === 0))
}

// right stick, down, custom magnitude
{
  const r = setStickCenter(CenterStick.Right, CenterDirection.Down, 100)
  check('right/down/100 placed', r[2] === 1 && r[3] === 3 && r[4] === 0 && r[5] === 100)
}

// clamping, never garbage on the wire
{
  const r = setStickCenter(5, 9, -10)
  check('stick defaults to Left unless 1', r[2] === 0)
  check('direction clamped 0-3', r[3] === 3)
  check('magnitude floored at 0', r[4] === 0 && r[5] === 0)
  const big = setStickCenter(0, 0, 0x1234)
  check('magnitude u16 BE', big[4] === 0x12 && big[5] === 0x34)
}

// constants
{
  check('CENTER_NUDGE is 32 (Connect parity)', CENTER_NUDGE === 32)
  check('ack type is 227', Resp.SetStickCenterAck === 227)
}

if (failed > 0) {
  console.log(`${failed} FAILURES`)
  process.exit(1)
}
console.log('ALL CENTER TRIM TESTS PASSED')
