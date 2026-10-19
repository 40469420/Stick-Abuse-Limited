// Main-process integration tests with fake Electron and a fake controller.
// No native windows, controller writes, or input injection.
import { build } from 'esbuild'
import { mkdirSync, rmSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'

const folder = resolve('.lifecycle-tmp')
if (!process.argv.includes('--child')) {
  mkdirSync(folder, { recursive: true })
  const electron = `
    import {EventEmitter} from 'node:events';
    export const app=new EventEmitter();app.setAppUserModelId=id=>{app.appId=id};app.isPackaged=false;app.requestSingleInstanceLock=()=>true;app.whenReady=()=>Promise.resolve();app.getPath=()=>${JSON.stringify(folder)}+'/'+process.argv[3];app.getVersion=()=> 'test';
    const m=globalThis.__m={app,handlers:new Map(),messages:[],quits:0,writes:0,profile:Uint8Array.from({length:1070},(_,i)=>i%256)};
    app.quit=()=>{let prevented=false;app.emit('before-quit',{preventDefault(){prevented=true}});if(!prevented){m.quits++;app.emit('will-quit')}};
    export class BrowserWindow extends EventEmitter{constructor(){super();m.window=this;this.webContents={send:(channel,payload)=>m.messages.push({channel,payload})};}loadURL(){}loadFile(){}isDestroyed(){return false}hide(){m.hidden=true;this.emit('hide')}show(){m.hidden=false}restore(){}focus(){}static getAllWindows(){return [m.window]}}
    export class Tray extends EventEmitter{constructor(){super();m.tray=this}setToolTip(){}setContextMenu(menu){m.menu=menu}destroy(){m.trayDestroyed=true}}
    export const Menu={buildFromTemplate:items=>items};export const nativeImage={createFromBitmap:()=>({}),createFromPath:()=>({resize(){return this}})};export const dialog={showMessageBox:async options=>{m.dialogs??=[];m.dialogs.push(options);return {response:m.dialogResponse??1}}};export const ipcMain={handle:(channel,fn)=>m.handlers.set(channel,fn)};export const session={defaultSession:{setPermissionRequestHandler(){}}};export const shell={openExternal(){}};
  `
  const controller = `
    import {EventEmitter} from 'node:events';
    export class Controller{constructor(){globalThis.__controller=this;this.transport=new EventEmitter();Object.assign(this.transport,{isOpen:false,currentPath:null,startWatchdog(){},write(packet){globalThis.__m.calPackets??=[];globalThis.__m.calPackets.push(packet)}});this.latestInput={live:true,recordKeys:[],timestamp:Date.now()};this.state='disconnected';}
    get isOpen(){return this.transport.isOpen}onInput(fn){this.input=fn}attachInputDecoder(){}async connect(path){this.transport.isOpen=true;this.transport.currentPath=path;this.state='ready';return {firmware:'2.2.9',dongle:'1.3.5',currentProfile:1}}disconnect(){this.transport.isOpen=false;this.transport.currentPath=null}calibration(state,mask,mode=0){this.transport.write([15,254,state,mask,mode]);if(state!==0&&!globalThis.__m.suppressTerminal)setTimeout(()=>this.emitSample(mode?0:1,0),5)}emitSample(target,status){this.latestInput={live:true,recordKeys:[],calTarget:target,calMask:status,timestamp:Date.now()};this.input(this.latestInput)}async getCurrentProfile(){return 1}async exitConfig(save){globalThis.__m.exitSave=save}async readProfile(slot){if(globalThis.__m.waitRead)await globalThis.__m.waitRead;return (slot===5&&globalThis.__m.shiftProfile?globalThis.__m.shiftProfile:globalThis.__m.profile).slice()}async writeProfileVerified(slot,bytes){globalThis.__m.writes++;if(globalThis.__m.failWrite)throw new Error('simulated verification failure');if(slot===5&&globalThis.__m.shiftProfile)globalThis.__m.shiftProfile=bytes.slice();else globalThis.__m.profile=bytes.slice();return {verified:true,rolledBack:false}}}
  `
  const hid = `export function discover(){return [{path:'test-pad',product:globalThis.__m.tarantula?'T3CE':'G7 Pro 8K',productId:globalThis.__m.tarantula?0x103d:0x10c5,preferred:true}]}export const discoverLive=discover;`
  const firmware = `export function validateFirmware(path){return {path,modelId:path.includes('T3CE')?'T3CE':'G7ProCE',product:path.includes('T3CE')?'GS_T3CE':'GS_G7_Pro_CE_DV',experimental:path.includes('T3CE'),sourceWarning:'test',version:path.includes('T3CE')?(path.includes('212')?'2.1.2':'2.4.3'):(path.includes('210')?'2.1.0':'2.2.9'),variant:'Key',sha256:'test'}}export async function runFirmwareWorker(app,folder,image,action){const m=globalThis.__m;m.firmwareCalls??=[];m.firmwareCalls.push(action);if(m.rejectFirmware)throw Error('simulated firmware rejection');if(action==='flash'){if(m.flashWait)await m.flashWait;return {message:'Updater completed; reconnect to verify'}}return {product:image.product,version:image.version}}`
  try {
    await build({ entryPoints: ['src/main/index.ts'], outfile: join(folder, 'main.cjs'), bundle: true, platform: 'node', format: 'cjs', plugins: [{ name: 'fake-hardware', setup(b) {
      b.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'fake' }))
      b.onResolve({filter:/^\.\/virtual-controller$/},()=>({path:'virtual-service',namespace:'fake'}))
      b.onLoad({filter:/^virtual-service$/,namespace:'fake'},()=>({contents:`export class VirtualControllerService{constructor(){globalThis.__m.virtual=this;this.status={active:false,installing:false,config:{model:'G7ProCE'}}}load(){}input(){}pause(value){globalThis.__m.virtualPaused=value}async stop(){this.status.active=false;globalThis.__m.virtualStops=(globalThis.__m.virtualStops??0)+1;return this.status}}`,loader:'js'}))
      b.onResolve({ filter: /^\.\/controller$/ }, () => ({ path: 'controller', namespace: 'fake' }))
      b.onResolve({ filter: /^\.\/hid$/ }, () => ({ path: 'hid', namespace: 'fake' }))
      b.onResolve({ filter: /^\.\/firmware$/ }, () => ({ path: 'firmware', namespace: 'fake' }))
      b.onResolve({ filter: /^\.\/deeppoll$/ }, () => ({ path:'deeppoll',namespace:'fake' }))
      b.onLoad({ filter: /^deeppoll$/,namespace:'fake' },()=>({contents:'export function runDeepPoll(run){return new Promise(resolve=>{globalThis.__m.kernelStarted=true;run.signal.addEventListener("abort",()=>{globalThis.__m.kernelCancelled=true;resolve({ok:false,error:"cancelled"})},{once:true})})}',loader:'js'}))
      b.onResolve({ filter: /^\.\/bench-xinput$/ }, () => ({ path: 'bench-xinput', namespace: 'fake' }))
      b.onLoad({ filter: /^bench-xinput$/, namespace: 'fake' }, () => ({ contents: 'export function runXInputBench(slot,seconds,onReady){onReady();let reject;const promise=new Promise((a,b)=>reject=b);return {promise,cancel(){globalThis.__m.benchKilled=true;reject(new Error("cancelled"))}}}', loader: 'js' }))
      b.onResolve({ filter: /^\.\/marius$/ }, () => ({ path: 'marius', namespace: 'fake' }))
      b.onLoad({ filter: /^marius$/, namespace: 'fake' }, () => ({ contents: 'export class MariusReader { close() {} } export function discoverMarius() { return [] }', loader: 'js' }))
      b.onLoad({ filter: /.*/, namespace: 'fake' }, ({ path }) => ({ contents: { electron, controller, hid, firmware }[path], loader: 'js' }))
    } }], external: ['electron-updater'] })
    for (const scenario of ['virtual', 'yes', 'no', 'neutral', 'disconnected', 'firmware', 'tarantula-firmware', 'bench', 'shift', 'kernel', 'guard-write', 'guard-virtual', 'guard-quit', 'guard-quit-rc', 'pure-reconnect']) {
      const run = spawnSync(process.execPath, [resolve('tests/lifecycle.mjs'), '--child', scenario], { stdio: 'inherit', timeout: 20000 })
      assert.equal(run.status, 0, `${scenario} lifecycle scenario failed`)
    }
  } finally { rmSync(folder, { recursive: true, force: true }) }
} else {
  const scenario = process.argv[3]
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  await import(pathToFileURL(join(folder, 'main.cjs')).href)
  await wait(10)
  const m = globalThis.__m, controller = globalThis.__controller
  const call = async (channel, ...args) => m.handlers.get(channel)({}, ...args)
  const prompt = () => m.messages.filter((item) => item.channel === 'rc:quitPrompt').at(-1)?.payload
  m.profile[916]|=1;m.profile[952]|=1
  assert.equal((await call('device:connect', 'test-pad')).ok, true)
  const guardResult = await call('games:status')
  const guardDefaults = guardResult.value ?? guardResult.data ?? guardResult.result
  assert(Object.values(guardDefaults).every(s => !s.enabled), 'additional game guards default off')
  if(scenario==='virtual'){
    m.virtual.status.active=true;m.profile[49]=11;m.profile[50]=11
    assert.equal((await call('virtual:keyboardRecord','keyboard-lease',true)).ok,true);assert.equal(m.virtualPaused,true);await call('virtual:keyboardRecord','other-lease',false);assert.equal(m.virtualPaused,true);await call('virtual:keyboardRecord','keyboard-lease',false);assert.equal(m.virtualPaused,false)
    let prevented=false;m.window.emit('close',{preventDefault(){prevented=true}})
    assert(prevented&&m.virtual.status.active,'tray close keeps virtual playback active');assert.equal(m.dialogs?.length??0,0)
    m.dialogResponse=0;m.menu.find(e=>e.label==='Quit Stick Abuse').click();await wait(20)
    assert.equal(m.quits,0);assert(m.virtual.status.active);assert.equal(m.virtualPaused,false);assert.match(m.dialogs.at(-1).message,/disconnects the simulated controller/)
    m.dialogResponse=1;m.menu.find(e=>e.label==='Quit Stick Abuse').click();await wait(30)
    assert.equal(m.quits,1);assert.equal(m.virtual.status.active,false);assert(m.virtualStops>=1)
    console.log('Virtual quit lifecycle: tray close stays active, quit warns, cancel preserves playback and confirmation stops it.')
    process.exit(0)
  }
  if(scenario==='pure-reconnect') {
    assert.equal((await call('pure:status')).data.enabled,true,'reapply defaults on')
    m.profile[916]&=~1;m.profile[952]|=1
    const original=m.profile.slice(),writes=[]
    const write=controller.writeProfileVerified.bind(controller)
    let releaseWrite;const firstWrite=new Promise(resolve=>{releaseWrite=resolve})
    controller.writeProfileVerified=async(slot,bytes)=>{writes.push(bytes.slice());if(writes.length===1)await firstWrite;const result=await write(slot,bytes);controller.transport.emit('reopened');return result}
    controller.transport.isOpen=false;controller.transport.emit('disconnected',Error('test unplug'))
    for(let i=0;i<250&&!writes.length;i++)await wait(10)
    assert.equal(writes.length,1,'recovery began')
    assert.equal((await call('profile:write',1,Buffer.from(original).toString('base64'),1070)).ok,false,'conflicting writes blocked during recovery')
    assert.equal((await call('pure:set',false)).ok,false,'toggle cannot interrupt recovery')
    releaseWrite();await wait(1300)
    assert.equal(writes.length,2,'one reconnect performs only Square and exact restore')
    assert.deepEqual(m.profile,original,'all tuning is preserved')
    assert.equal(writes[0][916]&1,1);assert.equal(writes[0][917]&1,1)
    assert.equal(writes[0][952],original[952],'processed stick is untouched')
    await wait(700);assert.equal(writes.length,2,'recovery reopen events cannot loop')
    assert.equal((await call('pure:set',false)).ok,true)
    assert.equal(JSON.parse(readFileSync(join(folder,scenario,'rc-preferences.json'),'utf8')).pureRawReconnect,false)
    controller.transport.isOpen=false;controller.transport.emit('disconnected',Error('test unplug'))
    await wait(2200);assert.equal(writes.length,2,'disabled reconnect performs no recovery writes')
    await call('pure:set',true)
    controller.input({live:false,timestamp:Date.now()});controller.input({live:true,timestamp:Date.now()})
    await wait(1600);assert.equal(writes.length,4,'receiver-only reconnect recovers once')
    assert.deepEqual(m.profile,original)
    console.log('PureRaw lifecycle: default-on preference, USB/receiver reconnect, exact restoration, disabled behavior and loop prevention pass.')
    process.exit(0)
  }
  if(scenario==='guard-quit'||scenario==='guard-quit-rc') {
    m.profile[49]=11;m.profile[50]=11
    if(scenario==='guard-quit-rc')m.profile[49]=1
    let finishRead
    m.waitRead=new Promise(resolve=>{finishRead=resolve})
    let entered=false
    const originalRead=controller.readProfile.bind(controller)
    controller.readProfile=async (...args)=>{entered=true;return originalRead(...args)}
    assert.equal((await call('games:set','destiny',true)).ok,true)
    for(let i=0;i<150&&!entered;i++)await wait(10)
    assert.equal(entered,true)
    m.menu.find(entry=>entry.label==='Quit Stick Abuse').click()
    await wait(30)
    assert.equal(m.quits,0,'quit cannot overlap in-progress background read')
    assert.equal(m.messages.some(item=>item.channel==='rc:quitError'),false,'background check does not reject quit')
    finishRead();m.waitRead=null
    for(let i=0;i<50&&!m.quits&&!prompt();i++)await wait(10)
    if(scenario==='guard-quit-rc'){
      assert.equal(m.quits,0,'enabled RC still requires acknowledgment')
      assert.ok(prompt(),'mandatory RC warning is preserved')
      assert.equal((await call('rc:quitDecision',prompt().id,false)).ok,true)
    }
    assert.equal(m.quits,1,'one quit request completes after background check releases')
    assert.equal(m.exitSave,true,'config is committed before quitting')
    assert.equal(m.writes,0,'neutral quit does not change profiles')
    console.log('Guard/quit contention: single quit waits for background read and commits configuration.')
    process.exit(0)
  }
  if(scenario==='guard-virtual') {
    let release; m.waitRead=new Promise(resolve=>{release=resolve});let entered=false
    const original=controller.readProfile.bind(controller);controller.readProfile=async(...args)=>{entered=true;return original(...args)}
    await call('games:set','destiny',true)
    for(let i=0;i<150&&!entered;i++)await wait(10)
    assert(entered,'background safety read started')
    let settled=false;const pending=call('virtual:start',true).then(result=>{settled=true;return result})
    await wait(30);assert(!settled,'virtual start waits for background safety read')
    release();m.waitRead=null;const result=await pending
    assert(!/current controller operation|Wait for/.test(result.error||''),'request proceeds past operation lock after safety read')
    assert.equal((await call('profile:read',1,1070)).ok,true,'failed virtual start releases controller lock')
    console.log('Virtual startup waits for background safety reads and releases its operation lock.');process.exit(0)
  }
  if(scenario==='guard-write') {
    m.profile[49]=11;m.profile[50]=11
    let finishRead
    m.waitRead=new Promise(resolve=>{finishRead=resolve})
    let entered=false
    const originalRead=controller.readProfile.bind(controller)
    controller.readProfile=async (...args)=>{entered=true;return originalRead(...args)}
    assert.equal((await call('games:set','destiny',true)).ok,true)
    for(let i=0;i<150&&!entered;i++)await wait(10)
    assert.equal(entered,true,'background guard holds a controller read')
    const bytes=m.profile.slice();bytes[100]^=1
    let settled=false
    const write=call('profile:write',1,Buffer.from(bytes).toString('base64'),1070).then(result=>{settled=true;return result})
    await wait(30)
    assert.equal(settled,false,'one click waits instead of being rejected by background work')
    assert.equal(m.writes,0,'write never overlaps the guard read')
    finishRead();m.waitRead=null
    assert.equal((await write).ok,true,'same request completes once background read releases')
    assert.equal(m.writes,1,'exactly one write; no click spam or duplicate writes')
    assert.equal(m.profile[100],bytes[100])
    console.log('Guard/write contention: one request waits for background RC read and writes exactly once.')
    process.exit(0)
  }
  if(scenario==='kernel') {
    assert.equal((await call('lab:kernel','closed')).ok,false,'kernel test requires a page lease')
    assert.equal((await call('lab:start','kernel-page')).ok,true)
    const measurement=call('lab:kernel','kernel-page')
    await wait(10)
    assert.equal(m.kernelStarted,true)
    assert.equal((await call('profile:write',1,Buffer.from(m.profile).toString('base64'),1070)).ok,false,'kernel trace blocks writes')
    m.window.hide()
    assert.equal((await measurement).ok,false,'hidden Labs cannot publish a result')
    assert.equal(m.kernelCancelled,true,'hiding cancels trace capture')
    console.log('Kernel lifecycle: page-only lease, write exclusion, hide cancellation and stale-result rejection passed.')
    process.exit(0)
  }
  if(scenario==='shift') {
    m.profile[49]=11;m.profile[50]=11;m.profile[66]|=1;m.profile[67]=231
    m.shiftProfile=m.profile.slice();m.shiftProfile[67]=0;m.shiftProfile[49]=1
    const base=m.profile.slice()
    m.menu.find(entry=>entry.label==='Quit Stick Abuse').click()
    await wait(10)
    assert.ok(prompt(),'Shift RC triggers mandatory quit warning with neutral base')
    assert.equal(m.quits,0)
    assert.equal((await call('rc:quitDecision',prompt().id,true)).ok,true)
    await wait(10)
    assert.equal(m.shiftProfile[49],11)
    assert.deepEqual(m.profile,base,'neutral base is preserved')
    assert.equal(m.exitSave,true,'quit commits the configuration session')
    assert.equal(m.quits,1)
    console.log('Shift lifecycle: reachable layer RC checked/reset and config committed before quit.')
    process.exit(0)
  }
  assert.equal((await call('games:set', 'unknown', true)).ok, false)
  assert.equal((await call('games:set', 'destiny', true)).ok, true)
  assert.equal(JSON.parse(readFileSync(join(folder, scenario, 'rc-preferences.json'), 'utf8')).gameGuards.destiny, true)
  assert.equal((await call('games:set', 'destiny', false)).ok, true)
  if (scenario === 'bench') {
    assert.equal((await call('lab:vendor','absent','rest',5)).ok,false,'closed Lab cannot collect');
    assert.equal((await call('lab:start','visible-page')).ok,true);
    const capture=call('lab:vendor','visible-page','rest',5);
    await wait(5);
    assert.equal((await call('profile:write',1,Buffer.from(m.profile).toString('base64'),1070)).ok,false,'measurement blocks conflicting writes');
    assert.equal((await call('lab:cancel','visible-page')).ok,true);
    assert.equal((await capture).ok,false,'capture cancellation settles the caller');
    const native=call('lab:xinput','visible-page',0,5);
    await wait(5);m.window.hide();
    assert.equal((await native).ok,false,'hiding cancels native reader');
    assert.equal(m.benchKilled,true);
    assert.equal((await call('lab:renew','visible-page')).ok,false,'hidden session was disposed');
    assert.equal((await call('lab:start','next-page')).ok,true);
    assert.equal((await call('lab:stop','visible-page')).ok,true);
    assert.equal((await call('lab:renew','next-page')).ok,true,'old renderer cleanup cannot stop new session');
    m.window.emit('minimize');
    assert.equal((await call('lab:renew','next-page')).ok,false);
    assert.equal(m.writes,0,'all bench operations are read-only');
    console.log('Bench integration: page-only collection, conflicting-write guard, cancellation, hide/minimize and stale cleanup passed.');
    process.exit(0);
  }
  if (scenario === 'tarantula-firmware') {
    m.app.getAppPath=()=>folder;controller.readFirmware=async()=> '2.4.3'
    await call('firmware:choose','T3CE:2.1.2')
    assert.equal((await call('firmware:flash','FLASH TARANTULA 2.1.2')).ok,false,'Tarantula image cannot flash the connected G7')
    assert.equal((m.calPackets??[]).length,0,'wrong family sends no update command')
    m.tarantula=true;m.profile=new Uint8Array(1935)
    await call('firmware:choose','2.1.0')
    assert.equal((await call('firmware:flash','FLASH 2.1.0')).ok,false,'G7 image cannot flash a Tarantula')
    await call('firmware:choose','T3CE:2.1.2')
    assert.equal((await call('firmware:flash','FLASH 2.1.2')).ok,false,'Tarantula requires the model-specific confirmation')
    const read=controller.readProfile.bind(controller)
    controller.readProfile=async()=>new Uint8Array(1070)
    assert.equal((await call('firmware:flash','FLASH TARANTULA 2.1.2')).ok,false,'a G7-sized backup is rejected')
    assert.equal((m.calPackets??[]).length,0,'incomplete Tarantula backup sends no command')
    controller.readProfile=read
    assert.equal((await call('firmware:flash','FLASH TARANTULA 2.1.2')).ok,true)
    const state=(await call('firmware:status')).data
    for(let slot=1;slot<=4;slot++)assert.equal(readFileSync(join(state.backup,`profile-${slot}.bin`)).length,1935)
    const session=JSON.parse(readFileSync(join(state.backup,'session.json'),'utf8'));assert.equal(session.target.modelId,'T3CE')
    assert.deepEqual(m.calPackets.filter(p=>p[1]===23),[[15,23,85,136]])
    assert.equal(m.writes,0,'no profile restoration after flash')
    console.log('Tarantula firmware: cross-family rejection, explicit confirmation, full backups and handoff passed with fake hardware.');process.exit(0)
  }
  if (scenario === 'firmware') {
    m.app.getAppPath = () => folder
    controller.readFirmware = async () => '2.2.9'
    assert.equal((await call('firmware:flash', 'FLASH 2.1.0')).ok, false, 'unvalidated firmware is blocked')
    assert.equal((await call('firmware:choose', '2.1.0')).ok, true)
    assert.equal((await call('firmware:flash', 'FLASH 2.2.9')).ok, false, 'wrong confirmation is blocked')
    const readProfile = controller.readProfile.bind(controller)
    controller.readProfile = async () => new Uint8Array(100)
    assert.equal((await call('firmware:flash', 'FLASH 2.1.0')).ok, false, 'incomplete backup aborts the attempt')
    assert.equal((m.calPackets ?? []).length, 0, 'backup failure sends no controller command')
    controller.readProfile = readProfile
    m.rejectFirmware = true
    assert.equal((await call('firmware:flash', 'FLASH 2.1.0')).ok, false)
    assert.equal((m.calPackets ?? []).some(p => p[1] === 23 || p[1] === 252), false, 'failed validation never enters update mode')
    m.rejectFirmware = false
    const transportWrite = controller.transport.write.bind(controller.transport)
    controller.transport.write = packet => { transportWrite(packet); throw Error('simulated disconnect I/O error') }
    let finishFlash
    m.flashWait = new Promise(resolve => { finishFlash = resolve })
    const pending = call('firmware:flash', 'FLASH 2.1.0')
    await wait(30)
    assert.equal((await call('firmware:flash', 'FLASH 2.1.0')).ok, false, 'overlapping firmware attempt blocked')
    assert.equal((await call('profile:read', 1)).ok, false, 'profile writes and reads blocked during flashing')
    assert.equal((await call('device:disconnect')).ok, false, 'disconnect blocked during flashing')
    m.menu.find(entry => entry.label === 'Quit Stick Abuse').click()
    await wait(10)
    assert.equal(m.quits, 0, 'quit blocked during flashing')
    const state = (await call('firmware:status')).data
    assert.ok(state.backup)
    for (let slot = 1; slot <= 4; slot++) assert.equal(readFileSync(join(state.backup, `profile-${slot}.bin`)).length, 1070)
    await wait(2600)
    finishFlash()
    assert.equal((await pending).ok, true)
    assert.equal(m.firmwareCalls.includes('flash'), true, 'handoff I/O error still reaches independent update-mode detection')
    assert.match(JSON.parse(readFileSync(join(state.backup, 'handoff.json'), 'utf8')).error, /I\/O error/, 'handoff error is recorded')
    assert.equal(m.writes, 0, 'no automatic profile restoration')
    assert.equal((await call('firmware:status')).data.running, false)
    assert.deepEqual(m.calPackets.filter(p => p[1] === 23), [[15,23,85,136]], 'observed Connect G7 quick-update command is used exactly once')
    assert.equal(m.calPackets.some(p => p[1] === 252), false, 'generic HID DFU command is never sent')
    console.log('Firmware: unvalidated images, confirmation, preflight failure, backup, operation locks and quit protection passed with fake hardware.')
    process.exit(0)
  }
  assert.equal(m.writes, 0, 'off by default')
  if (scenario === 'yes') {
    controller.emitSample(1, 0)
    assert.equal((await call('device:calibration', 0, 19)).ok, true)
    assert.equal((await call('profile:read', 1)).ok, false, 'profile operations blocked during calibration')
    assert.equal((await call('device:calibration', 1, 19)).ok, false, 'fine commit blocked before ready')
    controller.emitSample(3, 4)
    assert.equal((await call('device:calibration', 1, 19)).ok, false, 'circle step is not completion')
    controller.emitSample(3, 128)
    assert.equal((await call('device:calibration', 1, 19)).ok, true, 'fine commit waits for terminal 0/0')
    assert.deepEqual(m.calPackets.filter(p=>p[1]===254).at(-1), [15,254,1,3,1])
    for (const part of [3,12,15]) {
      controller.emitSample(1,0)
      assert.equal((await call('device:calibration',0,part)).ok,true)
      controller.emitSample(0,part)
      assert.equal((await call('device:calibration',1,part)).ok,true)
    }
    controller.emitSample(1,0)
    assert.equal((await call('device:calibration',0,19)).ok,true)
    controller.emitSample(3,128);m.suppressTerminal=true
    assert.equal((await call('device:calibration',1,19)).ok,false,'missing terminal cannot claim a successful save')
    assert.equal((await call('device:calibration',0,3)).ok,false,'unconfirmed session stays locked until cancel')
    m.suppressTerminal=false
    assert.equal((await call('device:calibration',2,19)).ok,true,'cancel recovers an unconfirmed fine save')
    controller.emitSample(1,0)
    assert.equal((await call('device:calibration',0,16)).ok,true)
    controller.emitSample(0,0);controller.emitSample(1,16)
    assert.equal((await call('device:calibration',1,16)).ok,false,'sensor auto finishes without manual commit')
    assert.equal((await call('device:calibration',0,3)).ok,true)
    assert.equal((await call('device:calibration',2,3)).ok,true,'cancel waits for idle')
  }
  let prevented = false
  m.window.emit('close', { preventDefault() { prevented = true } })
  assert.equal(prevented, true); assert.equal(m.hidden, true); assert.equal(prompt(), undefined, 'closing to tray is silent')
  await call('rc:setReset', true)
  assert.equal(m.writes, 0, 'arming does not change the live profile')
  assert.equal(JSON.parse(readFileSync(join(folder, scenario, 'rc-preferences.json'), 'utf8')).resetRc, true)
  const original = m.profile.slice()
  controller.transport.isOpen = false
  controller.transport.emit('disconnected', new Error('test unplug'))
  await wait(1700)
  assert.equal(m.writes, 1, 'reconnect resets exactly once')
  for (let i = 0; i < 1070; i++) assert.equal(m.profile[i], i === 49 || i === 50 ? 11 : original[i])
  // A receiver can stay connected while the pad itself goes offline.
  controller.input({live:false,timestamp:Date.now()});controller.input({live:true,timestamp:Date.now()})
  await wait(600)
  assert.equal(m.writes, 1, 'already-neutral receiver reconnect skips EEPROM write')
  await call('rc:setReset', false)
  if (scenario !== 'neutral') m.profile[49] = 1
  if (scenario === 'disconnected') controller.disconnect()
  m.menu.find((entry) => entry.label === 'Quit Stick Abuse').click()
  await wait(10)
  if (scenario === 'neutral') assert.equal(m.quits, 1, 'neutral quits without warning')
  else {
    assert.equal(m.quits, 0)
    assert.ok(prompt(), 'mandatory warning works even with automatic reset off')
    assert.equal((await call('profile:read', 1, 1070)).ok, false, 'quit prompt blocks other device operations')
    if (scenario === 'yes') {
      m.failWrite = true
      assert.equal((await call('rc:quitDecision', prompt().id, true)).ok, false)
      assert.equal(m.quits, 0, 'failed reset never quits')
      m.failWrite = false
      assert.equal((await call('rc:quitDecision', prompt().id, true)).ok, true)
      assert.equal(m.profile[49], 11)
    } else {
      if (scenario === 'disconnected') assert.match(prompt().detail, /unknown/)
      assert.equal((await call('rc:quitDecision', prompt().id, false)).ok, true)
      assert.equal(m.profile[49], 1, 'No keeps RC settings')
    }
    assert.equal(m.quits, 1)
  }
  assert.equal(m.trayDestroyed, true)
  console.log(`Lifecycle ${scenario}: tray close, persistent toggle, USB/receiver reconnect and quit behavior passed.`)
}
