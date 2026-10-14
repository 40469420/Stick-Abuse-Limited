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
  MapSelect = 0x11,
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
  PrecisionWrite = 0x15,
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

/**
 * LED brightness pack checksum: (0xDA + brightness) & 0xFF.
 * Verified across 9 captured brightness writes (mode Default, period 4).
 * Brightness-only writes send Default/period-4-shaped constants, so writing
 * brightness while another mode is active resets the mode to Default.
 */
export function flyLedChecksum(brightness: number): number {
  return (0xda + (Math.max(0, Math.min(100, Math.round(brightness))) & 0xff)) & 0xff
}

/** Build the 26 B LED window: [00,03,00,00,09,04][bright][0C,07,01][FF×10][cksum][00×5]. */
export function flyLedWindow(brightness: number): number[] {
  const b = Math.max(0, Math.min(100, Math.round(brightness)))
  return [0, 3, 0, 0, 9, 4, b, 0x0c, 0x07, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, flyLedChecksum(b), 0, 0, 0, 0, 0]
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

/**
 * Right-curve checksum: (0xB6 + type + Σpoints) & 0xFF.
 * Same additive rule, different covered constants — verified across
 * 4 captured right packs (0xB6 every time).
 */
export function flyRightChecksum(type: number, points: ArrayLike<number>): number {
  let sum = 0xb6 + (type & 0xff)
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

/**
 * Build the 26 B right-curve window:
 * [00,00][type][9 pts][00,00][FF×6][cksum][00×5].
 */
export function flyRightWindow(type: number, points: ArrayLike<number>): number[] {
  const pts = Array.from(points).slice(0, FLY_CURVE_POINTS)
  while (pts.length < FLY_CURVE_POINTS) pts.push(150)
  const clean = pts.map((p) => Math.max(0, Math.min(250, Math.round(p))))
  return [0, 0, type & 0xff, ...clean, 0, 0, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, flyRightChecksum(type, clean), 0, 0, 0, 0, 0]
}

/** Store-read announce: section byte 0x14 streams the full 1092 B store. */
export const FLY_STORE_SECTION = 0x14
export const FLY_STORE_CHUNKS = 42
export const FLY_STORE_LEN = 1092

/** True store offsets (E-stripped) of the curve blocks. */
export const FLY_STORE_LEFT_TYPE = 985
export const FLY_STORE_LEFT_PTS = 986
export const FLY_STORE_RIGHT_TYPE = 1002
export const FLY_STORE_RIGHT_PTS = 1003

export interface FlyStore {
  leftType: number
  leftPoints: number[]
  rightType: number
  rightPoints: number[]
  /** M1 bind target (k5 button ID) at store offset 82. */
  mapM1: number
  /** M2 bind target (k5 button ID) at store offset 85. */
  mapM2: number
  /** M3 bind target (k5 button ID) at store offset 88. */
  mapM3: number
  /** M4 bind target (k5 button ID) at store offset 91. */
  mapM4: number
  /** LM bind target (k5 button ID) at store offset 94. */
  mapLM: number
  /** RM bind target (k5 button ID) at store offset 102. */
  mapRM: number
  /** LT bind target (k5 button ID) at store offset 59. */
  mapLT: number
  /** RT bind target (k5 button ID) at store offset 62. */
  mapRT: number
}

/**
 * Parse the 1092 B store (E-stripped). Validates the FF run + point
 * sanity; returns null when the layout is unrecognized.
 */
export function parseFlyStore(store: Uint8Array): FlyStore | null {
  const need = FLY_STORE_RIGHT_PTS + FLY_CURVE_POINTS
  if (store.length < need) return null
  for (let i = FLY_STORE_LEFT_TYPE - 10; i < FLY_STORE_LEFT_TYPE; i++) {
    if ((store[i] ?? -1) !== 0xff) return null
  }
  const leftPoints = Array.from(store.subarray(FLY_STORE_LEFT_PTS, FLY_STORE_LEFT_PTS + FLY_CURVE_POINTS))
  const rightPoints = Array.from(store.subarray(FLY_STORE_RIGHT_PTS, FLY_STORE_RIGHT_PTS + FLY_CURVE_POINTS))
  if ([...leftPoints, ...rightPoints].some((p) => p > 250)) return null
  return {
    leftType: store[FLY_STORE_LEFT_TYPE] ?? 0,
    leftPoints,
    rightType: store[FLY_STORE_RIGHT_TYPE] ?? 0,
    rightPoints,
    mapM1: store[FLY_STORE_MAP_M1] ?? -1,
    mapM2: store[FLY_STORE_MAP_M2] ?? -1,
    mapM3: store[FLY_STORE_MAP_M3] ?? -1,
    mapM4: store[FLY_STORE_MAP_M4] ?? -1,
    mapLM: store[FLY_STORE_MAP_LM] ?? -1,
    mapRM: store[FLY_STORE_MAP_RM] ?? -1,
    mapLT: store[FLY_STORE_TRIG_LT] ?? -1,
    mapRT: store[FLY_STORE_TRIG_RT] ?? -1,
  }
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

/**
 * Precision (bit depth) write path — decoded from live USB captures
 * (2026-10-14): Space Station 12→11→12 and 10-bit flips, byte-exact.
 *
 * Write: command 0x15, args [0x03, value, (value + 0x18) & 0xFF].
 * The third byte fits value+0x18 on all three captures (05→1d, 03→1b,
 * 02→1a); the 9/8-bit third bytes are extrapolated by the same rule and
 * verified at write time by ack + readback, never trusted blindly.
 * Reply ack: [0x01, 0x00, value].
 *
 * Read: command 0x03 args [0x02, 0x05]; precision enum at reply index 12
 * (0x03 at 12-bit, 0x02 at 10-bit, live-verified).
 */

/** Precision subcommand byte. */
export const FLY_PRECISION_SUB = 0x03

/** Space Station picker domain: bits → firmware enum value. */
export const FLY_PRECISION_BITS: ReadonlyArray<{ bits: number; value: number }> = [
  { bits: 12, value: 3 },
  { bits: 11, value: 5 },
  { bits: 10, value: 2 },
  { bits: 9, value: 4 },
  { bits: 8, value: 1 }
]

/** Precision write args for a firmware enum value. */
export function flyPrecisionArgs(value: number): number[] {
  const v = value & 0xff
  return [FLY_PRECISION_SUB, v, (v + 0x18) & 0xff]
}

/** True when the 0x15 reply acks the value: [0x01, 0x00, value]. */
export function flyPrecisionAck(reply: Uint8Array, value: number): boolean {
  return reply.length >= 7 && reply[4] === 0x01 && reply[5] === 0x00 && reply[6] === (value & 0xff)
}

/** Precision enum from a 0x03 HwFunction reply (index 12); -1 when unreadable. */
export function flyPrecisionValue(reply: Uint8Array): number {
  if (reply.length < 13) return -1
  return reply[12] ?? -1
}

/**
 * Bind remap write path — decoded from live USB captures (2026-10-14,
 * Space Station saves, byte-exact) and proven with our own bytes on
 * hardware: M1 B→X→B round trip, pad-confirmed both legs, curves intact.
 * M1-M4 + LM share record 00 (triplet slots 2-6); RM lives in a second
 * table, section 0x04 (slot 0) — same 0xBD checksum idiom throughout.
 *
 * Save chain: 0x11 select [07 FF 00 FF FF FF 14] (ack [01,00,01,00]),
 * A4 announce section 0x03 len 0xC2, one A5 patch (27 B window below),
 * A6 save with fresh nonce. The pad fans the patch out to the mirror
 * sections 07–0B (M1 at 229/203/179/157/151) and store@82 — every write
 * is verified against store@82, never trusted blindly.
 *
 * Window layout: seven assignable (00, value, 00) triplets, M1 in
 * slot 2, M2 in slot 3; an eighth constant-headed (00, FF) triplet
 * carries the checksum in its value seat, then three zeros.
 * Other buttons' slots are NOT mapped yet — one flip per button
 * through the same diff pipeline.
 * Values are k5 button IDs (A=4, B=5, X=7 …).
 * Checksum: (0xBD + Σwindow[0:23]) & 0xFF (additive vendor idiom;
 * X→BD captured, B→BB predicted and pad-accepted).
 */

/** Mapping master section + write length from the captured A4. */
export const FLY_SEC_MAP = 0x03
export const FLY_MAP_LEN = 0xc2

/**
 * Record select: the 0x11 args pick a UI record ([07 FF rr FF FF FF
 * 14+rr]); the A4 section byte picks the write table. M-group + RM
 * saves select record 0, trigger saves select record 1 (captured).
 */
export const FLY_MAP_RECORD_BUTTONS = 0
export const FLY_MAP_RECORD_TRIGGERS = 1

/** 0x11 mapping-select args for a record (captured). */
export function flyMapSelectArgs(record: number = FLY_MAP_RECORD_BUTTONS): number[] {
  const r = record & 0xff
  return [0x07, 0xff, r, 0xff, 0xff, 0xff, (0x14 + r) & 0xff]
}

/** True when the 0x11 reply selects the record: [01,00,01,record]. */
export function flyMapSelectAck(reply: Uint8Array, record: number = FLY_MAP_RECORD_BUTTONS): boolean {
  return reply.length >= 8 && reply[4] === 0x01 && reply[5] === 0x00 && reply[6] === 0x01 && reply[7] === (record & 0xff)
}

/**
 * Trigger table (section 0x02, len 0xC1): same triplet window as
 * record 00 — LT proven in slot 3, RT in slot 4 (LT→B + RT→A saves,
 * byte-exact pcaps, checksums C3/C0 re-confirming the 0xBD rule).
 */
export const FLY_SEC_TRIG = 0x02
export const FLY_TRIG_LEN = 0xc1
export const FLY_TRIG_SLOT_LT = 3
export const FLY_TRIG_SLOT_RT = 4

/** Triplet slots inside the 27 B mapping window (record 00). */
export const FLY_MAP_SLOT_M1 = 2
export const FLY_MAP_SLOT_M2 = 3
export const FLY_MAP_SLOT_M3 = 4
export const FLY_MAP_SLOT_M4 = 5
export const FLY_MAP_SLOT_LM = 6
/** Checksum constant folding the window's covered bytes. */
export const FLY_MAP_CK = 0xbd

/** Mapping checksum over the 23 data bytes before it. */
export function flyMapChecksum(data23: ArrayLike<number>): number {
  let sum = FLY_MAP_CK
  for (let i = 0; i < 23; i++) sum = (sum + (data23[i] & 0xff)) & 0xff
  return sum
}

/** Build the 27 B mapping window: value into a triplet slot, rest default. */
export function flyMapWindow(value: number, slot: number = FLY_MAP_SLOT_M1): number[] {
  return flyMapTable({ [slot]: value & 0xff })
}

/**
 * Build the 27 B mapping window from explicit slot assignments
 * (slot → k5 button ID); every other triplet stays FF (default).
 * Multi-button writes must carry the live values of all managed slots —
 * anything omitted resets to default, so callers read them first.
 */
export function flyMapTable(assign: Readonly<Record<number, number>>): number[] {
  const w: number[] = []
  for (let i = 0; i < 7; i++) {
    const v = assign[i]
    if (v !== undefined && (v < 0 || v > 255)) throw new Error(`map value ${v} out of range`)
    w.push(0x00, v === undefined ? 0xff : v & 0xff, 0x00)
  }
  // Eighth triplet is constant-headed (00, FF) with the checksum in its
  // value seat (captured X/B/M1+M2 windows agree).
  w.push(0x00, 0xff)
  const slots = Object.keys(assign).map(Number)
  if (slots.some((s) => !Number.isInteger(s) || s < 0 || s > 6)) throw new Error('map slot out of range')
  return [...w, flyMapChecksum(w), 0x00, 0x00, 0x00]
}

/** Store offset tracking the M1 bind (proven live: ?→A silent, A→B→X→B tracked). */
export const FLY_STORE_MAP_M1 = 82
/** Store offset tracking the M2 bind (proven live: FF→Y→B tracked). */
export const FLY_STORE_MAP_M2 = 85
/** Store offset tracking the M3 bind (proven live: FF→Y→B tracked). */
export const FLY_STORE_MAP_M3 = 88
/** Store offset tracking the M4 bind (proven live: FF→Y→B tracked). */
export const FLY_STORE_MAP_M4 = 91
/** Store offset tracking the LM bind (proven live: FF→Y→B tracked). */
export const FLY_STORE_MAP_LM = 94
/** Store offset tracking the RM bind (proven live: FF→X→A tracked). */
export const FLY_STORE_MAP_RM = 102
/** Store offset tracking the LT bind (proven live: FF→Y→B tracked). */
export const FLY_STORE_TRIG_LT = 59
/** Store offset tracking the RT bind (proven live: FF→X→A tracked). */
export const FLY_STORE_TRIG_RT = 62

/**
 * Second mapping table (section 0x04, len 0xC3): seven (00, 00, value)
 * triplets, RM proven in slot 0 (Y→B…X→A sessions, byte-exact pcap).
 * Same 0xBD additive checksum over the 21 data bytes before it, then
 * four zeros. Same select/A4/A6 chain, A4 section byte 0x04.
 */
export const FLY_SEC_MAP2 = 0x04
export const FLY_MAP2_LEN = 0xc3
export const FLY_MAP2_SLOT_RM = 0

/** Mapping checksum for the section-04 layout (21 data bytes). */
export function flyMap2Checksum(data21: ArrayLike<number>): number {
  let sum = FLY_MAP_CK
  for (let i = 0; i < 21; i++) sum = (sum + (data21[i] & 0xff)) & 0xff
  return sum
}

/** Build the 26 B section-04 window from explicit slot assignments. */
export function flyMap2Table(assign: Readonly<Record<number, number>>): number[] {
  const w: number[] = []
  for (let i = 0; i < 7; i++) {
    const v = assign[i]
    if (v !== undefined && (v < 0 || v > 255)) throw new Error(`map value ${v} out of range`)
    w.push(0x00, 0x00, v === undefined ? 0xff : v & 0xff)
  }
  const slots = Object.keys(assign).map(Number)
  if (slots.some((s) => !Number.isInteger(s) || s < 0 || s > 6)) throw new Error('map slot out of range')
  return [...w, flyMap2Checksum(w), 0x00, 0x00, 0x00, 0x00]
}

/** k5 button IDs for 1:1 remap targets (device_config_k5; Turbo excluded — never). */
export const FLY_MAP_TARGETS: ReadonlyArray<{ label: string; value: number }> = [
  { label: 'A', value: 4 },
  { label: 'B', value: 5 },
  { label: 'X', value: 7 },
  { label: 'Y', value: 8 },
  { label: 'Up', value: 0 },
  { label: 'Right', value: 1 },
  { label: 'Down', value: 2 },
  { label: 'Left', value: 3 },
  { label: 'LB', value: 10 },
  { label: 'RB', value: 11 },
  { label: 'LT', value: 12 },
  { label: 'RT', value: 13 },
  { label: 'Select', value: 6 },
  { label: 'Start', value: 9 }
]
