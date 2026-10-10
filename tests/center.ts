import assert from 'node:assert/strict'
import { centerNudge, centerPreview, checkCenterAck, type CenterDirection } from '../src/shared/center'

for (const side of [0, 1]) {
  for (const [direction, value] of Object.entries({ left: 0, right: 1, up: 2, down: 3 })) {
    const report = centerNudge(side, direction as CenterDirection)
    assert.equal(report.length, 64)
    assert.deepEqual(report.slice(0, 6), [15, 226, side, value, 0, 32])
    assert(report.slice(6).every((v) => v === 0))
  }
}
assert.throws(() => centerNudge(2, 'left'))
assert.throws(() => centerNudge(0, 'constructor' as CenterDirection))
assert.throws(() => centerNudge(0, 'diagonal' as CenterDirection))
const raw = new Uint8Array(64)
raw[0] = 0x12
for (let i = 0; i < 4; i++) raw[54 + i] = 128
assert.deepEqual(centerPreview(raw), { lx: 0, ly: 0, rx: 0, ry: 0 })
raw[26] = 1
assert.equal(centerPreview(raw)!.lx, 1 / 32767, 'preserves the original low byte')
raw[55] = 0
raw[56] = 255; raw[28] = 255
assert.equal(centerPreview(raw)!.ly, -1)
assert.equal(centerPreview(raw)!.rx, 1)
assert.equal(centerPreview(raw.slice(0, 63)), undefined)
checkCenterAck(Uint8Array.from([0x10, 0xe3, 0]))
for (const bytes of [[0x10, 0xe3, 1], [0x10, 6, 0], [0x10, 0xe3], [0x12, 0xe3, 0]]) {
  assert.throws(() => checkCenterAck(Uint8Array.from(bytes)))
}
console.log('Center offsets: eight commands, input validation, original-axis precision and acknowledgment handling passed.')
