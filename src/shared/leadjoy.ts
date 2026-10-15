/**
 * LeadJoy Saber Plus protocol (VID 0x4131 PID 0x3519, config on MI_04
 * usage page 0xFF80/0001, bulk/interrupt 64B reports, 512B config images).
 *
 * Status: READ MODEL decoded from the vendor log (JSON semantics) plus
 * USBPcap wire captures. The pad answers only the vendor session, so
 * nothing here has run against hardware from our handle yet — every
 * vector below is byte-exact from captures. No writes ship until the
 * speaking path opens and the pad confirms with readback.
 *
 * Wire facts (proven):
 * - OUT reports are 64B; queries observed: 05 (version/poll), 06 (section
 *   read, Main=4D/Sub=4E), 08, 09, 0D (length probes 17/18/21).
 * - IN 0x25 frames are 512B config images; byte 2 cycles Main/Sub slots.
 * - Curve values are big-endian u16 + 0xCD separators; 32768 clamps to
 *   0x7FFF; head-out (always 0) is omitted: 15 values
 *   [in0..in7-minus-head-out, out7] per EightPoint curve.
 * - Record framing: a4/a5 class, length, 0xCC marker, TLV path
 *   (e.g. curve record 07: a3 61 73 66 00 / a2 63 74 00 / a2 63 76 dc 00).
 * - Trailing checksum byte with a consistent additive constant across
 *   two curve states (exact range pending a third sample — open).
 */

export const LJ_VID = 0x4131
export const LJ_PID_SABER_PLUS = 0x3519
export const LJ_USAGE_PAGE = 0xff80
export const LJ_USAGE = 0x01
export const LJ_REPORT_LEN = 64
export const LJ_IMAGE_LEN = 512
export const LJ_CURVE_POINTS = 8
export const LJ_CURVE_MAX = 32768
export const LJ_WIRE_MAX = 0x7fff
export const LJ_VALUE_SEP = 0xcd

/** The 8 query frames the vendor app sends while polling (byte-exact). */
export const LJ_QUERIES: ReadonlyArray<{ name: string; bytes: number[] }> = [
  { name: 'version', bytes: [0x00, 0x01, 0x05, 0x01, 0x01] },
  {
    name: 'sections-main',
    bytes: [0x00, 0x01, 0x06, 0x01, 0x13, 0x00, 0x00, 0x00, 0x07, 0x00,
      0x04, 0x01, 0x00, 0x4d, 0x00, 0x02, 0x00, 0x4d,
      0x00, 0x03, 0x00, 0x4d, 0x00, 0x0d, 0x00, 0x4d]
  },
  {
    name: 'sections-sub',
    bytes: [0x00, 0x01, 0x06, 0x01, 0x13, 0x00, 0x00, 0x00, 0x07, 0x00,
      0x04, 0x01, 0x00, 0x4e, 0x00, 0x02, 0x00, 0x4e,
      0x00, 0x03, 0x00, 0x4e, 0x00, 0x0d, 0x00, 0x4e]
  },
  { name: 'q08', bytes: [0x00, 0x01, 0x08, 0x01] },
  { name: 'q09', bytes: [0x00, 0x01, 0x09, 0x01] },
  { name: 'len-17', bytes: [0x00, 0x01, 0x0d, 0x01, 0x17] },
  { name: 'len-18', bytes: [0x00, 0x01, 0x0d, 0x01, 0x18] },
  { name: 'len-21', bytes: [0x00, 0x01, 0x0d, 0x01, 0x21] }
]

/** Clamp a JSON curve value to wire range (32768 → 0x7FFF). */
export function ljWireValue(v: number): number {
  if (v >= LJ_CURVE_MAX) return LJ_WIRE_MAX
  return Math.max(0, Math.min(LJ_WIRE_MAX, Math.round(v)))
}

/** Encode one curve value as big-endian + separator. */
export function ljEncodeValue(v: number): number[] {
  const w = ljWireValue(v)
  return [(w >> 8) & 0xff, w & 0xff, LJ_VALUE_SEP]
}

/** Decode one big-endian value at an offset (caller strips separators). */
export function ljDecodeValue(bytes: ArrayLike<number>, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0)
}

/**
 * Flatten an EightPoint JSON curve to the 15 wire values: head-out
 * (always 0) is omitted by the firmware, everything else in
 * [in,out] order. 32768 clamps to 0x7FFF on the wire.
 */
export function ljWireCurve(points: ReadonlyArray<readonly [number, number]>): number[] {
  if (points.length !== LJ_CURVE_POINTS) throw new Error(`EightPoint needs 8 points, got ${points.length}`)
  const flat: number[] = [ljWireValue(points[0][0])]
  for (let i = 1; i < points.length; i++) {
    flat.push(ljWireValue(points[i][0]), ljWireValue(points[i][1]))
  }
  return flat
}
