import assert from 'node:assert/strict'
import { Packet, macro, trigger } from '../src/shared/profile'
import { BINDING_KEYS, keyboardCode, originalButtonKeys, setBinding } from '../src/shared/bindings'
import { readMacro, writeMacro, validateMacro, SequenceRecorder, type MacroDocument } from '../src/shared/macros'
import { neutralRcProfile } from '../src/main/rc-reset'

assert.equal(new Set(BINDING_KEYS.map((k) => k.value)).size, BINDING_KEYS.length)
for (const [code, value] of [['KeyQ', 78], ['KeyA', 92], ['KeyZ', 105], ['Digit0', 73], ['ControlLeft', 116], ['ArrowRight', 131], ['Numpad9', 148]] as const) assert.equal(keyboardCode(code), value)
assert.equal(BINDING_KEYS.find((k) => k.label === 'Mouse button 4')?.value, 204)
assert.equal(BINDING_KEYS.find((k) => k.label === 'Mouse button 5')?.value, 203)
const t = new Packet(Uint8Array.from({ length: 32 }, (_, i) => i * 7))
const beforeTrigger = t.bytes.slice()
setBinding(t, [116, 92, 0], true, false)
assert.deepEqual(trigger.mapValues(t), [116, 92, 0])
for (let i = 0; i < 32; i++) if (![11, 12, 13, 14].includes(i)) assert.equal(t.bytes[i], beforeTrigger[i], `trigger byte ${i} preserved`)
assert.equal(t.u8(11) & 254, beforeTrigger[11] & 254)
const p = new Packet(Uint8Array.from({ length: 169 }, (_, i) => (i * 13) & 255))
const doc: MacroDocument = { version: 1, enabled: true, pressToTrigger: true, cycle: true, cycleTime: 65535, steps: Array.from({ length: 32 }, (_, i) => ({ data: 9 + i, hold: 65535 - i, delay: i === 31 ? 0 : i * 27 })) }
const highFlags = p.u8(7) & 248
writeMacro(p, doc)
assert.deepEqual(readMacro(p), doc)
assert.equal(p.u8(7) & 248, highFlags)
assert.equal(p.bytes.length, 169)
assert.equal(p.u8(166), 40)
assert.equal(p.u16be(167), 65504)
assert.equal(p.bit(2, 0), false)
assert.equal(p.bit(0, 0), false)
const written = p.bytes.slice()
assert.throws(() => writeMacro(p, { ...doc, steps: doc.steps.map((s, i) => i === 31 ? { ...s, delay: 1 } : s) }), /no delay field/)
assert.deepEqual(p.bytes, written, 'failed validation must be atomic')
for (const value of [-1, 65536, NaN, 1.2]) assert.throws(() => validateMacro({ ...doc, cycleTime: value }))
assert.throws(() => validateMacro({ ...doc, steps: [...doc.steps, doc.steps[0]] }), /32 steps/)
setBinding(p, [255, 0, 0], false, true)
assert.equal(macro.macroEnabled(p), false)
assert.deepEqual(readMacro(p).steps, doc.steps, 'rebinding retains disabled macro steps')
const rec = new SequenceRecorder()
rec.push([], 0); rec.push([9], 100); rec.push([9], 130); rec.push([], 175); rec.push([10], 225)
assert.deepEqual(rec.finish(260), [{ data: 9, hold: 75, delay: 50 }, { data: 10, hold: 35, delay: 0 }])
assert.throws(() => new SequenceRecorder().push([9, 10], 0), /Overlapping/)
const limit = new SequenceRecorder()
for (let i = 0; i < 32; i++) { limit.push([9], i * 10); limit.push([], i * 10 + 5) }
assert.throws(() => limit.push([10], 330), /32-step/)
const raw = new Uint8Array(64); raw[0] = 0x12; raw[58] = 8
assert.deepEqual(originalButtonKeys(raw), [])
raw[58] = 0x28; raw[59] = 0x81; raw[60] = 0x18; raw[63] = 3
assert.deepEqual(originalButtonKeys(raw), [9, 5, 8, 17, 18, 31, 32])
raw[58] = 1; raw[59] = raw[60] = raw[63] = 0
assert.deepEqual(originalButtonKeys(raw), [41], 'diagonal is one macro step')
const profile = Uint8Array.from({ length: 1070 }, (_, i) => i & 255)
const reset = neutralRcProfile(profile)!
for (let i = 0; i < 1070; i++) assert.equal(reset[i], i === 49 || i === 50 ? 11 : profile[i])
assert.notEqual(reset, profile)
assert.equal(profile[49], 49)
assert.equal(neutralRcProfile(reset), null, 'neutral profiles skip EEPROM writes')
reset[49] = 0; assert.equal(neutralRcProfile(reset), null)
assert.throws(() => neutralRcProfile(new Uint8Array(1935)), /Unsupported/)
console.log('Custom controls: binding catalog, trigger isolation, 32-step macro boundaries, atomic validation, recording and RC reset byte preservation passed.')
