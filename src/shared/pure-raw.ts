import {stick,LINEAR_CURVE,type Packet} from './profile'
export interface PureRawStatus {enabled:boolean;running:boolean;message:string;error?:string|null}
export interface PureRawJournal {path:string;slot:number;original:number[];interim:number[]}
const same=(a:Uint8Array,b:Uint8Array):boolean=>a.length===b.length&&a.every((v,i)=>v===b[i])
export function applyPureRawProcessing(p:Packet):void {stick.setEnabled(p,true);stick.setCurve(p,LINEAR_CURVE.map(v=>({...v})));stick.markCurveIdentity(p)}
export function pureRawInterim(bytes:Uint8Array):Uint8Array|null {
 if(bytes.length!==1070)throw new Error('PureRaw recovery requires a 1070-byte G7 Pro 8K profile.')
 const interim=bytes.slice();let changed=false
 for(const offset of [0x394,0x394+36])if(!(bytes[offset]&1)){interim[offset]|=1;interim[offset+1]|=1;changed=true}
 return changed?interim:null
}
export async function recoverPureRaw(slot:number,path:string,deps:{read:()=>Promise<Uint8Array>;write:(bytes:Uint8Array)=>Promise<{verified:boolean}>;load:()=>PureRawJournal|null;allowCycle?:boolean;settle?:()=>Promise<void>;save:(value:PureRawJournal|null)=>void}):Promise<boolean>{
 let current=await deps.read();const pending=deps.load()
 const write=async(bytes:Uint8Array):Promise<void>=>{if(!(await deps.write(bytes)).verified)throw new Error('PureRaw recovery write did not verify.')}
 if(pending){
  if(pending.path!==path||pending.slot!==slot||pending.original.length!==1070||pending.interim.length!==1070||[...pending.original,...pending.interim].some(n=>!Number.isInteger(n)||n<0||n>255))throw new Error('An interrupted PureRaw recovery belongs to another device/profile or has invalid backup data. No settings were overwritten.')
  const original=Uint8Array.from(pending.original),interim=Uint8Array.from(pending.interim)
  if(!same(pureRawInterim(original)??new Uint8Array(),interim))throw new Error('Invalid PureRaw recovery backup; no settings were overwritten.')
  if(same(current,interim)){await write(original);deps.save(null);return true}
  if(!same(current,original))throw new Error('The profile changed since an interrupted PureRaw recovery. No settings were overwritten; review the recovery backup.')
  deps.save(null)
 }
 if(deps.allowCycle===false)return false
 const original=current.slice(),interim=pureRawInterim(original)
 if(!interim)return false
 deps.save({path,slot,original:Array.from(original),interim:Array.from(interim)})
 try {await write(interim);await deps.settle?.();await write(original);deps.save(null);return true}
 catch(error){
  try {current=await deps.read();if(same(current,interim))await write(original);else if(!same(current,original))throw new Error('Current bytes differ from both recovery states.');deps.save(null)}
  catch(restore){throw new Error(`PureRaw recovery stopped: ${(error as Error).message} Original settings remain backed up; restoration is unconfirmed: ${(restore as Error).message}`)}
  throw new Error(`PureRaw recovery stopped; original settings restored. ${(error as Error).message}`)
 }
}
