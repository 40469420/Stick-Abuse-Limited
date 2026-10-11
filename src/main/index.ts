import { ApexGuard, listApex, killApex } from './apex-guard'
/**
 * Stick Labs (Unlimited) — controller session, background RC reset and profile editing.
 */
import { app, BrowserWindow, dialog, ipcMain, session, shell, Tray, Menu, nativeImage } from 'electron'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { Controller, type DeviceInfo } from './controller'
import { discover, discoverLive } from './hid'
import { steamInfo, exportApexDeadzones, listInstalledGames, exportDeadzonesToGames } from './steam'
import { PROFILE_LENGTH } from '../shared/protocol'
import { MariusReader, discoverMarius } from './marius'
import { RcCapture, type RcCaptureResult } from './rc-capture'
import { listXInput, captureXInput } from './xinput'
import { BenchSession } from './bench-session'
import { runXInputBench } from './bench-xinput'
import { distribution, type BenchMode } from '../shared/bench'
import { identifyModel } from '../shared/models'
import type { CenterDirection } from '../shared/center'
import { neutralRcProfile, type RcResetStatus } from './rc-reset'
import { SequenceRecorder } from '../shared/macros'
import { validateFirmware, runFirmwareWorker } from './firmware'
import type { FirmwareImage, FirmwareStatus } from '../shared/firmware'

let firmwareImage: FirmwareImage | null = null
let firmwareStatus: FirmwareStatus = { running: false, message: 'Choose an original firmware file to validate. Nothing has been flashed.', backup: null }

const controller = new Controller()
const rcCapture = new RcCapture()
const bench = new BenchSession(value => send('lab:live', value))
/** MARIUS preview reader — read-only driver, no write path exists. */
const mariusReader = new MariusReader()
let window_: BrowserWindow | null = null
let connectedInfo: DeviceInfo | null = null
const primaryInstance = app.requestSingleInstanceLock()
if (!primaryInstance) app.quit()
app.on('second-instance', () => showWindow())
let tray: Tray | null = null
let quitting = false
let apexEnabled = false
let resetEnabled = false
let resetting = false
let ioJobs = 0
let calibrationSession: { mask: number; fine: boolean; seen: boolean; started: number } | null = null
let reconnectPath: string | null = null
let reconnectModel: string | null = null
let streamLive: boolean | null = null
let receiverResetPending = false
let closeChecking = false
let closePrompt: string | null = null
let quitAction: (() => void) | null = null
function finishQuit(): void { quitting = true; if (quitAction) quitAction(); else app.quit() }
let resetMessage = 'Automatic RC reset is off.'
let recording: { id: string; recorder: SequenceRecorder; started: number; error: string | null; lastReport: number } | null = null
const resetStatus = (): RcResetStatus => ({ enabled: resetEnabled, running: resetting, message: resetMessage })
let lastApexAlert: string | null = null
const apexGuard = new ApexGuard({
  list: listApex, kill: killApex,
  rc: async () => {
    if (firmwareStatus.running || calibrationSession || resetting || ioJobs || reconnecting || recording || closeChecking || closePrompt || bench.active || !controller.isOpen) return null
    const device = discover().find(d => d.path === controller.transport.currentPath)
    if (!device || !['G7ProCE','G7ProS'].includes(identifyModel(device.product,device.productId)?.id ?? '')) return null
    ioJobs++
    try { const slot = await controller.getCurrentProfile(); return neutralRcProfile(await controller.readProfile(slot,1070)) !== null }
    finally { ioJobs-- }
  },
  changed: status => { send('apex:status',status); if(status.alert && status.alert !== lastApexAlert) showWindow(); lastApexAlert=status.alert }
})
function reportReset(message: string): void {
  resetMessage = message
  send('rc:resetStatus', resetStatus())
  tray?.setToolTip(`Stick Labs (Unlimited) — ${message}`.slice(0, 127))
}
function savePreferences(): void {
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(join(app.getPath('userData'), 'rc-preferences.json'), JSON.stringify({ resetRc: resetEnabled, apexGuard: apexEnabled }), 'utf8')
}
async function resetRcAfterConnect(force = false): Promise<boolean> {
  if ((!resetEnabled && !force) || resetting) return false
  const device = discover().find((d) => d.path === controller.transport.currentPath)
  if (!device || !['G7ProCE', 'G7ProS'].includes(identifyModel(device.product, device.productId)?.id ?? '')) {
    reportReset('RC reset skipped: controller layout is not supported.')
    return false
  }
  resetting = true
  reportReset('Checking active-profile RC settings…')
  try {
    const slot = await controller.getCurrentProfile()
    if (connectedInfo) connectedInfo.currentProfile = slot
    const before = await controller.readProfile(slot, 1070)
    const next = neutralRcProfile(before)
    if (!next) reportReset(`P${slot}: both RC filters are already neutral.`)
    else {
      const result = await controller.writeProfileVerified(slot, next, 1070)
      if (!result.verified) throw new Error('Reset did not verify; previous profile was restored.')
      reportReset(`P${slot}: both RC filters reset to neutral and verified.`)
    }
    return true
  } catch (e) { reportReset(`RC reset failed: ${(e as Error).message}`); return false }
  finally {
    resetting = false
    controller.attachInputDecoder()
    controller.transport.startWatchdog(4000, () => void autoReconnect('silent'))
    send('rc:resetStatus', resetStatus())
  }
}

async function requestQuit(): Promise<void> {
  if (quitting || closeChecking || closePrompt) { if (closePrompt) showWindow(); return }
  showWindow()
  if (ioJobs || resetting || recording || calibrationSession) {
    send('rc:quitError', 'Wait for the current controller operation or recording to finish before quitting.')
    return
  }
  closeChecking = true
  let detail = ''
  let neutral = false
  try {
    if (!controller.isOpen) throw new Error('Controller is disconnected; its RC settings cannot be checked.')
    const device = discover().find((d) => d.path === controller.transport.currentPath)
    if (!device || !['G7ProCE', 'G7ProS'].includes(identifyModel(device.product, device.productId)?.id ?? '')) {
      // This feature never exposes RC writes for unsupported controllers.
      neutral = true
    } else {
      ioJobs++
      try {
        const slot = await controller.getCurrentProfile()
        neutral = neutralRcProfile(await controller.readProfile(slot, 1070)) === null
        detail = `Both sticks in the active profile (P${slot}) will be reset to level 0. Other profiles are kept.`
      } finally { ioJobs-- }
    }
  } catch (e) { detail = `RC state is unknown. ${(e as Error).message} Yes attempts a verified reset; No quits without resetting.` }
  finally { closeChecking = false }
  if (neutral) { finishQuit(); return }
  // Never rely on the automatic-reset preference for this mandatory quit check.
  closePrompt = `${Date.now()}-${Math.random()}`
  send('rc:quitPrompt', { id: closePrompt, detail })
}

function send(channel: string, ...args: unknown[]): void {
  if (window_ && !window_.isDestroyed()) window_.webContents.send(channel, ...args)
}

setInterval(() => {
  const session = calibrationSession
  if (!session) return
  if (!controller.isOpen || !controller.latestInput?.live) { calibrationSession = null; return }
  try {
    if (Date.now() - session.started > 125000) { controller.calibration(2, session.mask, session.fine ? 1 : 0); calibrationSession = null }
    else if (session.fine) controller.transport.write([15, 242, 0, ...Array(61).fill(0)])
  } catch { calibrationSession = null }
}, 500).unref()

const INPUT_SAMPLE_MS = 33
let lastSampleAt = 0
let samplePending = false

controller.onInput((input) => {
  if (bench.active) bench.push(input)
  if (calibrationSession) {
    if (!input.live) calibrationSession = null
    else if (calibrationSession.fine ? input.calTarget === 3 && [0, 1, 2, 3, 4, 128].includes(input.calMask) : input.calTarget !== 1) calibrationSession.seen = true
    else if (calibrationSession.seen && !calibrationSession.fine && calibrationSession.mask === 16) calibrationSession = null
  }
  const wasLive = streamLive
  streamLive = input.live
  if (resetEnabled && !resetting) {
    if (wasLive === true && !input.live) reportReset('Controller disconnected. RC reset is pending reconnection.')
    if (wasLive === false && input.live) receiverResetPending = true
  }
  if (recording && !recording.error) {
    try {
      if (!input.live || !input.recordKeys) throw new Error('Controller input is unavailable; recording discarded.')
      if (performance.now() - recording.started > 30000) throw new Error('Recording reached the 30-second limit; stop and record a shorter sequence.')
      recording.recorder.push(input.recordKeys, performance.now())
      recording.lastReport = Date.now()
    } catch (e) { recording.error = (e as Error).message; send('macro:recordError', recording.error) }
  }
  rcCapture.push(input)
  const now = Date.now()
  const emit = (): void => {
    lastSampleAt = Date.now()
    const input = controller.latestInput
    if (input) send('input:sample', input)
  }
  if (now - lastSampleAt < INPUT_SAMPLE_MS) {
    if (samplePending) return
    samplePending = true
    setTimeout(() => {
      samplePending = false
      emit()
    }, INPUT_SAMPLE_MS)
    return
  }
  emit()
})

controller.transport.on('stats', (stats) => send('device:stats', stats))

const sleepMs = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

let reconnecting = false
let sessionEpoch = 0
/**
 * The pad drops its USB interface for ~1-2 s when a change is applied live
 * (write to the running slot, or switch onto a changed slot). Instead of
 * making the user Rescan + Connect by hand, re-open the first stable
 * interface: the PID reappears before it is usable, so presence is
 * re-checked after a gap before opening (same lesson as the write path).
 * Gives up after ~30 s and falls back to manual reconnect.
 */
async function autoReconnect(reason: string): Promise<void> {
  if (reconnecting || resetting || ioJobs || quitting) return
  reconnecting = true
  const epoch = sessionEpoch
  try {
    send('device:reconnecting', reason)
    const deadline = Date.now() + 30000
    while (!quitting && (resetEnabled || Date.now() < deadline)) {
      if (epoch !== sessionEpoch || controller.transport.isOpen) return
      await sleepMs(800)
      if (epoch !== sessionEpoch || controller.transport.isOpen) return
      const cands = discover()
      const sameModel = cands.filter((c) => reconnectModel && identifyModel(c.product, c.productId)?.id === reconnectModel)
      const target = reconnectPath ? cands.find((c) => c.path === reconnectPath) ?? (sameModel.length === 1 ? sameModel[0] : undefined) : cands.find((c) => c.preferred) ?? cands[0]
      if (!target) continue
      await sleepMs(600)
      if (epoch !== sessionEpoch || controller.transport.isOpen) return
      if (!discover().some((c) => c.path === target.path)) continue
      try {
        const info = await controller.connect(target.path)
        connectedInfo = info
        reconnectPath = target.path
        streamLive = null
        controller.attachInputDecoder()
        controller.transport.startWatchdog(4000, () => void autoReconnect('silent'))
        await resetRcAfterConnect()
        send('device:reconnected', info)
        return
      } catch {
        /* keep trying until the deadline */
      }
    }
    send('device:stale', controller.transport.currentPath)
  } finally {
    reconnecting = false
  }
}

controller.transport.on('disconnected', (err: Error) => {
  bench.stop()
  if (recording) { recording.error = 'Controller disconnected; recording discarded.'; send('macro:recordError', recording.error) }
  if (resetEnabled) reportReset('Controller disconnected. RC reset is pending reconnection.')
  void autoReconnect(err?.message ?? 'disconnected')
})
controller.transport.on('reopened', () => {
  controller.attachInputDecoder()
  controller.transport.startWatchdog(4000, () => void autoReconnect('silent'))
  if (resetEnabled && !resetting) receiverResetPending = true
})

function b64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}
function fromB64(text: string): Uint8Array {
  return new Uint8Array(Buffer.from(text, 'base64'))
}
function handle(channel: string, fn: (...args: any[]) => unknown): void {
  ipcMain.handle(channel, async (_event, ...args) => {
    const usesDevice = (/^(profile:|device:|diag:|macro:)/.test(channel) || channel === 'firmware:flash' || ['lab:vendor', 'lab:xinput', 'lab:ping'].includes(channel)) && !['device:discover', 'diag:xinputSlots', 'diag:rcCancel', 'macro:cancel'].includes(channel)
    let acquired = false
    try {
      if (firmwareStatus.running && (usesDevice || channel.startsWith('firmware:') && channel !== 'firmware:status')) throw new Error('Wait for the firmware operation to finish. Do not disconnect or quit.')
      if (usesDevice && calibrationSession && !['device:calibration', 'device:disconnect'].includes(channel)) throw new Error('Finish or cancel calibration before changing controller settings.')
      if (usesDevice && (resetting || ioJobs)) throw new Error('Wait for the current controller operation to finish.')
      if (usesDevice && (closeChecking || closePrompt)) throw new Error('Finish the quit check before using the controller.')
      if (usesDevice && recording && !['macro:stop', 'device:disconnect'].includes(channel)) throw new Error('Stop macro recording before changing controller settings.')
      if (usesDevice) { ioJobs++; acquired = true }
      return { ok: true, data: await fn(...args) }
    } catch (err) {
      return { ok: false, error: (err as Error)?.message ?? String(err) }
    } finally {
      if (acquired) {
        ioJobs--
        if (!controller.isOpen && reconnectPath) void autoReconnect('Controller operation ended while disconnected')
      }
    }
  })
}

handle('apex:status', () => ({...apexGuard.status}))
handle('apex:dismiss', () => { apexGuard.dismiss(); return true })
handle('apex:set', (enabled: boolean) => {
  if(typeof enabled !== 'boolean') throw new Error('Invalid Apex guard preference')
  const previous=apexEnabled;apexEnabled=enabled
  try { savePreferences() } catch(e) {apexEnabled=previous;throw e}
  apexGuard.setEnabled(enabled);void apexGuard.tick();return {...apexGuard.status}
})
handle('firmware:status', () => firmwareStatus)
handle('firmware:choose', async (version?: string) => {
  firmwareImage = null
  let path: string
  if (version === '2.1.0' || version === '2.2.9') {
    path = join(app.getAppPath(), 'build', 'firmware', `GS_G7_Pro_CE_DV_V${version === '2.1.0' ? '210' : '229'}_Key.ufw`)
  } else {
    if (version !== undefined) throw new Error('Unsupported firmware version')
    const selected = await dialog.showOpenDialog({ title: 'Choose original G7 Pro 8K controller firmware', properties: ['openFile'], filters: [{ name: 'GameSir firmware', extensions: ['ufw'] }] })
    if (selected.canceled) return null
    path = selected.filePaths[0]
  }
  const image = validateFirmware(path)
  firmwareImage = null
  firmwareStatus = { ...firmwareStatus, running: true, message: 'Checking the image with GameSir’s original updater…' }
  try {
    await runFirmwareWorker(app.getAppPath(), join(app.getPath('userData'), 'firmware-tests'), image, 'inspect')
    firmwareImage = image
    firmwareStatus.message = `Original controller ${image.version} (${image.variant}) validated. No firmware written.`
    return image
  } finally { firmwareStatus.running = false }
})
handle('firmware:flash', async (confirmation: string) => {
  const image = firmwareImage
  if (!image || confirmation !== `FLASH ${image.version}`) throw new Error('Validate an image and type its exact confirmation first.')
  validateFirmware(image.path)
  const device = discover().find((d) => d.path === controller.transport.currentPath)
  if (!controller.isOpen || !device || ![0x10c5, 0x10c6].includes(device.productId) || identifyModel(device.product, device.productId)?.id !== 'G7ProCE') throw new Error('Connect the G7 Pro 8K directly by USB and load it in Stick Labs first. Receiver flashing is not supported.')
  firmwareStatus = { running: true, message: 'Saving all four controller profiles before flashing…', backup: null }
  send('firmware:status', firmwareStatus)
  const folder = join(app.getPath('userData'), 'firmware-tests', new Date().toISOString().replace(/[:.]/g, '-'))
  try {
    mkdirSync(folder, { recursive: true })
    const current = await controller.getCurrentProfile()
    const firmware = await controller.readFirmware()
    for (let slot = 1; slot <= 4; slot++) {
      const bytes = await controller.readProfile(slot, 1070)
      if (bytes.length !== 1070) throw new Error(`P${slot} backup incomplete. Flash cancelled.`)
      writeFileSync(join(folder, `profile-${slot}.bin`), bytes)
    }
    writeFileSync(join(folder, 'session.json'), JSON.stringify({ firmware, current, device, target: image, date: new Date().toISOString() }, null, 2))
    firmwareStatus.backup = folder
    const recovery = validateFirmware(join(app.getAppPath(), 'build', 'firmware', 'GS_G7_Pro_CE_DV_V229_Key.ufw'))
    await runFirmwareWorker(app.getAppPath(), folder, recovery, 'inspect')
    await runFirmwareWorker(app.getAppPath(), folder, image, 'ready')
    firmwareStatus.message = 'Entering update mode. Keep USB connected and wait; do not quit.'
    send('firmware:status', firmwareStatus)
    sessionEpoch++
    reconnectPath = null
    receiverResetPending = false
    // Connect's active G7 Pro 8K update button uses QuickUpdate, not the
    // generic HID DFU command 0F FC. Confirmed in Connect 1.11.1 and 1.16.7.
      // A reset can invalidate the HID handle before Windows reports the write
      // complete. Do not equate that with a successful command: the worker must
      // independently find exactly one matching update-mode device before writing.
      let handoffError: string | null = null
      try { controller.transport.write([0x0f, 0x17, 0x55, 0x88]) }
      catch (error) { handoffError = (error as Error).message ?? String(error) }
    controller.disconnect()
    connectedInfo = null
      try { writeFileSync(join(folder, 'handoff.json'), JSON.stringify({ command: '0F175588', error: handoffError, date: new Date().toISOString() }, null, 2)) }
      catch { /* Logging must not interrupt an update-mode handoff. */ }
      if (handoffError) {
        firmwareStatus.message = `Update command returned: ${handoffError}. Checking update-mode identity before any firmware write.`
        send('firmware:status', firmwareStatus)
      }
    send('device:reconnecting', 'Firmware update mode')
    await new Promise((resolve) => setTimeout(resolve, 600))
    const result = await runFirmwareWorker(app.getAppPath(), folder, image, 'flash', {
      devicePath: device.path,
      onProgress: (progress) => {
        firmwareStatus.message = progress.event === 'writeStarted' ? progress.message : `GameSir update ${progress.progress}% · ${progress.message}${(progress.ret ?? 0) < 0 ? ` (error ${progress.ret})` : ''}`
        send('firmware:status', firmwareStatus)
      }
    })
    firmwareStatus.message = result.message ?? 'Updater completed. Reconnect and verify the running firmware version before testing RC.'
    return firmwareStatus
  } catch (error) {
    firmwareStatus.message = `Firmware test stopped: ${(error as Error).message}`
    throw error
  } finally { firmwareStatus.running = false; send('firmware:status', firmwareStatus) }
})
handle('firmware:openBackup', async () => {
  if (!firmwareStatus.backup) throw new Error('No firmware-test backup has been saved yet.')
  const error = await shell.openPath(firmwareStatus.backup)
  if (error) throw new Error(error)
  return true
})

handle('device:discover', () => discoverLive())
handle('device:connect', async (path: string): Promise<DeviceInfo> => {
  sessionEpoch++
  const info = await controller.connect(path)
  connectedInfo = info
  controller.attachInputDecoder()
  controller.transport.startWatchdog(4000, () => void autoReconnect('silent'))
  reconnectPath = path
  const selectedDevice = discover().find((d) => d.path === path)
  reconnectModel = selectedDevice ? identifyModel(selectedDevice.product, selectedDevice.productId)?.id ?? null : null
  streamLive = null
  if (resetEnabled) savePreferences()
  await resetRcAfterConnect()
  return info
})
handle('device:disconnect', () => {
  bench.stop()
  if (calibrationSession && controller.isOpen) controller.calibration(2, calibrationSession.mask, calibrationSession.fine ? 1 : 0)
  calibrationSession = null
  sessionEpoch++
  reconnectPath = null
  reconnectModel = null
  receiverResetPending = false
  if (resetEnabled) savePreferences()
  controller.disconnect()
  return true
})
handle('rc:resetStatus', () => resetStatus())
handle('rc:quitDecision', async (id: string, reset: boolean) => {
  if (!closePrompt || closePrompt !== id || typeof reset !== 'boolean') throw new Error('This quit prompt is no longer active')
  if (ioJobs || resetting || recording) throw new Error('Wait for the current controller operation before quitting.')
  if (reset && !await resetRcAfterConnect(true)) throw new Error(resetMessage + ' Stick Labs (Unlimited) is still running. You can retry or choose No to quit without resetting.')
  closePrompt = null
  finishQuit()
  return true
})
handle('rc:setReset', (enabled: boolean) => {
  if (typeof enabled !== 'boolean') throw new Error('Expected an on/off setting')
  const previous = resetEnabled
  resetEnabled = enabled
  if (!enabled) receiverResetPending = false
  try { savePreferences() } catch (e) { resetEnabled = previous; throw e }
  reportReset(enabled ? 'RC reset armed for the next connection/reconnection.' : 'Automatic RC reset is off.')
  if (enabled && reconnectPath && !controller.isOpen) void autoReconnect('Reset enabled')
  return resetStatus()
})
handle('profile:read', async (profile: number, total?: number) => {
  const length = total ?? PROFILE_LENGTH
  if (!Number.isInteger(length) || length < 100 || length > 4096) throw new Error(`refusing read of ${length} bytes`)
  const bytes = await controller.readProfile(profile, length)
  return { bytes: b64(bytes), length: bytes.length }
})
handle('profile:write', async (profile: number, dataB64: string, length?: number) => {
  const bytes = fromB64(dataB64)
  const total = length ?? PROFILE_LENGTH
  if (bytes.length !== total) throw new Error(`payload is ${bytes.length} bytes, expected ${total}`)
  return controller.writeProfileVerified(profile, bytes, total)
})
handle('profile:switch', async (profile: number) => {
  await controller.switchProfile(profile)
  return true
})
handle('profile:current', async () => controller.getCurrentProfile())
const captureJobs = new Map<string, () => void>()
handle('diag:xinputSlots', () => listXInput())
handle('diag:rcCapture', async (id: string, xinputSlot?: number) => {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(id)) throw new Error('Invalid capture ID')
  if (captureJobs.size || centerBusy) throw new Error('A measurement or center adjustment is already running.')
  const epoch = sessionEpoch
  const valid = (): boolean => controller.isOpen && epoch === sessionEpoch
  if (xinputSlot === undefined) {
    captureJobs.set(id, () => rcCapture.cancel(id))
    try { return await rcCapture.start(id, valid) } finally { captureJobs.delete(id) }
  }
  let begin!: () => void
  const vendor = new Promise<RcCaptureResult>((resolve, reject) => {
    begin = () => { void rcCapture.start(id, valid).then(resolve, reject) }
  })
  const helper = captureXInput(xinputSlot, begin)
  const cancel = (): void => { rcCapture.cancel(id); helper.cancel() }
  captureJobs.set(id, cancel)
  try {
    const [measured, xinput] = await Promise.all([vendor, helper.promise])
    if (!valid()) throw new Error('Controller connection changed. Capture discarded.')
    return { ...measured, xinput }
  } catch (e) { cancel(); throw e } finally { captureJobs.delete(id) }
})
handle('diag:rcCancel', (id: string) => { captureJobs.get(id)?.(); return true })
handle('macro:start', (id: string) => {
  const device = discover().find((d) => d.path === controller.transport.currentPath)
  if (!device || identifyModel(device.product, device.productId)?.id !== 'G7ProCE') throw new Error('Controller recording currently requires an identified G7 Pro 8K.')
  if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(id)) throw new Error('Invalid recording ID')
  const sample = controller.latestInput
  if (!sample?.live || !sample.recordKeys || Date.now() - sample.timestamp > 1000) throw new Error('Wait for live controller input before recording.')
  if (sample.recordKeys.length) throw new Error('Release all controller buttons before recording.')
  if (captureJobs.size || centerBusy) throw new Error('Wait for the current measurement or adjustment.')
  recording = { id, recorder: new SequenceRecorder(), started: performance.now(), error: null, lastReport: Date.now() }
  return true
})
handle('macro:stop', (id: string) => {
  if (!recording || recording.id !== id) throw new Error('Recording is no longer active')
  const captured = recording
  recording = null
  if (captured.error) throw new Error(captured.error)
  if (!controller.isOpen || Date.now() - captured.lastReport > 1000) throw new Error('Controller input went stale; recording discarded.')
  if (performance.now() - captured.started > 30000) throw new Error('Recording exceeded the 30-second limit')
  return captured.recorder.finish(performance.now())
})
handle('macro:cancel', (id: string) => { if (recording?.id === id) recording = null; return true })
let centerBusy = false
handle('device:adjustCenter', async (side: number, direction: CenterDirection) => {
  const device = discover().find((d) => d.path === controller.transport.currentPath)
  if (!device || identifyModel(device.product, device.productId)?.id !== 'G7ProCE') {
    throw new Error('Center adjustment is currently supported only for identified G7 Pro 8K controllers.')
  }
  if (centerBusy || captureJobs.size) throw new Error('Wait for the current measurement or adjustment to finish.')
  centerBusy = true
  try { await controller.adjustCenter(side, direction); return true } finally { centerBusy = false }
})
handle('device:calibration', async (state: number, selection = 15) => {
  const fine = selection === 19, mask = fine ? 3 : selection
  if (![0, 1, 2].includes(state) || ![3, 12, 15, 16, 19].includes(selection)) throw new Error('Invalid calibration request.')
  const device = discover().find((d) => d.path === controller.transport.currentPath)
  if (!device || identifyModel(device.product, device.productId)?.id !== 'G7ProCE') throw new Error('Guided calibration requires an identified G7 Pro 8K.')
  if (state === 0) {
    if (calibrationSession) throw new Error('Calibration is already running. Cancel it first.')
    if (!controller.latestInput?.live) throw new Error('Wait for live controller input.')
    if (fine) controller.transport.write([15, 242, 0, ...Array(61).fill(0)])
    controller.calibration(0, mask, fine ? 1 : 0)
    calibrationSession = { mask, fine, seen: false, started: Date.now() }
    return true
  }
  const session = calibrationSession
  if (!session || session.mask !== mask || session.fine !== fine) throw new Error('No matching calibration session. Reconnect and start again if needed.')
  const latest = controller.latestInput
  const passed = latest && (fine ? latest.calTarget === 3 && latest.calMask === 128 : (latest.calMask & mask) === mask)
  if (state === 1 && (!session.seen || !passed || mask === 16)) throw new Error('Wait for the controller to report every selected stage passed.')
  const sentAt = Date.now()
  controller.calibration(state, mask, fine ? 1 : 0)
  for (let i = 0; i < 60; i++) {
    await sleepMs(50)
    const input = controller.latestInput
    if (!controller.isOpen || !input?.live) { calibrationSession = null; throw new Error('Disconnected; calibration result is unknown.') }
    if (input.timestamp > sentAt && (fine ? input.calTarget === 0 && input.calMask === 0 : input.calTarget === 1)) { calibrationSession = null; return true }
  }
  throw new Error('Controller did not confirm leaving calibration. Try Cancel; the save result is unknown.')
})
// MARIUS board preview — reads only. There is intentionally no write handler.
handle('marius:discover', () => discoverMarius())
handle('marius:connect', async (path: string) => mariusReader.connect(path))
handle('marius:read', async () => {
  const { bytes, parsed } = await mariusReader.readConfig()
  return { bytes: b64(bytes), parsed }
})
handle('marius:raw', async () => mariusReader.readRawSticks())
handle('marius:disconnect', () => {
  mariusReader.close()
  return true
})
handle('system:openExternal', (url: string) => {
  if (typeof url !== 'string' || !/^https:\/\//.test(url)) throw new Error('blocked URL')
  void shell.openExternal(url)
  return true
})
handle('system:version', () => app.getVersion())
handle('steam:info', () => steamInfo())
handle('steam:export', (left: { begin: number; end: number }, right: { begin: number; end: number }, mouseRate?: number | null, curveExp?: number | null) =>
  exportApexDeadzones(left, right, mouseRate ?? null, curveExp ?? null)
)
handle('steam:games', () => listInstalledGames())
handle('steam:exportAll', (left: { begin: number; end: number }, right: { begin: number; end: number }, mouseRate?: number | null, curveExp?: number | null) => {
  const games = listInstalledGames()
  return { games: listInstalledGames(), result: exportDeadzonesToGames(left, right, games, mouseRate ?? null, curveExp ?? null) }
})
handle('lab:start', (id: string) => {
  if (!window_ || window_.isDestroyed() || firmwareStatus.running || window_?.isVisible && !window_.isVisible() || window_?.isMinimized && window_.isMinimized()) throw new Error('Open the Lab window after the current operation finishes.')
  bench.start(id); return true
})
handle('lab:renew', (id: string) => { bench.renew(id); return true })
handle('lab:stop', (id: string) => { bench.stop(id); return true })
handle('lab:cancel', (id: string) => { bench.require(id); bench.cancelCapture(); bench.cancelJob?.(); return true })
handle('lab:vendor', (id: string, mode: BenchMode, seconds: number) => {
  bench.require(id)
  const device = discover().find(d => d.path === controller.transport.currentPath)
  if (!controller.isOpen || identifyModel(device?.product, device?.productId)?.id !== 'G7ProCE') throw new Error('Connect a G7 Pro 8K for original-axis captures.')
  return bench.startCapture(id, mode, seconds)
})
handle('lab:xinput', async (id: string, slot: number, seconds: number) => {
  bench.require(id)
  if (bench.measuring) throw new Error('Finish or cancel the current test first.')
  const job = runXInputBench(slot, seconds, () => { bench.require(id); send('lab:ready', { id }) })
  bench.cancelJob = job.cancel
  try { return await job.promise } finally { if (bench.cancelJob === job.cancel) bench.cancelJob = null }
})
handle('lab:ping', async (id: string) => {
  bench.require(id)
  if (!controller.isOpen || bench.measuring) throw new Error('Connect the controller and finish the current test first.')
  let cancelled = false
  const cancel = (): void => { cancelled = true }
  bench.cancelJob = cancel
  const samples: number[] = []
  try {
    for (let i = 0; i < 30; i++) {
      bench.require(id)
      if (cancelled) throw new Error('Round-trip test cancelled.')
      const started = performance.now()
      await controller.getCurrentProfile()
      bench.require(id)
      if (cancelled) throw new Error('Round-trip test cancelled.')
      samples.push(performance.now() - started)
      await sleepMs(10)
    }
    return distribution(samples)
  } finally { if (bench.cancelJob === cancel) bench.cancelJob = null }
})

handle('diag:ping', async (count: number) => {
  const n = Math.max(1, Math.min(50, count))
  const samples: number[] = []
  for (let i = 0; i < n; i++) {
    const started = performance.now()
    await controller.getCurrentProfile()
    samples.push(performance.now() - started)
  }
  const sorted = [...samples].sort((a, b) => a - b)
  return {
    count: samples.length,
    samples,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    median: sorted[Math.floor(sorted.length / 2)],
    mean: samples.reduce((a, b) => a + b, 0) / samples.length
  }
})

function createWindow(): void {
  window_ = new BrowserWindow({
    width: 1220,
    height: 860,
    minWidth: 1000,
    minHeight: 680,
    backgroundColor: '#14090d',
    title: 'Stick Labs (Unlimited)',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  if (process.env.ELECTRON_RENDERER_URL) void window_.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void window_.loadFile(join(__dirname, '../renderer/index.html'))
  window_.on('hide', () => bench.stop())
  window_.on('minimize', () => bench.stop())
  window_.webContents.on?.('render-process-gone', () => bench.stop())
  window_.on('closed', () => {
    bench.stop()
    window_ = null
  })
  window_.on('close', (event) => {
    if (!quitting && tray) { event.preventDefault(); window_?.hide() }
  })
}

function showWindow(): void {
  if (!window_ || window_.isDestroyed()) createWindow()
  window_?.show()
  window_?.restore()
  window_?.focus()
}

app.whenReady().then(() => {
  if (!primaryInstance) return
  try {
    const prefs = JSON.parse(readFileSync(join(app.getPath('userData'), 'rc-preferences.json'), 'utf8'))
    resetEnabled = prefs.resetRc === true
    apexEnabled = prefs.apexGuard === true
    resetMessage = resetEnabled ? 'RC reset armed for the next connection/reconnection.' : 'Automatic RC reset is off.'
  } catch { /* First run uses the off default. */ }
  // A small in-memory icon also works in portable builds without external assets.
  const pixels = Buffer.alloc(32 * 32 * 4)
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const i = (y * 32 + x) * 4
    const white = (x >= 9 && x <= 13 && y >= 7 && y <= 24) || (y >= 20 && y <= 24 && x >= 9 && x <= 24)
    pixels[i] = white ? 255 : 70; pixels[i + 1] = white ? 255 : 65; pixels[i + 2] = white ? 255 : 215; pixels[i + 3] = 255
  }
  tray = new Tray(nativeImage.createFromBitmap(pixels, { width: 32, height: 32, scaleFactor: 1 }))
  tray.setToolTip('Stick Labs (Unlimited)')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Stick Labs (Unlimited)', click: showWindow },
    { type: 'separator' },
    { label: 'Quit Stick Labs (Unlimited)', click: () => app.quit() }
  ]))
  tray.on('double-click', showWindow)
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(false)
  })
  createWindow()
  apexGuard.setEnabled(apexEnabled)
  const apexMonitor = setInterval(() => { if(!quitting) void apexGuard.tick() }, 1000)
  const receiverMonitor = setInterval(() => {
    if (!resetEnabled || !receiverResetPending || calibrationSession || resetting || ioJobs || reconnecting || recording || !controller.isOpen || !controller.latestInput?.live) return
    receiverResetPending = false
    void resetRcAfterConnect().then(() => { if (!quitting && controller.isOpen && connectedInfo) send('device:reconnected', connectedInfo) })
  }, 500)
  app.once('will-quit', () => { clearInterval(receiverMonitor); clearInterval(apexMonitor); apexGuard.setEnabled(false); bench.stop() })

  // Self-update from GitHub Releases (packaged builds only — never in dev).
  if (app.isPackaged) {
    try {
      const { autoUpdater } = require('electron-updater') as typeof import('electron-updater')
      autoUpdater.autoDownload = true
      autoUpdater.on('error', (err) => console.error(`[updater] ${err.message}`))
      autoUpdater.on('update-downloaded', () => {
        if (!window_ || window_.isDestroyed()) return
        void dialog
          .showMessageBox(window_, {
            type: 'info',
            buttons: ['Restart now', 'Later'],
            defaultId: 0,
            message: 'Stick Labs (Unlimited) update downloaded — restart to install it?'
          })
          .then(({ response }) => {
            if (response === 0) { quitAction = () => autoUpdater.quitAndInstall(); void requestQuit() }
          })
      })
      void autoUpdater.checkForUpdatesAndNotify().catch((err) => console.error(`[updater] check failed: ${String(err)}`))
    } catch (err) {
      console.error(`[updater] disabled: ${(err as Error).message}`)
    }
  }
  app.on('activate', () => {
    showWindow()
  })
})
app.on('window-all-closed', () => {
  controller.disconnect()
  if (process.platform !== 'darwin') app.quit()
})
app.on('before-quit', (event) => {
  if (!quitting) { event.preventDefault(); void requestQuit(); return }
  sessionEpoch++; controller.disconnect(); tray?.destroy(); tray = null
})
