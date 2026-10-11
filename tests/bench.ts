import assert from 'node:assert/strict'
import { analyzeCapture, distribution, type BenchSample } from '../src/shared/bench'
import { BenchSession } from '../src/main/bench-session'
import { validateXInputBench } from '../src/main/bench-xinput'

const near = (a: number, b: number): void => assert(Math.abs(a - b) < 1e-9, `${a} != ${b}`)
const d = distribution([1, 2, 3, 4])!
near(d.median, 2.5); near(d.p95, 3.85); near(d.p99, 3.97); near(d.stdDev, Math.sqrt(1.25))
assert.equal(d.histogram.reduce((a, b) => a + b, 0), 4)
assert.equal(distribution([]), null)
assert.throws(() => distribution([NaN])); assert.throws(() => distribution([-1]))
const sample = (t: number, x = 0, y = 0, lt = 0): BenchSample => ({ t, axes: [x, y, 0, 0], triggers: [lt, 0] })
const fast = analyzeCapture(Array.from({ length: 8000 }, (_, i) => sample(i * .125, i % 2 / 32768)), 1000, 'timing')
near(fast.reportHz, 8000); near(fast.intervals!.median, .125); assert.equal(fast.trace.length, 2000)
near(fast.axes[0].smallestStep!, 1 / 32768)
const idle = analyzeCapture(Array.from({ length: 500 }, (_, i) => sample(i * 2, .1)), 1000, 'rest')
near(idle.reportHz, 500); near(idle.changedHz, 0); near(idle.repeatedPercent, 100)
near(idle.sticks[0].centerOffset, .1); near(idle.sticks[0].rmsNoise, 0)
const noise = analyzeCapture([sample(0, -.01), sample(2, .01)], 4, 'rest')
near(noise.sticks[0].rmsNoise, .01)
const circle = analyzeCapture(Array.from({ length: 360 }, (_, i) => sample(i, .95 * Math.cos(i * Math.PI / 180), .95 * Math.sin(i * Math.PI / 180))), 360, 'range')
near(circle.sticks[0].angularCoverage, 1); near(circle.sticks[0].circularityError!, .05)
assert.equal(circle.sticks[1].circularityError, null, 'no circularity score without coverage')
const release = analyzeCapture([sample(0, 1), sample(2, .6), sample(4, -.12), ...Array.from({ length: 105 }, (_, i) => sample(6 + i * 2))], 220, 'release')
assert.equal(release.sticks[0].releases, 1); near(release.sticks[0].oppositePeak!, .12); near(release.sticks[0].settleMs!, 4)
const truncated = analyzeCapture([sample(0, 1), sample(2, .6), sample(4, 0)], 6, 'release')
assert.equal(truncated.sticks[0].settleMs, null, 'a short centered tail is not proof of settling')
const trigger = analyzeCapture([sample(0, 0, 0, 0), sample(1, 0, 0, .6), sample(2, 0, 0, 1), sample(3, 0, 0, .1)], 4, 'triggers')
assert.equal(trigger.triggerTransitions[0], 2); assert.equal(trigger.triggers[0].max, 1)
assert.throws(() => analyzeCapture([sample(2), sample(1)], 3, 'rest'))
assert.throws(() => analyzeCapture([sample(0), sample(1, 2)], 3, 'rest'))
assert.throws(() => analyzeCapture([], 1000, 'rest'))

const valid = { slot: 0, durationMs: 1000, polls: 4, packetChanges: 3, stickChanges: [2, 1], pollHz: 4, changeHz: 3,
  calls: distribution([.01, .01, .01, .01]), pollIntervals: distribution([250, 250, 250]), intervals: distribution([250, 250]) }
assert.deepEqual(validateXInputBench(valid), valid)
assert.throws(() => validateXInputBench({ ...valid, changeHz: 8000 }), 'never accept a fabricated target rate')
assert.throws(() => validateXInputBench({ ...valid, packetChanges: 5 }))
assert.throws(() => validateXInputBench({ ...valid, intervals: { ...valid.intervals, p95: NaN } }))
const codes = validateXInputBench({ ...valid, axisCodes: [[0,16],[-16,0],[0],[0]], axisRms: [8,8,0,0] }).codes!
assert.equal(codes[0].lattice, 16); assert.equal(codes[0].count, 4); assert.equal(codes[0].rms, 8)
assert.throws(() => validateXInputBench({ ...valid, axisCodes: [[32768],[0],[0],[0]], axisRms: [0,0,0,0] }))
assert.throws(() => validateXInputBench({ ...valid, axisCodes: [[0],[0],[0],[0]], axisRms: [NaN,0,0,0] }))

let now = 0
const snapshots: unknown[] = []
const session = new BenchSession(v => snapshots.push(v), () => now)
const input = { live: true, centerRaw: { lx: 0, ly: 0, rx: 0, ry: 0 }, lt: 0, rt: 0 }
session.push(input); assert.equal(session.active, false)
session.start('page-a'); now = 1; session.push(input); now = 3; session.push(input); now = 1000; session.tick()
assert.equal((snapshots[0] as { reportHz: number }).reportHz, 2)
const cancelled = session.startCapture('page-a', 'rest', 5)
const cancellation = assert.rejects(cancelled, /cancelled/)
session.stop('old-page'); assert.equal(session.active, true, 'stale cleanup cannot stop a newer page')
session.stop('page-a'); await cancellation; assert.equal(session.measuring, false)
session.start('page-b')
let nativeCancelled = false; session.cancelJob = () => { nativeCancelled = true }
now = 5001; session.tick(); assert.equal(session.active, false); assert(nativeCancelled, 'expired renderer lease cancels native reader')
assert.throws(() => session.require('page-b'))
session.start('page-c')
const lost = session.startCapture('page-c', 'timing', 5)
const lostCheck = assert.rejects(lost, /stopped/)
session.push({ ...input, live: false }); await lostCheck
session.stop()
console.log('Bench: 8K timing, percentiles/jitter, repeats, noise, circularity coverage, snapback, trigger crossings, native validation and page-lease cancellation passed.')
