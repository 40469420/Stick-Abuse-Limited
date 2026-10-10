import assert from 'node:assert/strict'
import { RcCapture } from '../src/main/rc-capture'

let clock = 0
const service = new RcCapture(5, () => clock)
const sample = { lx: 128, ly: 128, rx: 128, ry: 128, live: true }
const result = service.start('all-reports', () => true)
await assert.rejects(service.start('overlap', () => true), /already running/)
// Only one report contains a spike. A latest-value display stream can miss it.
for (let i = 0; i < 1500; i++) service.push({ ...sample, rx: i === 7 ? 138 : 128 })
service.push({ ...sample, live: false })
service.push({ ...sample, rx: NaN })
clock = 3000
const captured = await result
assert.equal(captured.right.count, 1500)
assert.equal(captured.left.count, 1500)
assert.equal(captured.right.spanX, 10)
assert.ok(captured.right.rms > 0)
assert.equal(captured.left.rms, 0)
assert.equal(captured.reportHz, 500)
assert.equal(captured.durationMs, 3000)

const cancelled = service.start('cancel', () => true)
service.cancel('cancel')
await assert.rejects(cancelled, /cancelled/)
// Cancelling an old request cannot stop a newer capture.
const newer = service.start('new', () => true)
service.cancel('cancel')
for (let i = 0; i < 40; i++) service.push(sample)
clock += 3000
assert.equal((await newer).left.count, 40)

let valid = true
const changed = service.start('connection-change', () => valid)
valid = false
service.push(sample)
await assert.rejects(changed, /connection changed/)
await assert.rejects(service.start('disconnected', () => false), /Connect/)
await assert.rejects(service.start('silent', () => true), /Not enough/)
console.log('RC capture: counts all reports, catches a single-report spike, handles overlap, cancellation, reconnect and silence.')
