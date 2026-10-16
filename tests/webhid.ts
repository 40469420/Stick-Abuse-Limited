import assert from 'node:assert/strict'
import {Transport,devices,remember} from '../src/web/transport'
import {compatible} from '../src/web/hid-types'
import {Controller} from '../src/main/controller'
import {installWebApi} from '../src/web/api'
class FakeDevice extends EventTarget {
 vendorId=0x3537;productId=0x10c5;productName='G7ProCE';opened=false
 collections=[{usagePage:0xfff0,usage:0x40,outputReports:[{reportId:15}],inputReports:[],children:[]}]
 bytes=Uint8Array.from({length:1070},(_,i)=>i%256);sent:Array<{id:number;data:Uint8Array}>=[];fail=false
 async open(){this.opened=true}async close(){this.opened=false}
 async sendReport(id:number,data:Uint8Array){if(this.fail)throw Error('USB write rejected');this.sent.push({id,data:data.slice()});const response=new Uint8Array(64);response[0]=16
 const cmd=data[0];if(cmd===242)return
 if(cmd===1||cmd===2||cmd===7)response[1]=6
 if(cmd===9){response[1]=10;response[2]=48;response[4]=50;response[6]=50;response[8]=57}
 if(cmd===11){response[1]=12;response[2]=1}
 if(cmd===4){response[1]=5;response[2]=data[1];response[3]=data[2];response[4]=data[3];response[5]=data[4];response.set(this.bytes.slice(data[2]*256+data[3],data[2]*256+data[3]+data[4]),6)}
 if(cmd===3){this.bytes.set(data.slice(5,5+data[4]),data[2]*256+data[3]);response[1]=6}
 this.frame(response)
 }
 frame(bytes:Uint8Array){const storage=new Uint8Array(bytes.length+7);storage.set(bytes,3);const event=new Event('inputreport');Object.assign(event,{reportId:bytes[0],data:new DataView(storage.buffer,4,bytes.length-1)});this.dispatchEvent(event)}
}
const fake=new FakeDevice();assert(compatible(fake));assert(!compatible({...fake,vendorId:1} as any));const path=remember(fake)
const controller=new Controller();const info=await controller.connect(path);assert.equal(info.firmware,'0229');assert.equal(info.currentProfile,1)
assert.deepEqual(await controller.readProfile(1),fake.bytes)
const edited=fake.bytes.slice();edited[400]=45
assert.deepEqual(await controller.writeProfileVerified(1,edited),{verified:true,rolledBack:false});assert.deepEqual(fake.bytes,edited)
assert(fake.sent.every(v=>v.id===15&&v.data.length===63))
controller.attachInputDecoder();let input:any;controller.onInput(v=>input=v);const frame=new Uint8Array(64);frame[0]=18;frame[1]=128;frame[2]=129;frame[3]=130;frame[4]=131;fake.frame(frame);assert.equal(input.lx,128);assert.equal(input.ry,131)
fake.fail=true;await assert.rejects(controller.getCurrentProfile(),/device disconnected/);assert(!controller.isOpen)
controller.disconnect();await new Promise(r=>setTimeout(r,0));fake.fail=false
const windowTarget=new EventTarget();Object.assign(windowTarget,{isSecureContext:true});Object.defineProperty(globalThis,'window',{value:windowTarget,configurable:true})
const documentTarget=new EventTarget();Object.assign(documentTarget,{hidden:false});Object.defineProperty(globalThis,'document',{value:documentTarget,configurable:true})
const hid=new EventTarget();Object.assign(hid,{getDevices:async()=>[fake],requestDevice:async()=>[fake]});Object.defineProperty(globalThis,'navigator',{value:{hid},configurable:true})
const storage=new Map<string,string>();Object.defineProperty(globalThis,'localStorage',{value:{getItem:(k:string)=>storage.get(k),setItem:(k:string,v:string)=>storage.set(k,v)},configurable:true})
installWebApi();const api=(window as any).sticklab
assert.equal((await api.requestController()).length,1);await api.connect(path)
await assert.rejects(api.flashFirmware('FLASH 2.1.0'),/Download a local version/)
await assert.rejects(api.writeProfile(1,btoa('short'),1070),/length/)
await assert.rejects(api.writeProfile(6,btoa('short'),1070),/Unsupported/)
const next=edited.slice();next[401]=88;const b64=Buffer.from(next).toString('base64');assert((await api.writeProfile(1,b64,1070)).verified);assert(storage.has('sal.web.write-backup'))
// Recording uses original-button reports and blocks profile operations until stopped.
const neutral=new Uint8Array(64);neutral[0]=18;neutral[1]=neutral[2]=neutral[3]=neutral[4]=128;neutral[58]=8;fake.frame(neutral)
await api.startMacroRecording('record-one')
await assert.rejects(api.readProfile(1), /recording/)
const pressed=neutral.slice();pressed[58]|=32;fake.frame(pressed);fake.frame(neutral)
assert.equal((await api.stopMacroRecording('record-one')).length,1)
await api.startMacroRecording('record-hidden');Object.assign(documentTarget,{hidden:true});documentTarget.dispatchEvent(new Event('visibilitychange'))
await assert.rejects(api.stopMacroRecording('record-hidden'),/no longer active/)
Object.assign(documentTarget,{hidden:false})
// No write occurs if rollback storage cannot be saved.
const savedStorage=globalThis.localStorage
Object.defineProperty(globalThis,'localStorage',{value:{setItem(){throw Error('storage blocked')}},configurable:true})
const writesBefore=fake.sent.filter(v=>v.data[0]===3).length
await assert.rejects(api.writeProfile(1,b64,1070),/storage blocked/)
assert.equal(fake.sent.filter(v=>v.data[0]===3).length,writesBefore)
Object.defineProperty(globalThis,'localStorage',{value:savedStorage,configurable:true})
assert.equal((await api.pureRawStatus()).enabled,false)
await api.disconnect();await new Promise(r=>setTimeout(r,0));devices.clear()
console.log('WebHID: report framing, DataView offsets, handshake, reads, verified writes, async USB failures, blocked desktop APIs, layout validation and rollback backup passed.')
