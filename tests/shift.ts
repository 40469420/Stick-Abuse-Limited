import assert from 'node:assert/strict'
import { Packet, parseProfile, serializeProfile, button, trigger, macro } from '../src/shared/profile'
import { setShiftBinding, hasShiftBinding, copyToShift, SHIFT_SLOT } from '../src/shared/shift'
import { readProfileCommands, writeProfileCommands } from '../src/shared/protocol'
assert.equal(SHIFT_SLOT,5)
for(const isTrigger of [false,true]) for(const isFunction of [false,true]) {
 if(isTrigger&&isFunction) continue
 const p=new Packet(new Uint8Array(isTrigger?32:isFunction?169:7).fill(0xa0))
 const before=p.bytes.slice(), access=isTrigger?trigger:button
 setShiftBinding(p,isTrigger,isFunction,false)
 assert.deepEqual(access.mapValues(p),[231,0,0]);assert.equal(access.toggleOnPress(p),false)
 setShiftBinding(p,isTrigger,isFunction,true);assert.equal(access.toggleOnPress(p),true)
 if(isFunction) assert.equal(macro.macroEnabled(p),false)
 const allowed=isTrigger?[0,1,11,12,13,14,15]:isFunction?[0,1,2,3,4,5,6,7]:[0,1,2,3,4,5,6]
 for(let i=0;i<p.length;i++) if(!allowed.includes(i)) assert.equal(p.u8(i),before[i])
}
const bytes=new Uint8Array(1070);bytes[49]=11;bytes[50]=11
const profile=parseProfile(bytes,'G7ProCE')
assert.equal(hasShiftBinding(profile),false)
setShiftBinding(profile.functionKeys[0],false,true,true)
assert.equal(hasShiftBinding(profile),true)
profile.functionKeys[0].bytes[120]=77
const original=serializeProfile(profile), copy=copyToShift(original)
assert.equal(hasShiftBinding(parseProfile(copy,'G7ProCE')),false)
assert.equal(copy[176+120],77,'copy preserves macro steps')
assert.notDeepEqual(copy,original);assert.equal(hasShiftBinding(parseProfile(original,'G7ProCE')),true)
assert.throws(()=>copyToShift(new Uint8Array(1935)))
assert.ok(readProfileCommands(5).every(c=>c[2]===5))
assert.ok(writeProfileCommands(5,copy).every(c=>c[2]===5))
console.log('Shift: hold/toggle bytes, unrelated fields, copy isolation, recursion removal and slot-5 commands passed.')

const mp=parseProfile(new Uint8Array(1070),'G7ProCE')
macro.setFlags(mp.functionKeys[0],{macro:true});macro.setStepCount(mp.functionKeys[0],1);macro.setStep(mp.functionKeys[0],0,231,50,0)
assert.equal(hasShiftBinding(mp),true,'macro Shift output is conservatively considered reachable')
assert.equal(hasShiftBinding(parseProfile(copyToShift(serializeProfile(mp)),'G7ProCE')),false)
