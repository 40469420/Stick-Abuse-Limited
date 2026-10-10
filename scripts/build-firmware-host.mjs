import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
if (process.platform !== 'win32') throw new Error('Firmware host requires Windows')
const windows = process.env.SystemRoot || 'C:\\Windows'
const gac = join(windows, 'Microsoft.NET', 'assembly', 'GAC_MSIL', 'System.Management.Automation')
const runtime = join(gac, readdirSync(gac).find(x => x.startsWith('v4.0_3.0.0.0')), 'System.Management.Automation.dll')
const output = resolve('build/firmware-host.exe')
const result = spawnSync(join(windows, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'), ['/nologo', '/target:exe', '/platform:x86', '/optimize+', `/reference:${runtime}`, `/out:${output}`, resolve('build/firmware-host.cs')], { stdio: 'inherit' })
if (result.status !== 0) throw new Error('Firmware host compilation failed')
// Set our own executable's PE32 stack reserve to 2 MB. Never modify vendor DLLs.
const bytes = readFileSync(output)
const pe = bytes.readUInt32LE(0x3c)
if (bytes.readUInt32LE(pe) !== 0x4550 || bytes.readUInt16LE(pe + 4) !== 0x14c || bytes.readUInt16LE(pe + 24) !== 0x10b) throw new Error('Expected x86 PE32 host')
bytes.writeUInt32LE(2 * 1024 * 1024, pe + 24 + 72)
writeFileSync(output, bytes)
console.log('Built x86 firmware host with 2 MB native stack reserve.')
