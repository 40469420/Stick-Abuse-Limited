// Opt-in Windows test: creates and terminates only its own disposable child process.
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {execFileSync,spawn} from 'node:child_process'
if(process.platform!=='win32')throw Error('Windows only')
const folder=mkdtempSync(join(tmpdir(),'sticklabs-apex-test-'))
let child
try{
  const source=join(folder,'Test.cs'),exe=join(folder,'r5apex.exe')
  writeFileSync(source,'class Test { static void Main() { System.Threading.Thread.Sleep(60000); } }')
  execFileSync(join(process.env.SystemRoot||'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe'),['/nologo','/target:exe','/out:'+exe,source],{windowsHide:true})
  const bundled=await build({entryPoints:['src/main/apex-guard.ts'],bundle:true,platform:'node',format:'cjs',write:false})
  const mod={exports:{}};const {createRequire}=await import('node:module');new Function('module','exports','require',bundled.outputFiles[0].text)(mod,mod.exports,createRequire(import.meta.url))
  child=spawn(exe,[],{windowsHide:true,stdio:'ignore'})
  await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject)})
  const targets=await mod.exports.listApex()
  const own=targets.find(p=>p.pid===child.pid&&p.image==='r5apex.exe')
  assert(own,'Disposable child was not detected')
  await mod.exports.killApex(own)
  assert(!(await mod.exports.listApex()).some(p=>p.pid===child.pid),'Disposable child survived')
  console.log('Windows native test passed: detected and force-closed only the disposable test process. No game was targeted.')
}finally{if(child&&child.exitCode===null)child.kill();rmSync(folder,{recursive:true,force:true})}
