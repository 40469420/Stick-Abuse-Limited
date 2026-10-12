// Button remap: 1:1 key binding, same bytes Connect writes.
//
// Encoding (recovered from Connect 1.16.7: map_en = any target set, values
// padded to 3 with 0): byte2 bit0 = mapped, bytes 3-5 = target indices.
// Turbo (bytes 0-1) and toggle (byte 6) are never touched by this app.
import { Packet, button } from '../src/shared/profile'
import { keyLabel, displayMapping, REMAP_TARGETS } from '../src/shared/keymap'

let failed = 0
function check(name: string, cond: boolean): void {
  if (cond) console.log(`✓ ${name}`)
  else {
    console.log(`✗ FAIL: ${name}`)
    failed++
  }
}

function blankButton(): Packet {
  return new Packet(new Uint8Array(7))
}

// write path: Cross onto a blank packet
{
  const p = blankButton()
  button.setMap(p, [9, 0, 0])
  check('remap bytes are [0,0,1,9,0,0,0]', JSON.stringify(Array.from(p.bytes)) === JSON.stringify([0, 0, 1, 9, 0, 0, 0]))
  check('mapped reads back true', button.mapped(p))
  check('values read back [9,0,0]', JSON.stringify(button.mapValues(p)) === JSON.stringify([9, 0, 0]))
}

// unmap clears the bit and the values
{
  const p = blankButton()
  button.setMap(p, [9, 0, 0])
  button.setMap(p, [0, 0, 0])
  check('unmap clears mapped bit', !button.mapped(p))
  check('unmap zeroes values', JSON.stringify(button.mapValues(p)) === JSON.stringify([0, 0, 0]))
}

// turbo + toggle bytes survive a remap untouched
{
  const p = blankButton()
  button.setTurbo(p, true, 20)
  button.setToggle(p, true)
  button.setMap(p, [10, 0, 0])
  check('turbo preserved', button.turboEnabled(p) && button.turboSpeed(p) === 20)
  check('toggle preserved', button.toggleOnPress(p))
  check('map landed alongside', JSON.stringify(button.mapValues(p)) === JSON.stringify([10, 0, 0]))
}

// hardware case: Camera button holding 82 (T), as seen in profile_1.bin
{
  const p = new Packet(new Uint8Array([0x00, 0x00, 0x01, 0x52, 0x00, 0x00, 0x00]))
  check('fixture Camera maps to [82,0,0]', JSON.stringify(button.mapValues(p)) === JSON.stringify([82, 0, 0]))
  check('fixture Camera displays as T', displayMapping(button.mapValues(p)) === 'T')
}

// key labels (Connect 1.16.7 ko parity)
{
  check('0 is em-dash', keyLabel(0) === '—')
  check('9 is Cross', keyLabel(9) === 'Cross')
  check('16 is Camera', keyLabel(16) === 'Camera')
  check('17 is FL1', keyLabel(17) === 'FL1')
  check('20 is R2', keyLabel(20) === 'R2')
  check('82 is T', keyLabel(82) === 'T')
  check('204 is Mouse Button 4 (non-sequential)', keyLabel(204) === 'Mouse Button 4')
  check('203 is Mouse Button 5 (non-sequential)', keyLabel(203) === 'Mouse Button 5')
  check('255 is No change', keyLabel(255) === 'No change (NC)')
  check('29 shows raw (unverified TP)', keyLabel(29) === '#29')
  check('unknown shows #n', keyLabel(999) === '#999')
}

// tournament-safe target list: single controller keys only
{
  check('21 targets (0–20)', REMAP_TARGETS.length === 21)
  check('all targets within 0–20', REMAP_TARGETS.every((k) => k.value >= 0 && k.value <= 20))
  check('no keyboard/mouse/special targets', REMAP_TARGETS.every((k) => k.group === 'none' || k.group === 'controller' || k.group === 'function'))
}

// display strings
{
  check('empty displays as em-dash', displayMapping([0, 0, 0]) === '—')
  check('single displays plain', displayMapping([9, 0, 0]) === 'Cross')
  check('multi (Connect-written) displays joined', displayMapping([9, 10, 0]) === 'Cross + Circle')
}

if (failed > 0) {
  console.log(`${failed} FAILURES`)
  process.exit(1)
}
console.log('ALL BUTTON REMAP TESTS PASSED')
