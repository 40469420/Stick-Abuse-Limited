import assert from 'node:assert/strict'
import { parseProfile, serializeProfile, fun } from '../src/shared/profile'
import { rcLevelToWire, rcWireToLevel, measureRcRest } from '../src/shared/rc'

for (const model of ['G7ProCE', 'G7ProS', 'T3CE']) {
  const length = model === 'T3CE' ? 1935 : 1070
  for (let level = -10; level <= 10; level++) {
    const input = Uint8Array.from({ length }, (_, i) => (i * 37 + 19) & 255)
    input.fill(0, 0, 32) // Valid empty UTF-16 name; arbitrary bytes are not a valid name fixture.
    const p = parseProfile(input, model)
    fun.extend.setLsRcLevel(p.funData, level)
    const output = serializeProfile(p)
    assert.equal(output[49], level + 11)
    assert.equal(fun.extend.lsRcLevel(p.funData), level)
    assert.ok(output.every((v, i) => i === 49 || v === input[i]), `${model}: left changed other bytes`)
    fun.extend.setRsRcLevel(p.funData, -level)
    const both = serializeProfile(p)
    assert.equal(both[50], 11 - level)
    assert.ok(both.every((v, i) => i === 49 || i === 50 || v === input[i]), `${model}: right changed other bytes`)
  }
  for (const value of [0, 22, 255]) {
    const input = new Uint8Array(length)
    input[49] = value; input[50] = value
    const p = parseProfile(input, model)
    fun.extend.lsRcLevel(p.funData)
    assert.deepEqual(serializeProfile(p), input, 'Reading must preserve unknown/unset bytes')
  }
}
assert.equal(rcWireToLevel(0), 0)
assert.equal(rcLevelToWire(0), 11)
assert.equal(rcLevelToWire(-99), 1)
assert.equal(rcLevelToWire(99), 21)
assert.throws(() => rcLevelToWire(NaN), RangeError)
assert.throws(() => rcLevelToWire(Infinity), RangeError)
assert.equal(measureRcRest([]), null)
assert.equal(measureRcRest([{ x: 128, y: 128 }]), null)
assert.equal(measureRcRest([{ x: NaN, y: 128 }, { x: 128, y: 128 }]), null)
const still = measureRcRest([{ x: 131, y: 132 }, { x: 131, y: 132 }])!
assert.equal(still.rms, 0)
assert.equal(still.centerOffset, 5)
assert.equal(still.spanX, 0)
const noise = measureRcRest([{ x: 127, y: 128 }, { x: 129, y: 128 }])!
assert.equal(noise.rms, 1)
assert.equal(noise.spanX, 2)
assert.equal(noise.centerOffset, 0)
console.log('RC: all 21 levels, byte isolation across 3 models, preservation and rest-noise statistics passed.')
