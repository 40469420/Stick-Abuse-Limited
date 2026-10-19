import {parseProfile,button,trigger,macro as hardwareMacro} from '../src/shared/profile'
import assert from 'node:assert/strict'
import {emptyVirtualConfig,validateVirtualConfig,VirtualMacroEngine,virtualSources,virtualKey,virtualSuppression} from '../src/shared/virtual-controller'
const doc={version:1 as const,enabled:true,pressToTrigger:true,cycle:false,cycleTime:0,steps:[{data:10,hold:20,delay:10},{data:11,hold:30,delay:0}]}
const config=validateVirtualConfig({...emptyVirtualConfig(),bindings:[{source:9,macro:doc}]})
assert(virtualSources('G7ProCE').some(s=>s.value===9));assert(virtualSources('T3CE').some(s=>s.value===37));assert(!virtualSources('T3CE').some(s=>s.value===38))
const e=new VirtualMacroEngine(config);e.input([9],1);assert.deepEqual(e.tick(1).codes,[],'held on startup does not fire');e.input([],2);e.input([9],10)
assert.deepEqual(e.tick(10).codes,[10]);assert.deepEqual(e.tick(30).codes,[]);assert.deepEqual(e.tick(40).codes,[11]);assert.deepEqual(e.tick(70).codes,[])
e.input([],80);e.input([9],90);e.tick(90);assert.deepEqual(e.tick(1000).codes,[],'stall releases outputs');e.reset();assert.deepEqual(e.tick(1001).codes,[])
const held=new VirtualMacroEngine({...config,bindings:[{source:9,macro:{...doc,pressToTrigger:false}}]});held.input([],0);held.input([9],1);assert.deepEqual(held.tick(1).codes,[10]);held.input([],2);assert.deepEqual(held.tick(2).codes,[])
const loop=new VirtualMacroEngine({...config,bindings:[{source:9,macro:{...doc,cycle:true,cycleTime:10,steps:[{data:10,hold:10,delay:0}]}}]});loop.input([],0);loop.input([9],1);assert.deepEqual(loop.tick(1).codes,[10]);assert.deepEqual(loop.tick(11).codes,[]);assert.deepEqual(loop.tick(21).codes,[10]);loop.input([],22);loop.input([9],23);assert.deepEqual(loop.tick(23).codes,[],'second press stops toggle loop')
const overlap=new VirtualMacroEngine({...config,bindings:[{source:9,macro:doc},{source:12,macro:doc}]});overlap.input([],0);overlap.input([9],1);overlap.tick(1);overlap.input([9,12],5);assert.deepEqual(overlap.tick(5).codes,[10]);assert.deepEqual(overlap.tick(21).codes,[10],'other binding retains shared output')
assert.throws(()=>validateVirtualConfig({...config,slot:4}));assert.throws(()=>validateVirtualConfig({...config,hz:999}));assert.throws(()=>validateVirtualConfig({...config,bindings:[...config.bindings,...config.bindings]}));assert.throws(()=>validateVirtualConfig({...config,bindings:[{source:9,macro:{...doc,steps:[{data:255,hold:1,delay:0}]}}]}));assert.equal(virtualKey(0),null)
console.log('Virtual macros: arbitrary button sources, edge/hold/toggle timing, shared outputs, stall/reset releases and invalid-config rejection passed.')

const p=()=>parseProfile(new Uint8Array(1070),'G7ProCE')
const remapped=p();button.setMap(remapped.functionKeys[0],[9,0,0]);button.setTurbo(remapped.buttons[1],true,5)
assert.deepEqual(virtualSuppression(remapped,{...config,bindings:[]}),{},'plain forwarding preserves remaps/turbo')
const unrelated={...config,bindings:[{source:11,macro:doc}]}
assert.deepEqual(virtualSuppression(remapped,unrelated),{11:[11]},'unrelated rear remap and turbo do not block PC macro')
assert.throws(()=>virtualSuppression(remapped,config),/shares.*FL1/,'cannot suppress A when a rear button also outputs A')
const bound=p();button.setMap(bound.buttons[8],[10,0,0]);button.setMap(bound.buttons[9],[255,0,0])
assert.deepEqual(virtualSuppression(bound,config),{9:[10]},'remapped trigger suppresses its actual firmware output')
button.setToggle(bound.buttons[8],true);assert.throws(()=>virtualSuppression(bound,config),/turbo\/toggle/)
const keyboard=p();button.setMap(keyboard.buttons[8],[50,0,0]);assert.throws(()=>virtualSuppression(keyboard,config),/keyboard\/mouse/)
const analog=p();trigger.setToggle(analog.triggers[0],true);assert.throws(()=>virtualSuppression(analog,{...config,bindings:[{source:19,macro:doc}]}),/turbo\/toggle/)
const m=p();hardwareMacro.setFlags(m.functionKeys[0],{macro:true});assert.throws(()=>virtualSuppression(m,config),/hardware macro on FL1/)
const disabled={...config,bindings:[{source:9,macro:{...doc,enabled:false}}]};assert.deepEqual(virtualSuppression(m,disabled),{})
assert.deepEqual(virtualSuppression(p(),{...config,bindings:[{source:40,macro:doc}]}),{40:[1,3]},'D-pad diagonal suppression covers both constituent directions')
console.log('Profile-compatible virtual macros: unrelated mappings/turbo pass through, remapped output suppression and specific collision/keyboard/toggle/macro errors passed.')
