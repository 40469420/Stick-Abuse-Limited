export interface Candidate {
  path: string
  productId: number
  preferred: boolean
  product: string | undefined
  manufacturer: string | undefined
  live: boolean | null
}
// Marius types live in the shared protocol module (type-only — no runtime pull).
import type { MariusConfig, MariusIdentity } from '@shared/marius'
export interface DeviceInfo {
  firmware: string
  dongle: string
  currentProfile: number
}
export interface DeviceStats {
  inputFrames: number
  responses: number
  rateHz: number
  live: boolean
}
export interface PingResult {
  count: number
  samples: number[]
  min: number
  max: number
  median: number
  mean: number
}
export interface LiveSample {
  centerRaw?: { lx: number; ly: number; rx: number; ry: number }
  lx: number
  ly: number
  rx: number
  ry: number
  lt: number
  rt: number
  calTarget: number
  calMask: number
  battery: number
  live: boolean
  timestamp: number
}

interface LabApi {
  leadjoyJob(req: import('../shared/leadjoy-api').LjRequest): Promise<import('../shared/leadjoy-api').LjResult>
  benchStart(id: string): Promise<boolean>
  benchRenew(id: string): Promise<boolean>
  benchStop(id: string): Promise<boolean>
  benchCancel(id: string): Promise<boolean>
  benchCapture(id: string, mode: import('../shared/bench').BenchMode, seconds: number): Promise<import('../shared/bench').BenchCapture>
  benchXInput(id: string, slot: number, seconds: number): Promise<import('../shared/bench').XInputBench>
  benchKernel(id: string, path?: string): Promise<import('../shared/deeppoll').DeepPollResult>
  benchPing(id: string): Promise<import('../shared/bench').Distribution>
  firmwareStatus(): Promise<import('../shared/firmware').FirmwareStatus>
  chooseFirmware(version?: string): Promise<import('../shared/firmware').FirmwareImage | null>
  flashFirmware(confirmation: string): Promise<import('../shared/firmware').FirmwareStatus>
  openFirmwareBackup(): Promise<boolean>
  quitRcDecision(id: string, reset: boolean): Promise<boolean>
  startMacroRecording(id: string): Promise<boolean>
  stopMacroRecording(id: string): Promise<import('../shared/macros').MacroStep[]>
  cancelMacroRecording(id: string): Promise<boolean>
  gameGuardStatus(): Promise<import('../shared/game-guards').GameGuardStatuses>
  setGameGuard(game: import('../shared/game-guards').GuardedGame, enabled: boolean): Promise<import('../shared/game-guards').GameGuardStatuses>
  dismissGameGuard(game: import('../shared/game-guards').GuardedGame): Promise<import('../shared/game-guards').GameGuardStatuses>
  apexGuardStatus(): Promise<import('../main/apex-guard').ApexGuardStatus>
  setApexGuard(enabled: boolean): Promise<import('../main/apex-guard').ApexGuardStatus>
  dismissApexGuard(): Promise<boolean>
  rcResetStatus(): Promise<import('../main/rc-reset').RcResetStatus>
  setRcReset(enabled: boolean): Promise<import('../main/rc-reset').RcResetStatus>
  adjustCenter(side: number, direction: import('../shared/center').CenterDirection): Promise<boolean>
  listXInput(): Promise<import('../main/xinput').XInputSlot[]>
  captureRc(id: string, xinputSlot?: number): Promise<import('../main/rc-capture').RcCaptureResult & { xinput?: import('../main/xinput').XInputCaptureResult }>
  cancelRc(id: string): Promise<boolean>
  discover(): Promise<Candidate[]>
  connect(path: string): Promise<DeviceInfo>
  disconnect(): Promise<boolean>
  readProfile(profile: number, total?: number): Promise<{ bytes: string; length: number }>
  writeProfile(profile: number, dataB64: string, length?: number): Promise<{ verified: boolean; rolledBack: boolean }>
  switchProfile(profile: number): Promise<boolean>
  currentProfile(): Promise<number>
  calibration(state: number, partMask?: number): Promise<boolean>
  ping(count: number): Promise<PingResult>
  openExternal(url: string): Promise<boolean>
  version(): Promise<string>
  steamInfo(): Promise<{ steamPath: string | null; userId: string | null; apexInstalled: boolean; apexAppId: number; steamRunning: boolean }>
  steamExport(
    left: { begin: number; end: number },
    right: { begin: number; end: number },
    mouseRate?: number | null,
    curveExp?: number | null
  ): Promise<{ game: string; appId: number; files: string[]; backedUp: string[]; mapped: string[]; notTransferred: string[] }>
  steamGames(): Promise<Array<{ appId: number; name: string }>>
  steamExportAll(
    left: { begin: number; end: number },
    right: { begin: number; end: number },
    mouseRate?: number | null,
    curveExp?: number | null
  ): Promise<{ games: Array<{ appId: number; name: string }>; result: { games: Array<{ appId: number; name: string; ok: boolean; detail: string }> } }>
  /** MARIUS board — read-only preview scaffold. No write path exists. */
  mariusDiscover(): Promise<Array<{ path: string; productId: number; product: string | undefined; manufacturer: string | undefined }>>
  mariusConnect(path: string): Promise<{ identity: MariusIdentity; bInterval: number; pollHz: number }>
  mariusReadConfig(): Promise<{ bytes: string; parsed: MariusConfig }>
  mariusReadRaw(): Promise<{ left: { x: number; y: number }; right: { x: number; y: number } }>
  mariusDisconnect(): Promise<boolean>
  /** Flydigi Apex 5 over the hidapi bridge (interrupt-OUT reports). */
  flyOpen(): Promise<boolean>
  flySend(cmd: number, args: number[]): Promise<number[]>
  flyCollect(cmd: number, args: number[], count: number): Promise<number[][]>
  flyClose(): Promise<boolean>
  on(channel: string, fn: (payload: never) => void): () => void
}

declare global {
  interface Window {
    sticklab: LabApi
  }
}

export function api(): LabApi {
  if (!window.sticklab) throw new Error('sticklab bridge unavailable')
  return window.sticklab
}

export function b64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}
export function bytesToB64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}
