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
    export const app=new EventEmitter();app.isPackaged=false;app.requestSingleInstanceLock=()=>true;app.whenReady=()=>Promise.resolve();app.getPath=()=>${JSON.stringify(folder)}+'/'+process.argv[3];app.getVersion=()=> 'test';
    const m=globalThis.__m={app,handlers:new Map(),messages:[],quits:0,writes:0,profile:Uint8Array.from({length:1070},(_,i)=>i%256)};
    app.quit=()=>{let prevented=false;app.emit('before-quit',{preventDefault(){prevented=true}});if(!prevented){m.quits++;app.emit('will-quit')}};
    export class BrowserWindow extends EventEmitter{constructor(){super();m.window=this;this.webContents={send:(channel,payload)=>m.messages.push({channel,payload})};}loadURL(){}loadFile(){}isDestroyed(){return false}hide(){m.hidden=true}show(){m.hidden=false}restore(){}focus(){}static getAllWindows(){return [m.window]}}
    export class Tray extends EventEmitter{constructor(){super();m.tray=this}setToolTip(){}setContextMenu(menu){m.menu=menu}destroy(){m.trayDestroyed=true}}
    export const Menu={buildFromTemplate:items=>items};export const nativeImage={createFromBitmap:()=>({})};export const dialog={showMessageBox:async()=>({response:1})};export const ipcMain={handle:(channel,fn)=>m.handlers.set(channel,fn)};export const session={defaultSession:{setPermissionRequestHandler(){}}};export const shell={openExternal(){}};
  `
  const controller = `
    import {EventEmitter} from 'node:events';
    export class Controller{constructor(){globalThis.__controller=this;this.transport=new EventEmitter();Object.assign(this.transport,{isOpen:false,currentPath:null,startWatchdog(){},write(packet){globalThis.__m.calPackets??=[];globalThis.__m.calPackets.push(packet)}});this.latestInput={live:true,recordKeys:[],timestamp:Date.now()};this.state='disconnected';}
    get isOpen(){return this.transport.isOpen}onInput(fn){this.input=fn}attachInputDecoder(){}async connect(path){this.transport.isOpen=true;this.transport.currentPath=path;this.state='ready';return {firmware:'2.2.9',dongle:'1.3.5',currentProfile:1}}disconnect(){this.transport.isOpen=false;this.transport.currentPath=null}calibration(state,mask,mode=0){this.transport.write([15,254,state,mask,mode]);if(state!==0&&!globalThis.__m.suppressTerminal)setTimeout(()=>this.emitSample(mode?0:1,0),5)}emitSample(target,status){this.latestInput={live:true,recordKeys:[],calTarget:target,calMask:status,timestamp:Date.now()};this.input(this.latestInput)}async getCurrentProfile(){return 1}async readProfile(){if(globalThis.__m.waitRead)await globalThis.__m.waitRead;return globalThis.__m.profile.slice()}async writeProfileVerified(slot,bytes){globalThis.__m.writes++;if(globalThis.__m.failWrite)throw new Error('simulated verification failure');globalThis.__m.profile=bytes.slice();return {verified:true,rolledBack:false}}}
  `
  const hid = `export function discover(){return [{path:'test-pad',product:'G7 Pro 8K',productId:0x10c5,preferred:true}]}export const discoverLive=discover;`
  try {
    await build({ entryPoints: ['src/main/index.ts'], outfile: join(folder, 'main.cjs'), bundle: true, platform: 'node', format: 'cjs', plugins: [{ name: 'fake-hardware', setup(b) {
      b.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'fake' }))
      b.onResolve({ filter: /^\.\/controller$/ }, () => ({ path: 'controller', namespace: 'fake' }))
      b.onResolve({ filter: /^\.\/hid$/ }, () => ({ path: 'hid', namespace: 'fake' }))
      b.onLoad({ filter: /.*/, namespace: 'fake' }, ({ path }) => ({ contents: { electron, controller, hid }[path], loader: 'js' }))
    } }], external: ['electron-updater'] })
    for (const scenario of ['yes', 'no', 'neutral', 'disconnected']) {
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
  assert.equal((await call('device:connect', 'test-pad')).ok, true)
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
  m.menu.find((entry) => entry.label === 'Quit Stick Labs (Unlimited)').click()
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
