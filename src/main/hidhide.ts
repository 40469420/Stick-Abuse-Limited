import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
export interface HidHideStatus {installed:boolean; active:boolean|null; inverse:boolean|null; appAllowed:boolean; hostAllowed:boolean; hiddenDevices:number; message:string}
export function hidHidePath(file:string):string|undefined {
  const root=join(process.env.ProgramFiles||'C:/Program Files','Nefarius Software Solutions','HidHide')
  return [join(root,file),join(root,'x64',file)].find(existsSync)
}
let queue:Promise<unknown>=Promise.resolve()
export function withHidHide<T>(work:()=>Promise<T>):Promise<T>{const next=queue.then(work,work);queue=next.catch(()=>{});return next}
export async function runHidHide(args:string[]):Promise<string>{
  const cli=hidHidePath('HidHideCLI.exe');if(!cli)throw Error('Install HidHide first to enable automatic double-input protection.')
  return new Promise((resolve,reject)=>{const child=execFile(cli,args,{windowsHide:true,timeout:8000,maxBuffer:1024*1024},(error,stdout,stderr)=>error||stderr?.trim()?reject(Error('HidHide control device is busy or unavailable. Close HidHide setup and retry. '+stderr.slice(0,200))):resolve(stdout));child.stdin?.end()})
}
let scan:Promise<HidHideStatus>|null=null
export async function waitForHidHideScan():Promise<void>{await queue}
export function detectHidHide(app:string,host:string):Promise<HidHideStatus>{
  if(scan)return scan
  const pending=withHidHide(()=>readHidHide(app,host));scan=pending
  void pending.finally(()=>{if(scan===pending)scan=null})
  return pending
}
async function readHidHide(app:string,host:string):Promise<HidHideStatus> {
  const cli=hidHidePath('HidHideCLI.exe'),base:HidHideStatus={installed:!!cli||!!hidHidePath('HidHideClient.exe'),active:null,inverse:null,appAllowed:false,hostAllowed:false,hiddenDevices:0,message:''}
  if(!cli)return {...base,message:base.installed?'HidHide setup found, but its status tool is unavailable.':'HidHide not detected. Install it using the official guide.'}
  try {
    const output=await runHidHide(['--cloak-state','--inv-state','--app-list','--dev-list','--cancel'])
    const allowed=Array.from(output.matchAll(/--app-reg "([^"\r\n]+)"/g),m=>m[1].replaceAll('\\','/').toLowerCase())
    base.active=/--cloak-on\b/.test(output)?true:/--cloak-off\b/.test(output)?false:null
    base.inverse=/--inv-on\b/.test(output)?true:/--inv-off\b/.test(output)?false:null
    base.appAllowed=allowed.includes(app.replaceAll('\\','/').toLowerCase());base.hostAllowed=allowed.includes(host.replaceAll('\\','/').toLowerCase())
    base.hiddenDevices=(output.match(/--dev-hide /g)||[]).length
    base.message=base.active===null?'HidHide status could not be interpreted.':base.active?'Hiding enabled':'Hiding disabled'
    return base
  }catch{return {...base,message:'HidHide is installed, but its control device is busy or unavailable. Close other HidHide setup windows and retry. A Windows restart may be needed after installation.'}}
}
