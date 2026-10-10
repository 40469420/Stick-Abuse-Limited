// Compile and verify the actual Windows timing kernel without reading a controller.
import { build } from 'esbuild'
import { mkdirSync, rmSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'

if (process.platform !== 'win32') {
  console.log('Windows native bench compiler check skipped on this platform.')
} else {
  const folder = resolve('.bench-native-tmp')
  assert.equal(folder, join(process.cwd(), '.bench-native-tmp'))
  mkdirSync(folder, { recursive: true })
  try {
    await build({ entryPoints: ['src/main/bench-xinput.ts'], outfile: join(folder, 'kernel.mjs'), bundle: true, platform: 'node', format: 'esm' })
    const { benchNativeCode } = await import(pathToFileURL(join(folder, 'kernel.mjs')).href)
    const script = `$ErrorActionPreference='Stop'\nAdd-Type -TypeDefinition @'\n${benchNativeCode}\n'@\n[StickBench]::Stats([double[]]@(0.125,0.25,0.5,1),4)`
    const executable = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    const result = spawnSync(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, encoding: 'utf8', timeout: 20000 })
    assert.equal(result.status, 0, result.stderr)
    const stats = JSON.parse(result.stdout.trim())
    assert.equal(stats.count, 4)
    assert.equal(stats.median, .375)
    assert.equal(stats.p95, .9249999999999998)
    assert.equal(stats.p99, .9849999999999999)
    assert.deepEqual(stats.histogram, [1, 1, 1, 1, 0, 0, 0, 0, 0])
    console.log('Windows native bench: real C# kernel compiles; quantiles and histogram passed without hardware access.')
  } finally { rmSync(folder, { recursive: true, force: true }) }
}
