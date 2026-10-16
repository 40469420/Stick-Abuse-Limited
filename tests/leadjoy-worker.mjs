import { build } from 'esbuild'
import { Worker } from 'node:worker_threads'
import { mkdirSync,rmSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
const folder=resolve('.leadjoy-worker-test');mkdirSync(folder,{recursive:true})
try{
 const output=resolve(folder,'worker.cjs')
 await build({entryPoints:['src/main/leadjoy-worker.ts'],bundle:true,platform:'node',format:'cjs',outfile:output,plugins:[{name:'fake-hid',setup(b){b.onResolve({filter:/^node-hid$/},()=>({path:'hid',namespace:'fake'}));b.onLoad({filter:/.*/,namespace:'fake'},()=>({contents:`export default {devices:()=>[{path:'keyboard',vendorId:0x4131,productId:0x3519,usagePage:1,usage:6},{path:'valid',vendorId:0x4131,productId:0x3519,usagePage:0xff80,usage:1}],HID:class {constructor(){throw new Error('SIMULATED_OPEN_ONLY')}}}`,loader:'js'}))}}]})
 async function run(workerData){const w=new Worker(output,{workerData});try{return await new Promise((resolve,reject)=>{w.once('message',resolve);w.once('error',reject)})}finally{await w.terminate()}}
 const wrong=await run({path:'keyboard',slot:0});assert.equal(wrong.ok,false);assert.match(wrong.error,/no longer present/)
 for(const edit of [{kind:'button',id:999,target:{t:2,code:1}},{kind:'stick',side:2,patch:{ci:1}},{kind:'trigger',zones:{leftInner:-1,leftOuter:100,rightInner:0,rightOuter:100}}]){const v=await run({path:'valid',slot:0,edits:[edit]});assert.equal(v.ok,false);assert(!v.error.includes('SIMULATED_OPEN_ONLY'),'invalid writes rejected before opening')}
 const valid=await run({path:'valid',slot:0});assert.match(valid.error,/SIMULATED_OPEN_ONLY/)
 console.log('LeadJoy worker: wrong HID collections and malformed writes rejected before handle open; no hardware accessed.')
}finally{rmSync(folder,{recursive:true,force:true})}
