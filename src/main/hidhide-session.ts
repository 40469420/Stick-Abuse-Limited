import { spawn, execFile } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, renameSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { hidHidePath, runHidHide, withHidHide } from './hidhide'
interface HidDevice {present:boolean;gamingDevice:boolean;symbolicLink:string;deviceInstancePath:string;baseContainerDeviceInstancePath:string;xusbDeviceInstancePath?:string}
interface HidContainer {devices:HidDevice[]}
interface Journal {version:1;cli:string;addedDevices:string[];addedApps:string[];enabled:boolean;baseline:string[];suspendedDevices?:string[]}
const normalize=(value:string):string=>value.replaceAll('/','\\').toLowerCase()
export function matchingHidHideDevices(inventory:unknown,path:string):string[]{
  if(!Array.isArray(inventory))throw Error('Invalid HidHide device inventory.')
  const groups=(inventory as HidContainer[]).filter(group=>Array.isArray(group.devices)&&group.devices.some(d=>d.present&&typeof d.symbolicLink==='string'&&normalize(d.symbolicLink)===normalize(path)))
  if(groups.length!==1)throw Error('Cannot uniquely match the connected controller for automatic hiding. Reconnect it and retry.')
  const present=groups[0].devices.filter(d=>d.present),games=present.filter(d=>d.gamingDevice)
  if(!games.length)throw Error('The connected controller has no matching gamepad interface for HidHide.')
  const parents=new Set(present.map(d=>d.baseContainerDeviceInstancePath))
  if(parents.size!==1||![...parents].every(p=>/^USB\\VID_3537&PID_[0-9a-f]{4}\\/i.test(p)))throw Error('The controller parent could not be verified. Automatic hiding was not applied.')
  const paths=[...parents,...games.flatMap(d=>[d.deviceInstancePath,d.xusbDeviceInstancePath||''])].filter(Boolean)
  if(!paths.every(p=>/^(HID|USB)\\VID_3537&PID_[0-9a-f]{4}[\\&]/i.test(p)&&!/["\r\n]/.test(p)))throw Error('Unexpected controller device path. Automatic hiding was not applied.')
  return [...new Set(paths)]
}
export function hidHideSnapshot(text:string):{active:boolean;inverse:boolean;devices:string[];apps:string[]}{
  if(!/--cloak-(on|off)\b/.test(text)||!/--inv-(on|off)\b/.test(text))throw Error('HidHide configuration could not be read.')
  return {active:/--cloak-on\b/.test(text),inverse:/--inv-on\b/.test(text),devices:Array.from(text.matchAll(/--dev-hide "([^"\r\n]+)"/g),m=>m[1]),apps:Array.from(text.matchAll(/--app-reg "([^"\r\n]+)"/g),m=>m[1])}
}
const snapshot=async():Promise<ReturnType<typeof hidHideSnapshot>>=>hidHideSnapshot(await runHidHide(['--cloak-state','--inv-state','--dev-list','--app-list','--cancel']))
export class HidHideSession {
  private restoring:Promise<void>|null=null
  constructor(private journal:()=>string,private root:string,private app:string){}
  async restore():Promise<void>{
    if(this.restoring)return this.restoring
    this.restoring=withHidHide(async()=>{
      const file=this.journal();if(!existsSync(file))return
      const saved=JSON.parse(readFileSync(file,'utf8')) as Journal
      if(saved.version!==1||saved.cli!==hidHidePath('HidHideCLI.exe')||!Array.isArray(saved.addedDevices)||!saved.addedDevices.every(d=>/^(HID|USB)\\VID_3537&PID_/i.test(d))||!Array.isArray(saved.addedApps))throw Error('Automatic hiding recovery record is invalid.')
      const suspended=saved.suspendedDevices??[]
      if(!Array.isArray(suspended)||!suspended.every(d=>typeof d==='string'&&saved.baseline.includes(d)))throw Error('Invalid saved inactive hiding rules.')
      const current=await snapshot(),args:string[]=[]
      for(const device of saved.addedDevices)args.push('--dev-unhide',device)
      for(const app of saved.addedApps)args.push('--app-unreg',app)
      const remaining=current.devices.filter(d=>!saved.addedDevices.some(a=>normalize(a)===normalize(d)))
      const retained=saved.baseline.filter(d=>!suspended.some(s=>normalize(s)===normalize(d)))
      const changed=remaining.some(d=>!retained.some(b=>normalize(b)===normalize(d)))
      const canRestoreInactive=!current.active||!current.inverse&&!changed
      if(saved.enabled&&!current.inverse&&!changed)args.push('--cloak-off')
      if(args.length)await runHidHide(args)
      if(suspended.length){
        if(!canRestoreInactive)throw Error('Another app changed active HidHide rules. Your physical controller was released; saved inactive rules will be restored once that other hiding session stops. Use Restore physical controller to retry.')
        // Keep the old inactive list disabled before adding it back.
        if(current.active&&!args.includes('--cloak-off'))await runHidHide(['--cloak-off'])
        await runHidHide(suspended.flatMap(d=>['--dev-hide',d]))
      }
      unlinkSync(file)
    }).finally(()=>{this.restoring=null})
    return this.restoring
  }
  async apply(path:string,slot:number):Promise<void>{
    await this.restore()
    try {await withHidHide(async()=>{
      const before=await snapshot()
      if(before.inverse)throw Error('HidHide uses inverse application mode from another setup. Automatic protection cannot safely change that global setting.')
      const devices=matchingHidHideDevices(JSON.parse(await runHidHide(['--dev-all','--cancel'])),path)
      const parent=devices.find(d=>/^USB\\VID_/i.test(d))!
      const identity=parent.split('\\')[1].toLowerCase()
      for(const game of devices.filter(d=>/^HID\\/i.test(d))){
        const chain=await this.deviceParents(game)
        if(!chain.some(d=>normalize(d)===normalize(parent)))throw Error('XInput ancestry does not match the connected controller. No hiding changes were made.')
        for(const node of chain)if(node.toLowerCase().startsWith('usb\\'+identity)&&!devices.some(d=>normalize(d)===normalize(node)))devices.push(node)
      }
      const apps=[this.app,join(this.root,'virtual-host.exe')]
      const saved:Journal={version:1,cli:hidHidePath('HidHideCLI.exe')!,addedDevices:devices.filter(d=>!before.devices.some(b=>normalize(b)===normalize(d))),addedApps:apps.filter(a=>!before.apps.some(b=>normalize(b)===normalize(a))),enabled:!before.active,baseline:before.devices,suspendedDevices:before.active?[]:before.devices.filter(d=>!devices.some(t=>normalize(t)===normalize(d)))}
      mkdirSync(dirname(this.journal()),{recursive:true});writeFileSync(this.journal()+'.tmp',JSON.stringify(saved));renameSync(this.journal()+'.tmp',this.journal())
      await this.watch()
      const args=(saved.suspendedDevices??[]).flatMap(d=>['--dev-unhide',d]).concat(saved.addedApps.flatMap(a=>['--app-reg',a])).concat(saved.addedDevices.flatMap(d=>['--dev-hide',d]),['--cloak-on'])
      await runHidHide(args)
      const after=await snapshot()
      if(!after.active||after.inverse||(saved.suspendedDevices??[]).some(d=>after.devices.some(b=>normalize(b)===normalize(d)))||!devices.every(d=>after.devices.some(b=>normalize(b)===normalize(d)))||!apps.every(a=>after.apps.some(b=>normalize(b)===normalize(a))))throw Error('Automatic HidHide setup did not verify. Playback was not started.')
      const visible=await this.sources(join(this.root,'visibility-check.exe'))
      const allowed=await this.sources(join(this.root,'virtual-host.exe'))
      if(!allowed.some(s=>s.slot===slot))throw Error(`The playback helper cannot read XInput slot ${slot}. Reconnect and detect the physical source again. Playback was not started.`)
      if(visible.some(s=>s.slot===slot))throw Error(`The physical controller is still visible outside Stick Abuse on XInput slot ${slot}. Automatic hiding could not be verified; playback was not started.`)
    })}catch(error){try{await this.restore()}catch{throw Error('HidHide setup failed and automatic restoration needs a retry. Stop simulated mode to retry restoring the physical controller.')}throw error}
  }
  private deviceParents(device:string):Promise<string[]>{return new Promise((resolve,reject)=>execFile(join(this.root,'virtual-host.exe'),['--device-parents',device],{windowsHide:true,timeout:8000},(error,stdout)=>{try{if(error)throw error;const paths=JSON.parse(stdout);if(!Array.isArray(paths)||!paths.every(p=>typeof p==='string'&&!/["\r\n]/.test(p)))throw Error('Invalid controller ancestry response');resolve(paths)}catch(e){reject(e)}}))}
  private sources(exe:string):Promise<Array<{slot:number}>>{return new Promise((resolve,reject)=>execFile(exe,['--sources'],{windowsHide:true,timeout:8000},(error,stdout)=>{try{if(error)throw error;const rows=JSON.parse(stdout);if(!Array.isArray(rows))throw Error('Invalid source visibility response');resolve(rows)}catch(e){reject(e)}}))}
  private watch():Promise<void>{
    return new Promise((resolve,reject)=>{const child=spawn(join(this.root,'virtual-host.exe'),['--hidhide-watch',String(process.pid),this.journal()],{windowsHide:true,detached:true,stdio:['ignore','pipe','ignore']});let output='';const timeout=setTimeout(()=>{child.kill();reject(Error('HidHide recovery watcher did not start.'))},5000);child.once('error',e=>{clearTimeout(timeout);reject(e)});child.stdout.on('data',b=>{output+=b;if(output.includes('READY')){clearTimeout(timeout);child.stdout.destroy();child.unref();resolve()}});child.once('exit',()=>{clearTimeout(timeout);if(!output.includes('READY'))reject(Error('HidHide recovery watcher exited before startup.'))})})
  }
}
