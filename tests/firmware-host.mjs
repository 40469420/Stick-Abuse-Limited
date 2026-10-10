import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

if (process.platform !== 'win32') { console.log('Firmware host checks require Windows.'); process.exit(0) }
const host = resolve('build/firmware-host.exe')
const bytes = readFileSync(host), pe = bytes.readUInt32LE(0x3c)
assert.equal(bytes.readUInt16LE(pe + 4), 0x14c, 'host is x86')
assert.equal(bytes.readUInt16LE(pe + 24), 0x10b, 'host is PE32')
assert.equal(bytes.readUInt32LE(pe + 24 + 72), 2 * 1024 * 1024, 'native thread stack reserve is 2 MB')
const folder = mkdtempSync(join(tmpdir(), 'stick-firmware-host-'))
try {
  const script = join(folder, 'worker with spaces.ps1'), request = join(folder, 'request with spaces.json')
  writeFileSync(request, '{}')
  for (const [text, status] of [
    ['param([string]$Request)\nWrite-Output \'{"event":"progress","ret":1,"progress":0,"message":"test"}\'\nWrite-Output \'{"success":true}\'\nexit 0', 0],
    ['param([string]$Request)\nWrite-Output \'{"success":false,"error":"test rejection"}\'\nexit 1', 1],
    ['param([string]$Request)\nthrow "test worker error"', 1],
    ['param([string]$Request)\nWrite-Output "no final result"', 1]
  ]) {
    writeFileSync(script, text)
    const result = spawnSync(host, [script, request], { encoding: 'utf8', windowsHide: true })
    assert.equal(result.status, status, result.stderr)
    if (status === 0) assert.match(result.stdout, /"event":"progress"/)
  }
  console.log('Firmware host: x86 stack reserve, script paths, progress output, success, rejection and errors passed without native DLL or hardware.')
} finally { rmSync(folder, { recursive: true, force: true }) }
