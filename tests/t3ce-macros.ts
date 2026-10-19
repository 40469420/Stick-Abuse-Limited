import assert from 'node:assert/strict'
import {parseProfile,serializeProfile} from '../src/shared/profile'
import {readMacro,writeMacro} from '../src/shared/macros'
import {macroTargets,bindingKeys,bindingLabel,originalButtonKeys} from '../src/shared/bindings'
const slots=['FL1','FR1','C1','C2','C3','C4','T1','T2','T3']
assert.deepEqual(macroTargets('T3CE').map(t=>t.label),slots)
assert.equal(macroTargets('G7ProCE').length,4)
assert.equal(macroTargets('T3Pro').length,0)
for(let i=0;i<9;i++){
 const bytes=Uint8Array.from({length:1935},(_,n)=>(n*17+3)&255)
 bytes.fill(0,0,32) // Valid empty UTF-8 profile name.
 const profile=parseProfile(bytes,'T3CE')
 const steps=Array.from({length:32},(_,n)=>({data:9+n%4,hold:65535-n,delay:n===31?0:123+n}))
 const doc={version:1 as const,enabled:true,pressToTrigger:true,cycle:true,cycleTime:4321,steps}
 writeMacro(profile.functionKeys[i],doc)
 assert.deepEqual(readMacro(profile.functionKeys[i]),doc)
 const out=serializeProfile(profile),start=176+i*169
 assert.deepEqual(out.slice(0,start),bytes.slice(0,start))
 assert.deepEqual(out.slice(start+169),bytes.slice(start+169))
 const roundtrip=parseProfile(out,'T3CE');assert.deepEqual(readMacro(roundtrip.functionKeys[i]),doc)
 const before=serializeProfile(roundtrip).slice()
 assert.throws(()=>writeMacro(roundtrip.functionKeys[i],{...doc,steps:[...steps,{data:9,hold:1,delay:0}]}))
 assert.deepEqual(serializeProfile(roundtrip),before)
}
assert.equal(bindingLabel(31,'T3CE'),'C1');assert.equal(bindingLabel(31),'FL2')
assert.equal(bindingLabel(37,'T3CE'),'T3');assert.equal(bindingLabel(37),'Screenshot')
assert.equal(new Set(bindingKeys('T3CE').map(k=>k.value)).size,bindingKeys('T3CE').length)
const raw=new Uint8Array(64);raw[0]=0x12;raw[58]=15
raw[63]=255;assert.deepEqual(originalButtonKeys(raw,'T3CE'),[])
raw[63]=0;for(let i=0;i<7;i++){raw[61]=1<<i;assert.deepEqual(originalButtonKeys(raw,'T3CE'),[31+i]);assert.deepEqual(originalButtonKeys(raw),[])}
raw[61]=0;raw[63]=3;assert.deepEqual(originalButtonKeys(raw),[31,32])
console.log('Tarantula macros: nine slots, 32-step roundtrip, adjacent-byte preservation, atomic validation, model-specific labels and original input decoding passed.')
