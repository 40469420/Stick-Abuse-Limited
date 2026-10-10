import assert from 'node:assert/strict'
import { summarizeXInput } from '../src/main/xinput'

const samples = Array.from({ length: 40 }, (_, i) => [i % 2, 0, -32768, 32767])
const result = summarizeXInput(0, { samples, durationMs: 3000, packetChanges: 39 })
assert.equal(result.left.count, 40)
assert.equal(result.left.spanX, 1 / 256, 'retains sub-vendor-count precision')
assert.equal(result.left.rms, 1 / 512, 'does not apply a deadzone')
assert.equal(result.right.meanX, 0)
assert.equal(result.right.meanY, 1 / 256, 'signed axes normalize without overflow')
assert.equal(result.polls, 40, 'repeated states remain polls')
assert.equal(result.packetChanges, 39)
assert.throws(() => summarizeXInput(0, { samples, durationMs: 0, packetChanges: 0 }))
assert.throws(() => summarizeXInput(0, { samples: [[NaN, 0, 0, 0], ...samples], durationMs: 3000, packetChanges: 0 }))
assert.throws(() => summarizeXInput(0, { samples, durationMs: 3000, packetChanges: 40 }))
console.log('XInput precision, normalization and validation passed')
