import {firmwareTarget,firmwareConfirmation,FIRMWARE_IMAGES} from '../src/shared/firmware'
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

assert.equal(firmwareTarget('T3CE',0x103d).profileLength,1935)
assert.equal(firmwareTarget('G7ProCE',0x10c5).profileLength,1070)
assert.throws(()=>firmwareTarget('T3CE',0x10c5),/directly by USB/)
assert.throws(()=>firmwareTarget('G7ProCE',0x103d),/directly by USB/)
assert.throws(()=>firmwareTarget('T3Pro',0x090d),/directly by USB/)
for(const definition of FIRMWARE_IMAGES.filter(image=>image.filename)){
 const image=validateFirmware(join('build','firmware',definition.filename))
 assert.equal(image.modelId,definition.modelId);assert.equal(image.version,definition.version)
 if(image.modelId==='T3CE')assert.equal(firmwareConfirmation(image),`FLASH TARANTULA ${image.version}`)
}
console.log('Firmware model, connection and image allowlists passed.')
