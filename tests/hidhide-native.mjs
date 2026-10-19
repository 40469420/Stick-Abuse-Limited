// Recovery subprocess test with a private fake CLI; never accesses HidHide or a controller.
import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,existsSync,rmSync} from 'node:fs'
import {spawn,spawnSync} from 'node:child_process'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
const dir=mkdtempSync(join(tmpdir(),'sal-hide-watch-')),fake=join(dir,'HidHideCLI.exe'),host=join(dir,'watch-test.exe'),log=join(dir,'calls.jsonl')
const csc=join(process.env.SystemRoot||'C:/Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe')
const cs=s=>JSON.stringify(s),compile=(file,out)=>{const result=spawnSync(csc,['/nologo','/target:exe','/platform:x64','/reference:System.Web.Extensions.dll',`/out:${out}`,file],{encoding:'utf8'});assert.equal(result.status,0,result.stdout+result.stderr)}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const processes=[]
try{
 const source=readFileSync('build/virtual/virtual-host.cs','utf8').replace('string root=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),"Nefarius Software Solutions","HidHide");',`string root=${cs(dir)};`)
 writeFileSync(join(dir,'host.cs'),source);compile(join(dir,'host.cs'),host)
 const fakeCode=`using System;using System.IO;using System.Web.Script.Serialization;class FakeCli{static void Main(string[] args){File.AppendAllText(${cs(log)},new JavaScriptSerializer().Serialize(args)+"\\n");if(Array.IndexOf(args,"--cancel")>=0)Console.WriteLine("--cloak-on\\n--inv-off\\n--dev-hide \\\"USB\\\\VID_3537&PID_10C5\\\\OWN\\\"\\n--dev-hide \\\"HID\\\\OTHER\\\"");}}`
 writeFileSync(join(dir,'cli.cs'),fakeCode);compile(join(dir,'cli.cs'),fake)
 const journal=join(dir,'journal.json'),saved={version:1,cli:fake,addedDevices:['USB\\VID_3537&PID_10C5\\OWN'],addedApps:[join(dir,'app.exe')],enabled:true,baseline:['HID\\OTHER']}
 async function start(){writeFileSync(journal,JSON.stringify(saved));const parent=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{windowsHide:true});processes.push(parent);const child=spawn(host,['--hidhide-watch',String(parent.pid),journal],{windowsHide:true});processes.push(child);await new Promise((resolve,reject)=>{let text='';const timeout=setTimeout(()=>reject(Error('watcher readiness timeout')),5000);child.stdout.on('data',chunk=>{text+=chunk;if(text.includes('READY')){clearTimeout(timeout);resolve()}});child.once('exit',code=>{if(!text.includes('READY')){clearTimeout(timeout);reject(Error('watcher early exit '+code))}})});return {parent,child}}
 const {parent,child}=await start();parent.kill();await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('watcher recovery timeout')),10000);child.once('exit',code=>{clearTimeout(timer);assert.equal(code,0);resolve()})});assert(!existsSync(journal),'crash watcher removes completed recovery record')
 const lines=readFileSync(log,'utf8').trim().split('\n').map(line=>JSON.parse(line));assert.equal(lines.length,2);assert.deepEqual(lines[1],['--dev-unhide',saved.addedDevices[0],'--app-unreg',saved.addedApps[0],'--cloak-off'],'only session additions are removed; baseline preserved')
 const second=await start();writeFileSync(journal,JSON.stringify({...saved,enabled:false}));await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('cancel timeout')),5000);second.child.once('exit',code=>{clearTimeout(timer);assert.equal(code,0);resolve()})});second.parent.kill();assert.equal(readFileSync(log,'utf8').trim().split('\n').length,2,'old watcher exits when a new session replaces its journal')
 saved.baseline.push('HID\OLD_DISABLED');saved.suspendedDevices=['HID\OLD_DISABLED']
 const third=await start();third.parent.kill();await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('inactive-rule recovery timeout')),10000);third.child.once('exit',code=>{clearTimeout(timer);assert.equal(code,0);resolve()})});assert(!existsSync(journal));const recovered=readFileSync(log,'utf8').trim().split('\n').map(line=>JSON.parse(line));assert.deepEqual(recovered.at(-1),['--dev-hide','HID\OLD_DISABLED']);assert(recovered.at(-2).includes('--cloak-off'),'inactive rules are restored only after global hiding is disabled')
 console.log('Native HidHide recovery: app-exit watcher restores only owned entries and exits safely for a replaced session. Private fake CLI; no system driver access.')
}finally{for(const p of processes)if(p.exitCode===null)p.kill();await wait(400);rmSync(dir,{recursive:true,force:true})}
