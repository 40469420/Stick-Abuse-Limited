import assert from 'node:assert/strict'
import { axisCode, codeEvidence, comparePrecision } from '../src/shared/precision'
import { analyzeCapture } from '../src/shared/bench'
const sweep = (step: number) => codeEvidence(Array.from({ length: Math.floor(60000 / step) }, (_, i) => -30000 + i * step))
const rest = (scale = 0) => codeEvidence(Array.from({ length: 1000 }, (_, i) => i % 2 ? scale : -scale))
const pair = (step: number, noise = 0) => ({ sweep: Array.from({ length: 4 }, () => sweep(step)), rest: Array.from({ length: 4 }, () => rest(noise)) })
assert.equal(axisCode(-1), -32768); assert.equal(axisCode(1), 32767)
for (let v = -32768; v <= 32767; v++) assert.equal(axisCode(v / (v > 0 ? 32767 : 32768)), v)
assert.equal(sweep(16).lattice, 16)
assert.equal(sweep(16).lowNibbleValues, 1)
assert.equal(sweep(1).lowNibbleValues, 16)
assert.equal(comparePrecision(pair(16), pair(16))[0].verdict, 'No measurable change')
assert.equal(comparePrecision(pair(16), pair(4))[0].verdict, 'Finer reported output')
assert.equal(comparePrecision(pair(16), pair(4, 20))[0].verdict, 'Additional noise observed')
const narrow = pair(4); narrow.sweep[0] = rest()
assert.equal(comparePrecision(pair(16), narrow)[0].verdict, 'Inconclusive')
const moved = pair(4); moved.rest[0] = sweep(1)
assert.equal(comparePrecision(pair(16), moved)[0].verdict, 'Inconclusive')
assert.throws(() => codeEvidence([NaN])); assert.throws(() => codeEvidence([32768])); assert.throws(() => codeEvidence([]))
// Evidence comes from all samples, not the decimated graph trace.
const capture = analyzeCapture(Array.from({ length: 5000 }, (_, i) => ({ t: i, axes: [i / 32767, 0, 0, 0], triggers: [0, 0] })), 5000, 'timing')
assert.equal(capture.codes![0].unique, 5000); assert.ok(capture.trace.length < 5000)
console.log('Bit-depth evidence: signed-code roundtrip, quantization, noise, insufficient movement and full-sample analysis passed.')
