import type {WebHidDevice} from './hid-types'
export const devices = new Map<string,WebHidDevice>()
let nextId=0
export function remember(device:WebHidDevice):string {
  for(const [path,value] of devices)if(value===device)return path
  const path=`webhid-${++nextId}`;devices.set(path,device);return path
}
export function discover(){return [...devices].map(([path,d])=>({path,productId:d.productId,preferred:true,product:d.productName,manufacturer:undefined,live:null}))}
type Listener=(value:any)=>void
/** Browser replacement for hid.ts; all framing and controller logic stays shared. */
export class Transport {
  private device:WebHidDevice|null=null
  private listeners=new Map<string,Set<Listener>>()
  private queue:Promise<void>=Promise.resolve()
  private epoch=0
  private heartbeatTimer:ReturnType<typeof setInterval>|null=null
  currentPath:string|null=null
  get isOpen(){return this.device!==null}
  on(name:string,fn:Listener){if(!this.listeners.has(name))this.listeners.set(name,new Set());this.listeners.get(name)!.add(fn);return this}
  emit(name:string,value?:unknown){for(const fn of this.listeners.get(name)??[])fn(value)}
  private subscribe(name:string,fn:Listener){this.on(name,fn);return()=>{this.listeners.get(name)?.delete(fn)}}
  onResponse(fn:Listener){return this.subscribe('response',fn)}
  onInput(fn:Listener){return this.subscribe('input',fn)}
  onError(fn:Listener){return this.subscribe('error',fn)}
  private input=(event:Event)=>{
    const e=event as Event & {reportId:number;data:DataView}
    const frame=new Uint8Array(e.data.byteLength+1);frame[0]=e.reportId;frame.set(new Uint8Array(e.data.buffer,e.data.byteOffset,e.data.byteLength),1)
    if(e.reportId===16)this.emit('response',frame)
    else if(e.reportId===18)this.emit('input',frame)
  }
  open(path:string):void {
    this.close()
    const device=devices.get(path);if(!device)throw Error('Select the controller again with Connect controller.')
    this.device=device;this.currentPath=path;const epoch=this.epoch
    device.addEventListener('inputreport',this.input)
    this.queue=this.queue.catch(()=>{}).then(async()=>{if(epoch!==this.epoch)return;if(!device.opened)await device.open()})
    void this.queue.catch(e=>this.fail(e,epoch))
  }
  private fail(error:unknown,epoch:number){if(epoch!==this.epoch)return;this.emit('error',error instanceof Error?error:Error(String(error)));this.close();this.emit('disconnected')}
  write(report:number[]|Uint8Array):void {
    const device=this.device;if(!device)throw Error('Controller disconnected')
    if(report.length>64||report[0]!==15)throw Error('Invalid controller report')
    const payload=new Uint8Array(63);payload.set(Array.from(report).slice(1));const epoch=this.epoch
    this.queue=this.queue.then(async()=>{if(epoch!==this.epoch)throw Error('Controller session changed');await device.sendReport(15,payload)})
    void this.queue.catch(e=>this.fail(e,epoch))
  }
  heartbeat(){if(this.isOpen)this.write([15,242,0])}
  startHeartbeat(ms=500){this.stopHeartbeat();this.heartbeatTimer=setInterval(()=>this.heartbeat(),ms);this.heartbeat()}
  stopHeartbeat(){if(this.heartbeatTimer)clearInterval(this.heartbeatTimer);this.heartbeatTimer=null}
  close(){this.epoch++;this.stopHeartbeat();const device=this.device;this.device=null;this.currentPath=null;if(device){device.removeEventListener('inputreport',this.input);this.queue=this.queue.catch(()=>{}).then(async()=>{if(device.opened)await device.close()});void this.queue.catch(()=>{})}}
}
