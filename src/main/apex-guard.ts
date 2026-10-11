import { execFile } from 'node:child_process'
import { join } from 'node:path'

export const APEX_IMAGES = ['r5apex.exe', 'r5apex_dx12.exe'] as const
export interface ApexProcess { pid: number; image: string }
export interface ApexGuardStatus { enabled: boolean; armed: boolean; message: string; alert: string | null }
export function parseApexProcesses(csv: string): ApexProcess[] {
  return csv.split(/\r?\n/).flatMap(line => {
    const m = /^"([^"]+)","(\d+)"(?:,|$)/.exec(line.trim())
    return m && APEX_IMAGES.includes(m[1].toLowerCase() as typeof APEX_IMAGES[number]) && Number(m[2]) > 0 ? [{image:m[1].toLowerCase(),pid:Number(m[2])}] : []
  })
}
function command(name: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => execFile(join(process.env.SystemRoot || 'C:\\Windows', 'System32', name), args, {windowsHide:true,timeout:3000,maxBuffer:512000}, (error, stdout) => error ? reject(error) : resolve(stdout)))
}
export async function listApex(): Promise<ApexProcess[]> {
  const rows = await Promise.all(APEX_IMAGES.map(image => command('tasklist.exe',['/FI',`IMAGENAME eq ${image}`,'/FO','CSV','/NH'])))
  return rows.flatMap(parseApexProcesses)
}
export async function killApex(target: ApexProcess): Promise<void> {
  if (!APEX_IMAGES.includes(target.image as typeof APEX_IMAGES[number]) || !Number.isSafeInteger(target.pid) || target.pid <= 0) throw new Error('Invalid Apex process')
  // Image filter prevents terminating an unrelated process if Windows reuses a PID.
  await command('taskkill.exe',['/F','/PID',String(target.pid),'/FI',`IMAGENAME eq ${target.image}`])
  if ((await listApex()).some(p => p.pid === target.pid && p.image === target.image)) throw new Error('Apex is still running; Windows may have denied termination.')
}
export class ApexGuard {
  status: ApexGuardStatus = {enabled:false,armed:false,message:'Apex guard is off.',alert:null}
  private running = false
  private generation = 0
  constructor(private deps: {rc:()=>Promise<boolean|null>;list:()=>Promise<ApexProcess[]>;kill:(p:ApexProcess)=>Promise<void>;changed:(s:ApexGuardStatus)=>void}) {}
  setEnabled(enabled: boolean): void { this.generation++;this.status.enabled=enabled;if(!enabled)this.status.armed=false;this.status.message=enabled?'Checking the active controller RC settings…':'Apex guard is off.';this.publish() }
  dismiss(): void {this.status.alert=null;this.publish()}
  private publish(): void {this.deps.changed({...this.status})}
  async tick(): Promise<void> {
    if (!this.status.enabled || this.running) return
    this.running=true;const generation=this.generation
    const current=():boolean=>this.status.enabled&&generation===this.generation
    try {
      const rc=await this.deps.rc();if(!current())return
      if(rc!==null)this.status.armed=rc
      this.status.message=rc===null ? `RC state unavailable. ${this.status.armed?'Watching using the last verified enabled state.':'Waiting for a supported controller.'}` : rc?'Armed: RC enabled in the active profile. Watching for Apex.':'Idle: active-profile RC is neutral.'
      if(!this.status.armed){this.publish();return}
      const targets=await this.deps.list();if(!current())return
      for(const target of targets){if(!current())return;await this.deps.kill(target)}
      if(targets.length){this.status.alert='You have RCs enabled. Please close Apex.';this.status.message='Apex was force-closed because active-profile RC was enabled.'}
      this.publish()
    }catch(e){if(current()){this.status.message=`Apex guard could not complete its check: ${(e as Error).message}`;this.status.alert=this.status.armed?'You have RCs enabled. Please close Apex.':null;this.publish()}}
    finally{this.running=false}
  }
}
