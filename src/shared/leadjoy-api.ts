import { ljButtonWriteRecord, ljValidateCurveWire, ljValidateShape } from './leadjoy'
import type { LjButtonTarget, LjStickPatch, LjTriggerZones, LjSnapshot } from './leadjoy'
export type LjEdit = {kind:'button';id:number;target:LjButtonTarget} | {kind:'stick';side:0|1;patch:LjStickPatch} | {kind:'trigger';zones:LjTriggerZones}
export interface LjRequest {path:string;slot:0|1|2;edits?:LjEdit[]}
export interface LjResult {snapshot:LjSnapshot;written:number}

export function validateLeadJoyRequest(value: unknown): LjRequest {
 if(!value||typeof value!=='object') throw new Error('Invalid LeadJoy request')
 const req=value as LjRequest
 if(typeof req.path!=='string'||!req.path.length||req.path.length>4096||![0,1,2].includes(req.slot)||req.edits&&(!Array.isArray(req.edits)||req.edits.length>25))throw new Error('Invalid LeadJoy request')
 for(const edit of req.edits??[]) {
  if(!edit||typeof edit!=='object')throw new Error('Invalid LeadJoy edit')
  if(edit.kind==='button')ljButtonWriteRecord(edit.id,edit.target)
  else if(edit.kind==='stick') {
   if(![0,1].includes(edit.side)||!edit.patch||typeof edit.patch!=='object')throw new Error('Invalid LeadJoy stick edit')
   for(const [key,value] of Object.entries(edit.patch)) {
    if(key==='cv')ljValidateCurveWire(value)
    else if(key==='ci')ljValidateShape(value)
    else if(['mm','xr','yr','rjc'].includes(key)){if(value!==0&&value!==1)throw new Error('Invalid LeadJoy flag')}
    else if(['mse','asf'].includes(key)){if(typeof value!=='number'||!Number.isInteger(value)||value<0||value>100)throw new Error('Invalid LeadJoy scale')}
    else throw new Error('Unsupported LeadJoy stick field')
   }
  } else if(edit.kind==='trigger') {
   for(const key of ['leftInner','leftOuter','rightInner','rightOuter'] as const){const v=edit.zones?.[key];if(!Number.isInteger(v)||v<0||v>100)throw new Error('Invalid LeadJoy trigger range')}
  } else throw new Error('Unsupported LeadJoy edit')
 }
 return req
}
