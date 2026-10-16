import {build} from 'esbuild'
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {spawnSync} from 'node:child_process'
import assert from 'node:assert/strict'
const dir=mkdtempSync(join(tmpdir(),'sal-etw-test-'))
try {
 const modulePath=join(dir,'trace.mjs')
 await build({entryPoints:['src/main/deeppoll.ts'],bundle:true,platform:'node',format:'esm',outfile:modulePath})
 const {parseTraceXml,psScript}=await import(pathToFileURL(modulePath).href)
 const event=(provider,opcode,data,time='2026-10-16T00:00:00.0001250Z')=>`<Event>\n<Provider Name="${provider}" Guid="test" />\n<TimeCreated SystemTime="${time}" />\n<Opcode>${opcode}</Opcode>\n${Object.entries(data).map(([k,v])=>`<Data Name="${k}">${v}</Data>`).join('\n')}\n</Event>`
 const xml=join(dir,'fixture.xml')
 writeFileSync(xml,[event('Microsoft-Windows-USB-USBHUB3',0,{fid_UsbDevice:'0xABC',fid_DeviceInterfacePath:'USB#VID_4131&amp;PID_3519'}),event('Microsoft-Windows-USB-UCX',1,{fid_URB_Ptr:'0xFFFFFFFFFFFFFFFF',fid_UsbDevice:'0xABC',type:'BULK_OR_INTERRUPT'}),event('Microsoft-Windows-USB-UCX',2,{fid_URB_Ptr:'0xFFFFFFFFFFFFFFFF',fid_IRP_NtStatus:'0'},'2026-10-16T00:00:00.0002500Z')].join('\n'))
 const parsed=await parseTraceXml(xml)
 assert.equal(parsed.devmap.get('ABC'),'4131:3519');assert.equal(parsed.records.length,2);assert.equal(parsed.records[0].urb,'FFFFFFFFFFFFFFFF');assert.equal(parsed.records[1].kind,'stop')
 const abort=new AbortController();abort.abort();await assert.rejects(parseTraceXml(xml,undefined,abort.signal),/cancelled/)
 const script=psScript(8,"C:\\temp\\owner's.etl",'out.xml','done','cancel','isolated-session')
 assert(script.indexOf('Test-Path -LiteralPath $cancel')<script.indexOf('logman start'));assert(script.includes("owner''s.etl"));assert(script.includes('finally { logman stop $session'))
 const ps=join(dir,'capture.ps1');writeFileSync(ps,script)
 if(process.platform==='win32'){
  const check=join(dir,'syntax.ps1');writeFileSync(check,"$tokens=$null; $errors=$null; [System.Management.Automation.Language.Parser]::ParseFile($args[0],[ref]$tokens,[ref]$errors) | Out-Null; if ($errors.Count) { $errors | Out-String | Write-Output; exit 1 }")
  const result=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',check,ps],{encoding:'utf8',windowsHide:true});assert.equal(result.status,0,result.stdout+result.stderr)
 }
 console.log('ETW: XML pointers/device mapping, cancellation, isolated trace cleanup and PowerShell syntax pass. No privileged trace executed.')
} finally {rmSync(dir,{recursive:true,force:true})}
