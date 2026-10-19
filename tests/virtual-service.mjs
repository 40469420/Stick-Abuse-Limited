import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdtempSync,copyFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const dir=mkdtempSync(join(tmpdir(),'sal-virtual-')),root=join(dir,'host'),data=join(dir,'data');mkdirSync(root);copyFileSync('build/virtual/ViGEmClient.dll',join(root,'ViGEmClient.dll'));writeFileSync(join(root,'virtual-host.exe'),'test placeholder')
const calls=[];globalThis.__virtual={calls,failProbe:false}
const result=await build({entryPoints:['src/main/virtual-controller.ts'],bundle:true,platform:'node',format:'cjs',write:false,plugins:[{name:'fake-native',setup(b){b.onResolve({filter:/^node:child_process$/},()=>({path:'spawn',namespace:'fake'}));b.onLoad({filter:/.*/,namespace:'fake'},()=>({contents:String.raw`import {EventEmitter} from 'node:events';export function spawn(file,args){const p=new EventEmitter();p.stdout=new EventEmitter();p.stderr=new EventEmitter();p.stdin=new EventEmitter();p.stdin.destroyed=false;p.stdin.writableLength=0;p.stdin.write=s=>{globalThis.__virtual.calls.push({frame:s})};p.stdin.end=s=>{globalThis.__virtual.calls.push({stop:s});queueMicrotask(()=>p.emit('close',0))};p.kill=()=>p.emit('close',1);globalThis.__virtual.calls.push({file,args});if(args[0]==='--run')globalThis.__virtual.running=p;setTimeout(()=>{if(args[0]==='--probe'){p.stdout.emit('data',Buffer.from(globalThis.__virtual.failProbe?'{}':'{"available":true}'));p.emit('close',globalThis.__virtual.failProbe?1:0)}else{p.stdout.emit('data',Buffer.from('{"ready":true}\n'))}},1);return p}`,loader:'js'}))}}]})
const m={exports:{}};new Function('module','exports','require',result.outputFiles[0].text)(m,m.exports,(await import('node:module')).createRequire(import.meta.url));const {VirtualControllerService}=m.exports
const fetchBefore=globalThis.fetch
try{
 const states=[],s=new VirtualControllerService(root,()=>data,v=>states.push(v));s.load();assert.equal(s.status.active,false);assert.equal((await s.check()).available,true)
 const config={...s.status.config,bindings:[{source:9,macro:{version:1,enabled:true,pressToTrigger:true,cycle:false,cycleTime:0,steps:[{data:10,hold:100,delay:0}]}}]};s.save(config);const physical={live:true,recordKeys:[],timestamp:Date.now(),centerRaw:{lx:0,ly:0,rx:0,ry:0}}
 await s.start('test pad',0x10c5);assert(calls.some(c=>c.args?.[0]==='--run'&&c.args[3]==='4293'),'native source guard receives the actual connected controller product ID');s.input(physical);assert(s.status.active);s.input({...physical,recordKeys:[9]});assert(calls.some(c=>c.frame&&JSON.parse(c.frame).codes.includes(10)))
 s.pause(true);assert.deepEqual(JSON.parse(calls.filter(c=>c.frame).at(-1).frame).codes,[]);s.pause(false)
 assert.throws(()=>s.save({...config,slot:1}));await s.stop();assert(!s.status.active);assert(calls.some(c=>c.stop==='stop\n'))
 s.selectModel('T3CE');assert.equal(s.status.config.bindings.length,0);s.selectModel('G7ProCE');assert.equal(s.status.config.bindings.length,1)
 const restored=new VirtualControllerService(root,()=>data,()=>{});restored.load();assert.equal(restored.status.active,false);assert.equal(restored.status.config.bindings[0].source,9)
 await s.start('test pad');s.input({...physical,live:false});await new Promise(r=>setTimeout(r,5));assert(!s.status.active)
 s.save({...config,bindings:[{source:9,macro:{...config.bindings[0].macro,steps:[{data:50,hold:100,delay:0}]}}]});await s.start('keyboard test');s.input(physical);s.input({...physical,recordKeys:[9]});assert(calls.some(c=>c.frame&&JSON.parse(c.frame).keys.includes(27)))
 globalThis.__virtual.running.emit('close',1);await new Promise(r=>setTimeout(r,5));assert(!s.status.active);assert(calls.some(c=>c.args?.[0]==='--release'&&c.args[1]==='27'),'abnormal worker exit requests emergency key-up')
 const before=calls.length;globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer});await s.install();assert(!calls.slice(before).some(c=>c.file?.includes('powershell')),'untrusted installer never executes');assert(!s.status.active)
 globalThis.__virtual.failProbe=true;assert.equal((await s.check()).available,false)
 console.log('Virtual service: driver checks, config persistence/model separation, start/stop, recording pause, disconnect release and installer hash rejection passed. Native I/O mocked.')
}finally{globalThis.fetch=fetchBefore;delete globalThis.__virtual;rmSync(dir,{recursive:true,force:true})}
