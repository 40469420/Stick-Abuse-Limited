import { parentPort, workerData } from 'node:worker_threads'
import HID from 'node-hid'
import { ljReadSnapshot, ljWriteButtonVerified, ljWriteStickVerified, ljWriteTriggerVerified } from './leadjoy'
import { ljButtonWriteRecord, LJ_VID, LJ_PID_SABER_PLUS, LJ_USAGE_PAGE, LJ_USAGE } from '../shared/leadjoy'
import { validateLeadJoyRequest, type LjRequest } from '../shared/leadjoy-api'
async function run():Promise<void>{
 let written=0
 try {
  const req=validateLeadJoyRequest(workerData)
  if(!HID.devices().some(d=>d.path===req.path && d.vendorId===LJ_VID && d.productId===LJ_PID_SABER_PLUS && d.usagePage===LJ_USAGE_PAGE && d.usage===LJ_USAGE)) throw new Error('The Saber Plus command interface is no longer present.')
  for(const edit of req.edits??[]) {
   if(edit.kind==='button') await ljWriteButtonVerified(req.path,req.slot,ljButtonWriteRecord(edit.id,edit.target))
   else if(edit.kind==='stick') await ljWriteStickVerified(req.path,req.slot,edit.side,edit.patch)
   else if(edit.kind==='trigger') await ljWriteTriggerVerified(req.path,req.slot,edit.zones)
   else throw new Error('Unknown LeadJoy edit')
   written++
  }
  parentPort?.postMessage({ok:true,result:{snapshot:await ljReadSnapshot(req.path,req.slot),written}})
 }catch(e){parentPort?.postMessage({ok:false,error:`${(e as Error).message} (${written} earlier edit(s) verified; current edit may be unconfirmed. Re-read before retrying.)`})}
}
void run()
