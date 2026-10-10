import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseFirmwareProgress, validateFirmware } from '../src/main/firmware'

assert.deepEqual(parseFirmwareProgress('{"event":"progress","ret":1,"progress":37,"message":"writing"}'), { event: 'progress', ret: 1, progress: 37, message: 'writing' })
assert.equal(parseFirmwareProgress('{"event":"progress","ret":1,"progress":101,"message":"wrong"}'), null)
assert.equal(parseFirmwareProgress('{"event":"progress","ret":1,"progress":-1,"message":"wrong"}'), null)
assert.equal(parseFirmwareProgress('{"event":"progress","ret":1,"progress":"100","message":"wrong"}'), null)
assert.equal(parseFirmwareProgress('{"success":true}'), null, 'final success is not a progress event')
assert.equal(parseFirmwareProgress('null'), null)
assert.equal(parseFirmwareProgress('native diagnostic text'), null)
assert.ok(parseFirmwareProgress('{"event":"writeStarted","message":"starting"}'))
const folder = mkdtempSync(join(tmpdir(), 'stick-labs-firmware-'))
try {
  const path = join(folder, 'GS_G7_Pro_CE_DV_V210_Key.ufw')
  writeFileSync(path, new Uint8Array(2048))
  assert.throws(() => validateFirmware(path), /Only the verified original/, 'a matching filename never makes unrecognized bytes flashable')
} finally { rmSync(folder, { recursive: true, force: true }) }
console.log('Firmware: progress validation, final-result separation and unrecognized-image rejection passed.')
