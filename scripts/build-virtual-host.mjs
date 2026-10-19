import {createHash} from 'node:crypto'
import {readFileSync,copyFileSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import {join,resolve} from 'node:path'
if(createHash('sha256').update(readFileSync('build/virtual/ViGEmClient.dll')).digest('hex')!=='00303f99e1968d523fbd08a7c691d60d145b7335059ec593947841d124c10875')throw Error('Virtual client integrity check failed')
const csc=join(process.env.SystemRoot||'C:/Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe')
const result=spawnSync(csc,['/nologo','/target:exe','/platform:x64','/optimize+','/reference:System.Web.Extensions.dll',`/out:${resolve('build/virtual/virtual-host.exe')}`,resolve('build/virtual/virtual-host.cs')],{stdio:'inherit'})
if(result.status!==0)throw Error('Virtual controller host compilation failed')

copyFileSync('build/virtual/virtual-host.exe','build/virtual/visibility-check.exe')
