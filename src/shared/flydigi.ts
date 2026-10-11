/**
 * Flydigi Apex 5 protocol (deviceCode k5, VID 0x37D7 PID 0x2501).
 *
 * Captured byte-exact from live hardware + Space Station service logs
 * (2026-10-11): USB interrupt transport on the 0xFFA0 collection
 * (report 3 out / 4 back, 32 B), frame [rid, 5A, A5, cmd, ...].
 * Replies echo [04, 5A, A5, cmd, ...].
 *
 * Write flow (mirrored 1:1): A4 announce → A5 26 B packs → A6 save.
 * Pack checksums are additive mod 256 (proven on two live curve edits).
 * No writes run without read-back verification — see renderer/flydigiUsb.
 */

export const FLY_VID = 0x37d7
export const FLY_PID_APEX5 = 0x2501
export const FLY_USAGE_CMD = 0xffa0
export const FLY_USAGE_AUX = 0xffef
export const FLY_USAGE = 0x01

export const FLY_REPORT_OUT = 3
export const FLY_REPORT_IN = 4
export const FLY_REPORT_LEN = 32

export const FLY_FRAME_0 = 0x5a
export const FLY_FRAME_1 = 0xa5

/** Command set (NewXInputProtocol class names in Space Station). */
export enum FlyCmd {
  Heartbeat = 0x01,
  Nickname = 0x02,
  HwFunction = 0x03,
  Uid = 0x04,
  RawStatus = 0x10,
  Unknown11 = 0x11,
  Unknown51 = 0x51,
  Version = 0xa1,
  ApplyByCfgId = 0xa2,
  ReadSection = 0xa3,
  WriteStart = 0xa4,
  WritePack = 0xa5,
  Save = 0xa6,
  RgbRead = 0xa7,
  RgbStart = 0xa8,
  RgbPack = 0xa9,
}

/** Mapping sections (A4 announce [06][00][section][01][14][len]). */
export const FLY_SEC_LEFT = 0x27
export const FLY_SEC_LEFT_LEN = 0xe6
export const FLY_SEC_RIGHT = 0x05
export const FLY_SEC_RIGHT_LEN = 0xc4
export const FLY_SEC_RGB = 0x00
export const FLY_SEC_RGB_LEN = 0xc3

/** Curve pack prefix inside A5 (26 B window). */
export const FLY_PACK_PREFIX: ReadonlyArray<number> = [0x17, 0x00]

/** Sensitivity type byte in curve packs (observed). */
export const FLY_TYPE_CUSTOM = 0x03
export const FLY_TYPE_QUICK = 0x01
export const FLY_TYPE_SLOW = 0x02

/** Curve point count per stick. */
export const FLY_CURVE_POINTS = 9
/** Deadzone center scale: value == percent (12 → 12%), End fixed 127. */
export const FLY_CENTER_END = 127

/** Reply status: byte after cmd is 0x01 on every accepted round-trip. */
export const FLY_STATUS_OK = 0x01

/** A6 save args: [0x04, nonce×3] — pad echoes nonce[1..2] as proof. */
export function flySaveArgs(nonce: ArrayLike<number>): number[] {
  const n = Array.from(nonce).slice(0, 3)
  while (n.length < 3) n.push(0)
  return [0x04, ...n.map((b) => b & 0xff)]
}

/** Fresh random save nonce (3 bytes). */
export function flyNonce(): number[] {
  return [Math.floor(Math.random() * 256), Math.floor(Math.random() * 256), Math.floor(Math.random() * 256)]
}

/** True when a reply frame acks the command (status OK). */
export function flyReplyOk(reply: Uint8Array, cmd: number): boolean {
  return reply.length >= 5 && reply[1] === FLY_FRAME_0 && reply[2] === FLY_FRAME_1 && reply[3] === (cmd & 0xff) && reply[4] === FLY_STATUS_OK
}

/** Version-stamp bytes of a full 0xA1 reply frame: echo of the save nonce. */
export function flyVersionStamp(reply: Uint8Array): { b0: number; b1: number } {
  return { b0: reply[7] ?? 0, b1: reply[8] ?? 0 }
}

/** Sensitivity type names for the UI. */
export function flyTypeName(type: number): string {
  if (type === FLY_TYPE_QUICK) return 'Quick'
  if (type === FLY_TYPE_SLOW) return 'Slow'
  if (type === FLY_TYPE_CUSTOM) return 'Custom'
  return `Custom (${type})`
}

export interface FlyCurve {
  /** sensitivity type byte (custom/quick/slow). */
  type: number
  /** 9 curve points, 0..150. */
  points: number[]
  /** deadzone center == percent. */
  center: number
}

/** Additive checksum mod 256 (proven on live edits). */
export function flyChecksum(data: ArrayLike<number>): number {
  let sum = 0
  for (let i = 0; i < data.length; i++) sum = (sum + (data[i] & 0xff)) & 0xff
  return sum
}

/**
 * Curve-pack checksum: (0xB2 + type + Σpoints) & 0xFF.
 * The 0xB2 constant folds in every covered constant byte — verified
 * identical across 9 captured packs, so fresh packs are exact.
 */
export function flyCurveChecksum(type: number, points: ArrayLike<number>): number {
  let sum = 0xb2 + (type & 0xff)
  for (let i = 0; i < points.length; i++) sum = (sum + (points[i] & 0xff)) & 0xff
  return sum
}

/** Build the 26 B left-curve window: [10×FF][type][9 pts][cksum][5×00]. */
export function flyCurveWindow(type: number, points: ArrayLike<number>): number[] {
  const pts = Array.from(points).slice(0, FLY_CURVE_POINTS)
  while (pts.length < FLY_CURVE_POINTS) pts.push(150)
  const clean = pts.map((p) => Math.max(0, Math.min(250, Math.round(p))))
  return [...new Array<number>(10).fill(0xff), type & 0xff, ...clean, flyCurveChecksum(type, clean), 0, 0, 0, 0, 0]
}

/** Build a 32 B output report: [rid=3, 5A, A5, cmd, ...args]. */
export function flyFrame(cmd: number, args: ArrayLike<number> = []): number[] {
  const out = new Array<number>(FLY_REPORT_LEN).fill(0)
  out[0] = FLY_REPORT_OUT
  out[1] = FLY_FRAME_0
  out[2] = FLY_FRAME_1
  out[3] = cmd & 0xff
  const body = Array.from(args).slice(0, FLY_REPORT_LEN - 4)
  for (let i = 0; i < body.length; i++) out[4 + i] = body[i] & 0xff
  return out
}

/** A4 announce body for a section. */
export function flyAnnounce(section: number, length: number): number[] {
  return [0x06, 0x00, section & 0xff, 0x01, 0x14, length & 0xff]
}

/** A3 read-announce body (mirrors A4 shape, chunk length 0x2A). */
export function flyReadAnnounce(section: number): number[] {
  return [0x06, 0x00, section & 0xff, 0x01, 0x14, 0x2a]
}

/**
 * Parse a curve pack window (26 B at the A5 offset): [10 pad][type]
 * [9 points][checksum][5 zero]. Returns null when the shape mismatches.
 */
export function parseFlyCurvePack(window: Uint8Array): (FlyCurve & { checksum: number }) | null {
  if (window.length < 21) return null
  const type = window[10] ?? 0
  const points = Array.from(window.subarray(11, 20))
  if (points.length !== FLY_CURVE_POINTS || points.some((p) => p > 250)) return null
  return { type, points, center: -1, checksum: window[20] ?? 0 }
}

/** Pack layout check: 10 leading pad bytes before the type byte. */
export function flyPackPadOk(window: Uint8Array): boolean {
  if (window.length < 11) return false
  for (let i = 0; i < 10; i++) if ((window[i] ?? -1) !== 0xff) return false
  return true
}

/** UID reply body (after [04, 5A, A5, 04, ...]): [01, 00, ...13 uid bytes]. */
export function flyUidHex(body: Uint8Array): string {
  return Array.from(body.subarray(2, 15), (b) => b.toString(16).padStart(2, '0')).join('')
}
