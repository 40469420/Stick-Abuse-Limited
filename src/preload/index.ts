import { contextBridge, ipcRenderer } from 'electron'
import type { MariusConfig, MariusIdentity } from '../shared/marius'

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const result = (await ipcRenderer.invoke(channel, ...args)) as {
    ok: boolean
    data?: T
    error?: string
  }
  if (!result?.ok) throw new Error(result?.error ?? `${channel} failed`)
  return result.data as T
}

const api = {
  leadjoyJob: (req: import('../shared/leadjoy-api').LjRequest) => call<import('../shared/leadjoy-api').LjResult>('leadjoy:job',req),
  benchStart: (id: string) => call<boolean>('lab:start', id),
  benchRenew: (id: string) => call<boolean>('lab:renew', id),
  benchStop: (id: string) => call<boolean>('lab:stop', id),
  benchCancel: (id: string) => call<boolean>('lab:cancel', id),
  benchCapture: (id: string, mode: import('../shared/bench').BenchMode, seconds: number) => call<import('../shared/bench').BenchCapture>('lab:vendor', id, mode, seconds),
  benchXInput: (id: string, slot: number, seconds: number) => call<import('../shared/bench').XInputBench>('lab:xinput', id, slot, seconds),
  benchKernel: (id: string, path?: string) => call<import('../shared/deeppoll').DeepPollResult>('lab:kernel', id, path),
  benchPing: (id: string) => call<import('../shared/bench').Distribution>('lab:ping', id),
  firmwareStatus: () => call<import('../shared/firmware').FirmwareStatus>('firmware:status'),
  chooseFirmware: (version?: string) => call<import('../shared/firmware').FirmwareImage | null>('firmware:choose', version),
  flashFirmware: (confirmation: string) => call<import('../shared/firmware').FirmwareStatus>('firmware:flash', confirmation),
  openFirmwareBackup: () => call<boolean>('firmware:openBackup'),
  quitRcDecision: (id: string, reset: boolean) => call<boolean>('rc:quitDecision', id, reset),
  startMacroRecording: (id: string) => call<boolean>('macro:start', id),
  stopMacroRecording: (id: string) => call<import('../shared/macros').MacroStep[]>('macro:stop', id),
  cancelMacroRecording: (id: string) => call<boolean>('macro:cancel', id),
  gameGuardStatus: () => call<import('../shared/game-guards').GameGuardStatuses>('games:status'),
  setGameGuard: (game: import('../shared/game-guards').GuardedGame, enabled: boolean) => call<import('../shared/game-guards').GameGuardStatuses>('games:set', game, enabled),
  dismissGameGuard: (game: import('../shared/game-guards').GuardedGame) => call<import('../shared/game-guards').GameGuardStatuses>('games:dismiss', game),
  apexGuardStatus: () => call<import('../main/apex-guard').ApexGuardStatus>('apex:status'),
  setApexGuard: (enabled: boolean) => call<import('../main/apex-guard').ApexGuardStatus>('apex:set', enabled),
  dismissApexGuard: () => call<boolean>('apex:dismiss'),
  rcResetStatus: () => call<import('../main/rc-reset').RcResetStatus>('rc:resetStatus'),
  setRcReset: (enabled: boolean) => call<import('../main/rc-reset').RcResetStatus>('rc:setReset', enabled),
  listXInput: () => call<import('../main/xinput').XInputSlot[]>('diag:xinputSlots'),
  adjustCenter: (side: number, direction: import('../shared/center').CenterDirection) => call<boolean>('device:adjustCenter', side, direction),
  captureRc: (id: string, xinputSlot?: number) => call<import('../main/rc-capture').RcCaptureResult & { xinput?: import('../main/xinput').XInputCaptureResult }>('diag:rcCapture', id, xinputSlot),
  cancelRc: (id: string) => call<boolean>('diag:rcCancel', id),
  discover: () =>
    call<Array<{ path: string; productId: number; preferred: boolean; product: string | undefined; manufacturer: string | undefined; live: boolean | null }>>('device:discover'),
  connect: (path: string) =>
    call<{ firmware: string; dongle: string; currentProfile: number }>('device:connect', path),
  disconnect: () => call<boolean>('device:disconnect'),
  readProfile: (profile: number, total?: number) => call<{ bytes: string; length: number }>('profile:read', profile, total),
  writeProfile: (profile: number, dataB64: string, length?: number) =>
    call<{ verified: boolean; rolledBack: boolean }>('profile:write', profile, dataB64, length),
  switchProfile: (profile: number) => call<boolean>('profile:switch', profile),
  currentProfile: () => call<number>('profile:current'),
  calibration: (state: number, partMask = 15) => call<boolean>('device:calibration', state, partMask),
  openExternal: (url: string) => call<boolean>('system:openExternal', url),
  version: () => call<string>('system:version'),
  steamInfo: () =>
    call<{ steamPath: string | null; userId: string | null; apexInstalled: boolean; apexAppId: number; steamRunning: boolean }>('steam:info'),
  steamExport: (left: { begin: number; end: number }, right: { begin: number; end: number }, mouseRate?: number | null, curveExp?: number | null) =>
    call<{ game: string; appId: number; files: string[]; backedUp: string[]; mapped: string[]; notTransferred: string[] }>('steam:export', left, right, mouseRate, curveExp),
  steamGames: () => call<Array<{ appId: number; name: string }>>('steam:games'),
  steamExportAll: (left: { begin: number; end: number }, right: { begin: number; end: number }, mouseRate?: number | null, curveExp?: number | null) =>
    call<{ games: Array<{ appId: number; name: string }>; result: { games: Array<{ appId: number; name: string; ok: boolean; detail: string }> } }>('steam:exportAll', left, right, mouseRate, curveExp),
  ping: (count: number) =>
    call<{ count: number; samples: number[]; min: number; max: number; median: number; mean: number }>('diag:ping', count),
  mariusDiscover: () =>
    call<Array<{ path: string; productId: number; product: string | undefined; manufacturer: string | undefined }>>('marius:discover'),
  mariusConnect: (path: string) =>
    call<{ identity: MariusIdentity; bInterval: number; pollHz: number }>('marius:connect', path),
  mariusReadConfig: () =>
    call<{ bytes: string; parsed: MariusConfig }>('marius:read'),
  mariusReadRaw: () =>
    call<{ left: { x: number; y: number }; right: { x: number; y: number } }>('marius:raw'),
  mariusDisconnect: () => call<boolean>('marius:disconnect'),
  flyOpen: () => call<boolean>('fly:open'),
  flySend: (cmd: number, args: number[]) => call<number[]>('fly:send', cmd, args),
  flyCollect: (cmd: number, args: number[], count: number) => call<number[][]>('fly:collect', cmd, args, count),
  flyClose: () => call<boolean>('fly:close'),
  on: (channel: string, fn: (payload: any) => void): (() => void) => {
    const listener = (_e: unknown, payload: unknown): void => fn(payload)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
}

export type StickLabApi = typeof api
contextBridge.exposeInMainWorld('sticklab', api)
