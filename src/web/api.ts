import {Controller} from '../main/controller'
import {listCommunityProfiles,downloadCommunityProfile} from '../main/community'
import {devices,discover,remember} from './transport'
import {compatible,webHid} from './hid-types'
import {bytesToB64,b64ToBytes,type LabApi} from '../renderer/api'
import {identifyModel} from '../shared/models'
import {parseProfile} from '../shared/profile'
import {SequenceRecorder} from '../shared/macros'
import {hasShiftBinding} from '../shared/shift'

export const DESKTOP_REQUIRED='Download a local version to modify these settings'
const listeners=new Map<string,Set<(payload:never)=>void>>()
function emit(channel:string,value:unknown){for(const fn of listeners.get(channel)??[])fn(value as never)}
function unsupported():Promise<never>{return Promise.reject(Error(DESKTOP_REQUIRED))}
function saveFile(name:string,bytes:Uint8Array){const url=URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer],{type:'application/octet-stream'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
export function installWebApi():void {
 window.sticklabWeb=true
 const controller=new Controller()
 let busy=false
 let selected:string|null=null
 let lastSample=0
 let recording:{id:string;recorder:SequenceRecorder;started:number;last:number;error:string|null}|null=null
 const operation=async<T>(fn:()=>Promise<T>):Promise<T>=>{if(busy||recording)throw Error('Finish the current controller operation or recording first.');busy=true;try{return await fn()}finally{busy=false}}
 const validate=(slot:number,length:number)=>{
   const device=selected?devices.get(selected):null
   const model=device?identifyModel(device.productName,device.productId):null
   if(!model||model.support!=='full'||length!==model.profileLength||![1,2,3,4,5,32].includes(slot))throw Error('Unsupported controller profile layout')
   if(slot===5&&model.id!=='G7ProCE')throw Error('Shift requires a G7 Pro 8K')
   return model
 }
 controller.attachInputDecoder()
 controller.onInput(input=>{if(recording){try{if(!input.live||!input.recordKeys||performance.now()-recording.started>30000)throw Error('Controller recording stopped; input is stale or the time limit was reached.');recording.recorder.push(input.recordKeys,performance.now());recording.last=Date.now()}catch(e){recording.error=(e as Error).message;emit('macro:recordError',recording.error)}}if(document.hidden||performance.now()-lastSample<33)return;lastSample=performance.now();emit('input:sample',input)})
 controller.transport.on('disconnected',()=>{if(recording){recording=null;emit('macro:recordError','Controller disconnected; recording discarded.');}emit('web:disconnected',null)})
 const hid=webHid()
 hid?.addEventListener('disconnect',(event:Event)=>{const device=(event as Event&{device:unknown}).device;if(selected&&devices.get(selected)===device){controller.disconnect();emit('web:disconnected',null)}})
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&recording){recording=null;emit('macro:recordError','Recording cancelled when the page was hidden.')}})
 window.addEventListener('pagehide',()=>controller.disconnect())
 window.addEventListener('beforeunload',event=>{if(busy){event.preventDefault();event.returnValue=''}})
 const bridge:Partial<LabApi>={
   requestController:async()=>{
     if(!window.isSecureContext)throw Error('WebHID requires HTTPS or localhost.')
     if(!hid)throw Error('Use desktop Chrome or Edge to connect with WebHID.')
     const selectedDevices=await hid.requestDevice({filters:[{vendorId:0x3537,usagePage:0xfff0,usage:0x40}]})
     for(const d of selectedDevices.filter(compatible))remember(d)
     return selectedDevices.filter(compatible).map(d=>discover().find(c=>c.path===remember(d))!)
   },
   discover:async()=>{for(const d of await hid?.getDevices()??[])if(compatible(d))remember(d);return discover()},
   connect:(path)=>operation(async()=>{if(!devices.has(path))throw Error('Select a controller first.');selected=path;try{return await controller.connect(path)}catch(e){selected=null;throw e}}),
   disconnect:()=>operation(async()=>{await controller.exitConfig(true);controller.disconnect();selected=null;return true}),
   readProfile:(slot,total=1070)=>operation(async()=>{if(!Number.isInteger(total)||total<100||total>4096||!Number.isInteger(slot)||slot<1||slot>32)throw Error('Invalid profile read');const bytes=await controller.readProfile(slot,total);return {bytes:bytesToB64(bytes),length:bytes.length}}),
   writeProfile:(slot,base64,length=1070)=>operation(async()=>{
     const model=validate(slot,length),bytes=b64ToBytes(base64)
     if(bytes.length!==length)throw Error('Profile length mismatch')
     if(slot===5&&hasShiftBinding(parseProfile(bytes,model.id)))throw Error('The Shift layer cannot contain another Shift activation binding.')
     const before=await controller.readProfile(slot,length)
     // Persist rollback bytes before starting any browser write. Refuse if storage is unavailable.
     localStorage.setItem('sal.web.write-backup',JSON.stringify({slot,productId:devices.get(selected!)!.productId,bytes:bytesToB64(before),at:new Date().toISOString()}))
     return controller.writeProfileVerified(slot,bytes,length)
   }),
   switchProfile:(slot)=>operation(async()=>{if(!Number.isInteger(slot)||slot<1||slot>4)throw Error('Invalid active profile');await controller.switchProfile(slot);return true}),
   currentProfile:()=>operation(()=>controller.getCurrentProfile()),
   adjustCenter:(side,direction)=>operation(async()=>{const d=selected?devices.get(selected):null;if(!d||identifyModel(d.productName,d.productId)?.id!=='G7ProCE')throw Error('Center offsets require a G7 Pro 8K');await controller.adjustCenter(side,direction);return true}),
   startMacroRecording:async(id)=>{
     const device=selected?devices.get(selected):null, sample=controller.latestInput
     if(busy||recording)throw Error('Finish the current operation first.')
     if(!device||identifyModel(device.productName,device.productId)?.id!=='G7ProCE')throw Error('Controller recording requires a G7 Pro 8K.')
     if(!sample?.live||!sample.recordKeys||Date.now()-sample.timestamp>1000)throw Error('Wait for live controller input.')
     if(sample.recordKeys.length)throw Error('Release all controller buttons first.')
     recording={id,recorder:new SequenceRecorder(),started:performance.now(),last:Date.now(),error:null};return true
   },
   stopMacroRecording:async(id)=>{
     if(!recording||recording.id!==id)throw Error('Recording is no longer active')
     const captured=recording;recording=null
     if(captured.error)throw Error(captured.error)
     if(!controller.isOpen||Date.now()-captured.last>1000||performance.now()-captured.started>30000)throw Error('Recording expired or input went stale.')
     return captured.recorder.finish(performance.now())
   },
   cancelMacroRecording:async(id)=>{if(recording?.id===id)recording=null;return true},
   version:async()=> '3.1.0 · WebHID beta',
   openExternal:async(url)=>{if(!/^https:\/\//.test(url))throw Error('Blocked URL');window.open(url,'_blank','noopener,noreferrer');return true},
   flyClose:async()=>true,
   pureRawStatus:async()=>({enabled:false,running:false,message:DESKTOP_REQUIRED}),
   communityProfiles:listCommunityProfiles,
   downloadCommunityProfile:async(name)=>{saveFile(name,await downloadCommunityProfile(name));return true},
   on:(channel,fn)=>{if(!listeners.has(channel))listeners.set(channel,new Set());listeners.get(channel)!.add(fn);return()=>{listeners.get(channel)?.delete(fn)}}
 }
 window.sticklab=new Proxy(bridge,{get(target,key){return target[key as keyof LabApi]??unsupported}}) as LabApi
}
