import type { Profile } from '../shared/profile'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { virtualSuppression, expandedKeys, emptyVirtualConfig, validateVirtualConfig, virtualKey, VirtualMacroEngine, type VirtualConfig, type VirtualStatus } from '../shared/virtual-controller'
import type { LiveInput } from './controller'

export const DRIVER_URL = 'https://github.com/nefarius/ViGEmBus/releases/download/v1.22.0/ViGEmBus_1.22.0_x64_x86_arm64.exe'
export const DRIVER_SHA256 = '89220a7865076b342892f98865f3499fb7c4cfd673159e89d352c360fd014c6a'
const CLIENT_SHA256 = '00303f99e1968d523fbd08a7c691d60d145b7335059ec593947841d124c10875'
export class VirtualControllerService {
  async sources(detect=false):Promise<Array<{slot:number;lx:number;ly:number;rx:number;ry:number;span:number}>> {
    if(this.child||this.starting||this.stopping)throw Error('Stop simulated playback before identifying the physical source.')
    return new Promise((resolve,reject)=>{const child=spawn(this.host(),[detect?'--detect-source':'--sources'],{windowsHide:true,cwd:this.root});let output='';const timer=setTimeout(()=>{child.kill();reject(Error('Source detection timed out.'))},10000);child.stdout.on('data',b=>{output+=b;if(output.length>16000){child.kill();reject(Error('Invalid source response.'))}});child.on('error',e=>{clearTimeout(timer);reject(e)});child.on('close',code=>{clearTimeout(timer);try{const rows=JSON.parse(output);if(code!==0||!Array.isArray(rows)||!rows.every(r=>Number.isInteger(r.slot)&&r.slot>=0&&r.slot<4&&['lx','ly','rx','ry','span'].every(k=>Number.isFinite(r[k]))))throw Error('Cannot read XInput sources.');resolve(rows)}catch(e){reject(e)}})})
  }
  private hardwareProfile:Profile|null=null
  private suppression:Record<number,number[]>={}
  setHardwareProfile(profile:Profile):void {const plan=virtualSuppression(profile,this.config);this.hardwareProfile=profile;this.suppression=plan}
  private config = emptyVirtualConfig()
  private engine = new VirtualMacroEngine(this.config)
  private child: ChildProcessWithoutNullStreams | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private stopping = false
  private starting = false
  private epoch = 0
  private paused = false
  private lastInput = 0
  private lastFrame = ''
  private lastSend = 0
  private state: Omit<VirtualStatus,'config'> = { available:false, active:false, installing:false, source:null, message:'Optional mode is off. Check or install the driver to begin.', reports:0, submitUs:0 }
  constructor(private root: string, private folder: () => string, private notify: (s:VirtualStatus) => void, private onStopped:()=>Promise<void>=async()=>{}) {}
  get status(): VirtualStatus { return { ...this.state, config:JSON.parse(JSON.stringify(this.config)) } }
  load(): void { try { this.config = validateVirtualConfig(JSON.parse(readFileSync(join(this.folder(),'virtual-controller-G7ProCE.json'),'utf8'))); this.engine = new VirtualMacroEngine(this.config) } catch { /* Off on every launch; invalid files never arm playback. */ } }
  selectModel(model:unknown):VirtualStatus {
    if(model!=='G7ProCE'&&model!=='T3CE')throw Error('Unsupported PC macro model.')
    if(this.child||this.starting)throw Error('Stop virtual playback before changing controllers.')
    if(model===this.config.model)return this.status
    let next:VirtualConfig={...emptyVirtualConfig(),model}
    try{next=validateVirtualConfig(JSON.parse(readFileSync(join(this.folder(),`virtual-controller-${model}.json`),'utf8')))}catch{}
    if(next.model!==model)throw Error('Saved PC macro model does not match.')
    return this.save(next)
  }
  save(value: unknown): VirtualStatus {
    const config = validateVirtualConfig(value)
    if (this.starting)throw Error('Wait for virtual-controller startup.')
    if (this.child && (config.model !== this.config.model || config.slot !== this.config.slot || config.hz !== this.config.hz)) throw Error('Stop the simulated controller before changing its model, source or rate.')
    const suppression=this.child&&this.hardwareProfile?virtualSuppression(this.hardwareProfile,config):{}
    mkdirSync(this.folder(),{recursive:true}); const path = join(this.folder(),`virtual-controller-${config.model}.json`)
    writeFileSync(path+'.tmp',JSON.stringify(config,null,2)); renameSync(path+'.tmp',path)
    this.suppression=suppression;this.config = config; this.engine = new VirtualMacroEngine(config); this.lastFrame=''
    this.tick(); this.emit(); return this.status
  }
  private emit(): void { this.notify(this.status) }
  private host(): string {
    const host = join(this.root,'virtual-host.exe'), client=join(this.root,'ViGEmClient.dll')
    if (!existsSync(host) || !existsSync(client)) throw Error('Virtual-controller components are missing. Rebuild or reinstall Stick Abuse.')
    if (createHash('sha256').update(readFileSync(client)).digest('hex') !== CLIENT_SHA256) throw Error('Virtual-controller client failed its integrity check.')
    return host
  }
  async check(): Promise<VirtualStatus> {
    if (this.child || this.state.installing) return this.status
    try {
      await new Promise<void>((resolve,reject) => {
        const p=spawn(this.host(),['--probe'],{windowsHide:true,cwd:this.root});let out=''; const timer=setTimeout(()=>{p.kill();reject(Error('Driver check timed out.'))},10000)
        p.stdout.on('data',b=>{out+=b.toString();if(out.length>10000){p.kill();reject(Error('Invalid driver response.'))}});p.on('error',reject);p.on('close',code=>{clearTimeout(timer);code===0&&out.includes('"available":true')?resolve():reject(Error('ViGEmBus is unavailable. Install it, or restart Windows if installation just completed.'))})
      });this.state.available=true;this.state.message='ViGEmBus is available. Playback is still off.'
    } catch(e){this.state.available=false;this.state.message=(e as Error).message}
    this.emit();return this.status
  }
  async install(): Promise<VirtualStatus> {
    if(this.child||this.starting||this.stopping||this.state.installing)throw Error('Stop virtual playback or wait for installation to finish.')
    let installed=false
    this.state.installing=true;this.state.message='Downloading the pinned official ViGEmBus 1.22.0 installer…';this.emit()
    try {
      const response=await fetch(DRIVER_URL,{signal:AbortSignal.timeout(120000)});if(!response.ok)throw Error('Official driver download failed.')
      const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>50*1024*1024||createHash('sha256').update(bytes).digest('hex')!==DRIVER_SHA256)throw Error('Driver installer checksum did not match. Nothing was run.')
      const folder=join(this.folder(),'driver-cache');mkdirSync(folder,{recursive:true});const file=join(folder,'ViGEmBus-1.22.0.exe');writeFileSync(file,bytes)
      const literal="'"+file.replace(/'/g,"''")+"'"
      const windowsPowerShell=join(process.env.SystemRoot||'C:/Windows','System32','WindowsPowerShell','v1.0')
      const installerEnv={...process.env,PSModulePath:join(windowsPowerShell,'Modules')}
      const script=`$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1') -ErrorAction Stop;$s=Get-AuthenticodeSignature -LiteralPath ${literal};if($s.Status -ne 'Valid' -or $s.SignerCertificate.Subject -notmatch 'Nefarius Software Solutions'){throw 'Driver signature verification failed'};$p=Start-Process -FilePath ${literal} -ArgumentList @('/quiet','/norestart') -Verb RunAs -WindowStyle Hidden -Wait -PassThru;exit $p.ExitCode`
      this.state.message='Approve the Windows administrator prompt to install the driver. Playback remains off.';this.emit()
      await new Promise<void>((resolve,reject)=>{const p=spawn(join(windowsPowerShell,'powershell.exe'),['-NoProfile','-NonInteractive','-OutputFormat','Text','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,env:installerEnv});let error='';p.stderr.on('data',b=>{error=(error+b).slice(-2000)});p.on('error',reject);p.on('close',code=>[0,3010,1641].includes(code??-1)?resolve():reject(Error(error||'Installation was cancelled or failed.')))})
      installed=true
      this.state.message='Installation completed. A Windows restart may be required. Playback has not been enabled.'
    } catch(e){this.state.message=(e as Error).message} finally{this.state.installing=false;this.emit()}
    return installed?this.check():this.status
  }
  async start(source: string, productId?:number): Promise<VirtualStatus> {
    if(this.child||this.starting||this.stopping||this.state.installing)throw Error('Virtual controller is already starting, active, or installing.')
    this.starting=true;const epoch=++this.epoch
    try { await this.check();if(epoch!==this.epoch)throw Error('Virtual startup cancelled.');if(!this.state.available)throw Error(this.state.message)
    this.engine.reset();this.lastInput=Date.now();this.lastFrame='';this.lastSend=0
    const child=spawn(this.host(),['--run',String(this.config.slot),String(this.config.hz),...(productId===undefined?[]:[String(productId)])],{windowsHide:true,cwd:this.root});this.child=child;this.state.source=source
    child.stdin.on('error',()=>{if(this.child===child)void this.stop('Virtual-controller connection ended.')})
    let buffer='',ready=false
    return await new Promise<VirtualStatus>((resolve,reject)=>{
      const timeout=setTimeout(()=>{void this.stop('Virtual-controller startup timed out.');reject(Error('Virtual-controller startup timed out.'))},12000)
      child.on('error',e=>{clearTimeout(timeout);void this.stop(e.message);reject(e)})
      child.stdout.on('data',chunk=>{
        if(this.child!==child)return
        buffer+=chunk.toString();if(buffer.length>32768){void this.stop('Invalid virtual host response.');return}
        let at:number;while((at=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,at);buffer=buffer.slice(at+1);try{const event=JSON.parse(line)
          if(event.error){this.state.message=String(event.error);this.emit();if(!ready){clearTimeout(timeout);reject(Error(event.error))}}
          if(event.ready&&!ready&&this.child===child){ready=true;clearTimeout(timeout);this.state.active=true;this.state.message='Simulated controller active. Keep Stick Abuse running.';this.timer=setInterval(()=>this.tick(),2);this.tick();this.emit();resolve(this.status)}
          if(typeof event.reports==='number'){this.state.reports=event.reports;this.state.submitUs=event.submitUs;this.emit()}
        }catch{/* Ignore incomplete diagnostic lines. */}}
      })
      child.on('close',code=>{clearTimeout(timeout);if(this.child===child){if(code!==0)this.releaseAfterFailure();this.child=null;if(this.state.message.startsWith('Simulated controller active'))this.state.message='Virtual host exited. Playback was disabled.';this.cleanup();this.emit();void this.stop(this.state.message).catch(e=>{this.state.message=(e as Error).message;this.emit()})}if(!ready)reject(Error(this.state.message||'Virtual-controller host exited.'))})
    })
    } finally {this.starting=false}
  }
  pause(value:boolean):void { this.paused=value;this.engine.reset();this.lastFrame='';this.tick() }
  input(input:LiveInput): void {
    if(!this.child)return
    if(!input.live||!input.recordKeys){void this.stop('Controller disconnected. Reconnect and enable the simulated controller again.');return}
    this.lastInput=Date.now();const keys=[...input.recordKeys]
    const axes=input.centerRaw
    if(axes)for(const [value,negative,positive] of [[axes.lx,23,24],[axes.ly,21,22],[axes.rx,27,28],[axes.ry,25,26]]){if(value<-.5)keys.push(negative);if(value>.5)keys.push(positive)}
    if(!this.paused)this.engine.input(keys,performance.now());this.tick()
  }
  private tick(): void {
    if(!this.child||!this.state.active)return
    if(Date.now()-this.lastInput>1000){void this.stop('Controller reports stopped. Virtual playback was released and disabled.');return}
    const frame=this.paused?{codes:[],blocked:[]}:this.engine.tick(performance.now()), codes=[...expandedKeys(frame.codes)],blocked=[...expandedKeys(frame.blocked.flatMap(source=>this.hardwareProfile?(this.suppression[source]??[]):[source]))]
    const keys=codes.map(k=>virtualKey(k)??({149:179,150:178,151:176,152:177,153:175,154:174,155:173} as Record<number,number>)[k]).filter((k):k is number=>typeof k==='number')
    const message=JSON.stringify({codes,blocked,keys,mouse:codes.filter(k=>k>=200&&k<=206)})
    if(message!==this.lastFrame||Date.now()-this.lastSend>100){if(this.child.stdin.writableLength>32768){void this.stop('Playback could not keep up. Virtual inputs were released.');return}this.child.stdin.write(message+'\n');this.lastFrame=message;this.lastSend=Date.now()}
  }
  private releaseAfterFailure():void {
    try {
      const frame=JSON.parse(this.lastFrame||'{}')
      const keys=(frame.keys??[]).filter((k:unknown)=>Number.isInteger(k)&&Number(k)>0&&Number(k)<256),mouse=(frame.mouse??[]).filter((k:unknown)=>Number.isInteger(k)&&Number(k)>=200&&Number(k)<=204)
      if(!keys.length&&!mouse.length)return
      const p=spawn(this.host(),['--release',keys.join(','),mouse.join(',')],{windowsHide:true,cwd:this.root})
      p.on('error',()=>{this.state.message='Playback stopped, but emergency key release could not run. Release any affected keyboard/mouse buttons manually.';this.emit()})
    }catch{/* Host integrity failures already prevent playback. */}
  }
  private cleanup(): void { if(this.timer)clearInterval(this.timer);this.timer=null;this.state.active=false;this.state.source=null;this.paused=false;this.engine.reset() }
  private stopTask:Promise<VirtualStatus>|null=null
  async stop(message='Simulated controller stopped. Dependent macros are unavailable.'):Promise<VirtualStatus>{
    if(this.stopTask)return this.stopTask
    const task=this.finishStop(message);this.stopTask=task
    try{return await task}finally{if(this.stopTask===task)this.stopTask=null}
  }
  private async finishStop(message:string):Promise<VirtualStatus>{
    this.epoch++;const child=this.child;this.child=null;this.cleanup();this.state.message=message;this.emit();this.stopping=true
    try {
      if(child)await new Promise<void>(resolve=>{let done=false;const finish=():void=>{if(!done){done=true;resolve()}};child.once('close',finish);if(!child.stdin.destroyed)child.stdin.end('stop\n');setTimeout(()=>{if(!done){this.releaseAfterFailure();child.kill()}finish()},2000).unref()})
      await this.onStopped()
    } catch(e){this.state.message='Playback stopped. Automatic controller unhiding needs attention: '+(e as Error).message;this.emit()}finally{this.stopping=false}
    return this.status
  }
}
