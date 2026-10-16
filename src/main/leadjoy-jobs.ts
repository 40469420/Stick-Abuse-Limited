import { Worker } from 'node:worker_threads'
import type { LjRequest,LjResult } from '../shared/leadjoy-api'
export function runLeadJoy(workerPath:string,req:LjRequest):Promise<LjResult>{
 return new Promise((resolve,reject)=>{
  const worker=new Worker(workerPath,{workerData:req});let settled=false
  const finish=(error?:Error,result?:LjResult):void=>{if(settled)return;settled=true;clearTimeout(timer);void worker.terminate();if(error)reject(error);else resolve(result!)}
  const timer=setTimeout(()=>finish(new Error('LeadJoy operation timed out. Write outcome may be unknown; reconnect and read before retrying.')),180000)
  worker.on('message',v=>v.ok?finish(undefined,v.result):finish(new Error(v.error)))
  worker.on('error',error=>finish(error));worker.on('exit',()=>{if(!settled)finish(new Error('LeadJoy worker exited before a result.'))})
 })
}
