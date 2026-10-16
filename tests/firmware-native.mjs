import assert from 'node:assert/strict'
import {existsSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {spawnSync} from 'node:child_process'
const dll=join(process.env.LOCALAPPDATA??'','Programs','GameSir Connect','resources','dfu','jl_firmware_upgrade_x86.dll')
if(process.platform!=='win32'||!existsSync(dll)){console.log('Native firmware image inspection skipped: GameSir library is not installed.');process.exit(0)}
const folder=mkdtempSync(join(tmpdir(),'sal-native-firmware-'))
const modelImages=[['GS_G7_Pro_CE_DV_V210_Key.ufw','GS_G7_Pro_CE_DV','2.1.0','29aa64506ad9fbb347d1e3681a79db4563b78eb93aea6298eae7d952df8e4cae'],['GS_G7_Pro_CE_DV_V229_Key.ufw','GS_G7_Pro_CE_DV','2.2.9','4d2982df76d92f0ef7564a98005c8b01c25e0c9d1f995becbe1afe72e55882c4'],['GS_T3CE_V212_Key.ufw','GS_T3CE','2.1.2','d2b31a437986468bf6a019a2832869c7d9474dcbb0d6fe5ff3c4db3c6bf1fb61'],['GS_T3CE_V212_No_Key.ufw','GS_T3CE','2.1.2','2a02ca2f3dadd0ae801be8a521b000b6ff1db22af98fc72112165a2659daca1c'],['GS_T3CE_V243_Key.ufw','GS_T3CE','2.4.3','46108d2be237b1b7173435b0e2b5a7191ca655b7b93f6560fcd7a25e65e739aa'],['GS_T3CE_V243_No_Key.ufw','GS_T3CE','2.4.3','224c561abfc80a6c28d80547bf38dca6d7127cb8ef30ef3d4edb31bafcadb9ae']]
try{
 const inspect=(entry,override={})=>{const [name,expectedProduct,expectedVersion,sha256]=entry;const request=join(folder,'request.json');writeFileSync(request,JSON.stringify({dll,image:resolve('build/firmware',name),sha256,expectedProduct,expectedVersion,action:'inspect',...override}));const run=spawnSync(resolve('build/firmware-host.exe'),[resolve('build/firmware-worker.ps1'),request],{encoding:'utf8',windowsHide:true,timeout:20000});if(run.error)throw run.error;const result=JSON.parse(run.stdout.trim().split(/\r?\n/).at(-1));return {run,result}}
 for(const entry of modelImages){const {run,result}=inspect(entry);assert.equal(run.status,0,run.stderr+run.stdout);assert.equal(result.product,entry[1]);assert.equal(result.success,true)}
 for(const [override,error] of [[{expectedProduct:'GS_G7_Pro_CE_DV'},/Wrong controller firmware/],[{expectedVersion:'9.9.9'},/version mismatch/],[{sha256:'0'.repeat(64)},/changed since validation/],[{expectedProduct:'unknown'},/Unsupported expected/]]){
  const {run,result}=inspect(modelImages[2],override);assert.equal(run.status,1);assert.equal(result.success,false);assert.match(result.error,error)
 }
 console.log('Native firmware: six image headers accepted; wrong family, wrong version and changed hash rejected. Inspect mode only; no device queries or writes.')
}finally{rmSync(folder,{recursive:true,force:true})}
