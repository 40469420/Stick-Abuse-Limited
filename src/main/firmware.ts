import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { FIRMWARE_IMAGES, type FirmwareImage } from '../shared/firmware'

export function validateFirmware(path: string): FirmwareImage {
  const bytes = readFileSync(path)
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const known = FIRMWARE_IMAGES.find((image) => image.sha256 === sha256)
  if (!known) throw new Error('Only the verified original allowlisted G7 Pro 8K and experimental Tarantula 8K images are accepted. Receiver and unknown images are blocked.')
  return { path, sha256, version: known.version, variant: known.variant, modelId: known.modelId, product: known.product, experimental: known.experimental, sourceWarning: known.sourceWarning }
}

export interface FirmwareProgress { event: 'progress' | 'writeStarted'; ret?: number; progress?: number; message: string }
export function parseFirmwareProgress(line: string): FirmwareProgress | null {
  try {
    const value = JSON.parse(line)
    if (value.event === 'writeStarted' && typeof value.message === 'string') return value
    if (value.event === 'progress' && Number.isInteger(value.ret) && Number.isInteger(value.progress) && value.progress >= 0 && value.progress <= 100 && typeof value.message === 'string') return value
  } catch { /* Ignore non-protocol output; retain it in the log. */ }
  return null
}
export function runFirmwareWorker(appPath: string, workPath: string, image: FirmwareImage, action: 'inspect' | 'ready' | 'flash', options: { devicePath?: string; onProgress?: (progress: FirmwareProgress) => void } = {}): Promise<{ product: string; version: string; message?: string }> {
  if (process.platform !== 'win32') throw new Error('Firmware testing requires Windows.')
  const dll = join(process.env.LOCALAPPDATA ?? '', 'Programs', 'GameSir Connect', 'resources', 'dfu', 'jl_firmware_upgrade_x86.dll')
  const worker = join(appPath, 'build', 'firmware-worker.ps1')
  const host = join(appPath, 'build', 'firmware-host.exe')
  if (!existsSync(dll) || !existsSync(worker) || !existsSync(host)) throw new Error('Firmware worker files or GameSir Connect’s original local updater library are missing.')
  // Vendor-created threads inherit the executable's native stack reserve.
  const hostBytes = readFileSync(host)
  const pe = hostBytes.readUInt32LE(0x3c)
  if (hostBytes.readUInt32LE(pe) !== 0x4550 || hostBytes.readUInt16LE(pe + 4) !== 0x14c || hostBytes.readUInt16LE(pe + 24) !== 0x10b || hostBytes.readUInt32LE(pe + 24 + 72) < 2 * 1024 * 1024) throw new Error('Firmware host architecture or stack reserve is invalid.')
  mkdirSync(workPath, { recursive: true })
  const request = join(workPath, `request-${action}-${Date.now()}.json`)
  writeFileSync(request, JSON.stringify({ dll, image: image.path, sha256: image.sha256, action, expectedProduct: image.product, expectedVersion: image.version, devicePath: options.devicePath }))
  const log = join(workPath, `worker-${action}-${Date.now()}.log`)
  writeFileSync(log, '')
  return new Promise((resolve, reject) => {
    const child = spawn(host, [worker, request], { windowsHide: true })
    let output = '', error = '', pending = '', writeStarted = false
    const appendLog = (text: string): void => { try { appendFileSync(log, text) } catch { /* A log failure must never crash the app during a native firmware write. */ } }
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString(); output += text; pending += text; appendLog(text)
      const lines = pending.split(/\r?\n/); pending = lines.pop() ?? ''
      for (const line of lines) {
        const progress = parseFirmwareProgress(line)
        if (progress?.event === 'writeStarted') writeStarted = true
        if (progress) { try { options.onProgress?.(progress) } catch { /* Keep the updater alive if the window closed. */ } }
      }
    })
    child.stderr.on('data', (chunk) => { const text = chunk.toString(); error += text; appendLog(text) })
    child.on('error', reject)
    // Never terminate a flashing process on a timer: an interrupted write can damage the device.
    child.on('close', (code) => {
      try {
        const result = JSON.parse(output.trim().split(/\r?\n/).at(-1) ?? '{}')
        if (code !== 0 || result.success !== true) throw new Error(result.error ?? `Updater exited ${code}. ${writeStarted ? 'A firmware write was attempted; controller state is unknown.' : 'No write-start confirmation was received; controller state must be checked.'} ${error || output}`)
        resolve(result)
      } catch (e) { reject(e) }
    })
  })
}
