/**
 * Flydigi Apex 5 protocol tests — vectors captured live (2026-10-11).
 *
 *   node scripts/test.mjs tests/flydigi.ts
 */
import {
  FLY_CURVE_POINTS,
  FLY_MAP_TARGETS,
  FLY_PRECISION_BITS,
  FLY_REPORT_LEN,
  FLY_SEC_LEFT,
  FLY_SEC_LEFT_LEN,
  FLY_SEC_RIGHT,
  FLY_SEC_RIGHT_LEN,
  flyAnnounce,
  flyChecksum,
  flyCurveChecksum,
  flyCurveWindow,
  flyFrame,
  flyLedChecksum,
  flyLedWindow,
  flyMapChecksum,
  flyMapSelectAck,
  flyMapSelectArgs,
  flyMapTable,
  flyMapWindow,
  flyPrecisionAck,
  flyPrecisionArgs,
  flyPrecisionValue,
  flyRightChecksum,
  flyRightWindow,
  parseFlyStore,
  flyNonce,
  flyPackPadOk,
  flyReadAnnounce,
  flyReplyOk,
  flySaveArgs,
  flyTypeName,
  flyUidHex,
  flyVersionStamp,
  parseFlyCurvePack,
} from '../src/shared/flydigi.ts'

let failures = 0
function check(name: string, cond: boolean): void {
  if (cond) console.log(`✓ ${name}`)
  else {
    console.error(`✗ ${name}`)
    failures++
  }
}

function hex(s: string): Uint8Array {
  const b = s.split('-').map((x) => parseInt(x, 16))
  return new Uint8Array(b)
}

// --- framing -----------------------------------------------------------------
const f = flyFrame(0xa5, [0x17, 0x00, 0x03])
check('frame 32B report 3', f.length === FLY_REPORT_LEN && f[0] === 3 && f[1] === 0x5a && f[2] === 0xa5 && f[3] === 0xa5)
check('announce left', JSON.stringify(flyAnnounce(FLY_SEC_LEFT, FLY_SEC_LEFT_LEN)) === JSON.stringify([6, 0, 0x27, 1, 0x14, 0xe6]))
check('announce right', JSON.stringify(flyAnnounce(FLY_SEC_RIGHT, FLY_SEC_RIGHT_LEN)) === JSON.stringify([6, 0, 0x05, 1, 0x14, 0xc4]))
check('read announce mirrors write', JSON.stringify(flyReadAnnounce(0x27)) === JSON.stringify([6, 0, 0x27, 1, 0x14, 0x2a]))

// --- UID (live reply, matches service-log uid) --------------------------------
const uidBody = hex('01-00-14-20-6e-7a-1c-00-00-00-00-9c-47-3d-00-00-00-00-00-00-00-00-00-00-00-00-00-00')
check('uid hex', flyUidHex(uidBody) === '14206e7a1c000000009c473d00')

// --- curve packs (live, correlated with UpdateConfig JSON) --------------------
function packWindow(typePts: string): Uint8Array {
  // 10xFF pad + type + 9 points + checksum + zeros, as seen on the wire
  const w = new Uint8Array(26).fill(0)
  w.fill(0xff, 0, 10)
  const parts = typePts.split('-').map((x) => parseInt(x, 16))
  w.set(parts, 10)
  return w
}
// deadzone 12→13 edit: points [35,49,64,78,93,107,122,136,150], cksum F7
const w1 = packWindow('03-23-31-40-4e-5d-6b-7a-88-96-f7')
const p1 = parseFlyCurvePack(w1)
check('pack pad ok', flyPackPadOk(w1))
check(
  'deadzone-edit points',
  !!p1 && p1.type === 3 && JSON.stringify(p1.points) === JSON.stringify([35, 49, 64, 78, 93, 107, 122, 136, 150])
)
// checksum delta: previous pack (points -1 on first four) had FC; delta -5
check('checksum delta -5', !!p1 && p1.checksum === ((0xfc - 5) & 0xff))
// quick preset: type 01, [50,69,88,107,126,132,138,144,150], 9F
const w2 = packWindow('01-32-45-58-6b-7e-84-8a-90-96-9f')
const p2 = parseFlyCurvePack(w2)
check('quick preset', !!p2 && p2.type === 1 && p2.points[0] === 50 && p2.points[8] === 150 && p2.checksum === 0x9f)
// slow preset: type 02, [50,56,63,69,75,94,113,131,150], D5
const w3 = packWindow('02-32-38-3f-45-4b-5e-71-83-96-d5')
const p3 = parseFlyCurvePack(w3)
check('slow preset', !!p3 && p3.type === 2 && p3.points[4] === 75 && p3.checksum === 0xd5)
// quick→slow delta +21 → 95+21=AA (second proven checksum step)
check('checksum delta +21', ((0x95 + 21) & 0xff) === 0xaa)
check('pack rejects short', parseFlyCurvePack(new Uint8Array(10)) === null)
check('pack rejects big values', (() => {
  const bad = packWindow('03-ff-ff-ff-ff-ff-ff-ff-ff-ff-00')
  return parseFlyCurvePack(bad) === null
})())
check('curve points count', FLY_CURVE_POINTS === 9)

// --- save flow (live no-op trial) -------------------------------------------
// A6 [04,AA,BB,CC] accepted; reply echoes [BB,CC]; version stamp took the nonce.
const a6reply = hex('04-5a-a5-a6-01-00-bb-cc-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00')
check('save reply ok', flyReplyOk(a6reply, 0xa6))
check('save args shape', JSON.stringify(flySaveArgs([0xaa, 0xbb, 0xcc])) === JSON.stringify([4, 0xaa, 0xbb, 0xcc]))
check('nonce is 3 bytes', flyNonce().length === 3)
const stamped = hex('04-5a-a5-a1-01-00-00-aa-bb-ff-ff-ff')
const stamp = flyVersionStamp(stamped)
check('version stamp oracle', stamp.b0 === 0xaa && stamp.b1 === 0xbb)
check('type names', flyTypeName(1) === 'Quick' && flyTypeName(2) === 'Slow' && flyTypeName(3) === 'Custom')

// --- checksum constant 0xB2 across 9 captured packs ---------------------------
const capPacks: Array<[number, number[], number]> = [
  [3, [50, 67, 84, 102, 117, 125, 134, 142, 150], 0x80],
  [3, [50, 84, 119, 130, 134, 138, 142, 146, 150], 0xfa],
  [3, [50, 57, 64, 71, 78, 84, 100, 125, 150], 0xc0],
  [3, [50, 83, 115, 127, 131, 136, 141, 145, 150], 0xeb],
  [1, [50, 69, 88, 107, 126, 132, 138, 144, 150], 0x9f],
  [2, [50, 56, 63, 69, 75, 94, 113, 131, 150], 0xd5],
  [3, [35, 49, 64, 78, 93, 107, 122, 136, 150], 0xf7],
  [3, [7, 48, 90, 131, 136, 140, 143, 147, 150], 0x95],
  [3, [0, 47, 122, 131, 135, 139, 143, 146, 150], 0xaa],
]
check(
  'checksum rule exact on all captures',
  capPacks.every(([t, p, c]) => flyCurveChecksum(t, p) === c)
)
const built = flyCurveWindow(2, [50, 56, 63, 69, 75, 94, 113, 131, 150])
check(
  'window builder byte-exact (slow preset)',
  JSON.stringify(built) === JSON.stringify([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 2, 50, 56, 63, 69, 75, 94, 113, 131, 150, 0xd5, 0, 0, 0, 0, 0])
)

// --- right packs: (0xB6 + type + pts) & FF across 4 captures ---------------
const capR: Array<[number, number[], number]> = [
  [3, [50, 102, 113, 119, 126, 132, 138, 144, 150], 0xeb],
  [3, [50, 102, 113, 119, 126, 132, 138, 144, 150], 0xeb],
  [3, [50, 58, 66, 74, 82, 89, 100, 125, 150], 0xd3],
  [3, [50, 62, 73, 85, 96, 108, 119, 134, 150], 0x26],
]
check(
  'right checksum rule exact',
  capR.every(([t, p, c]) => flyRightChecksum(t, p) === c)
)
const builtR = flyRightWindow(3, [50, 58, 66, 74, 82, 89, 100, 125, 150])
check(
  'right window byte-exact',
  JSON.stringify(builtR) === JSON.stringify([0, 0, 3, 50, 58, 66, 74, 82, 89, 100, 125, 150, 0, 0, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xd3, 0, 0, 0, 0, 0])
)

// --- store parse (E-stripped layout) -----------------------------------------
const store = new Uint8Array(1050)
store.fill(0, 0, 975)
store.fill(0xff, 975, 985)
store[985] = 2
store.set([50, 56, 63, 69, 75, 94, 113, 131, 150], 986)
store[1002] = 0
store.set([50, 62, 75, 87, 100, 112, 125, 137, 150], 1003)
const parsed = parseFlyStore(store)
check(
  'store parse',
  !!parsed && parsed.leftType === 2 && parsed.leftPoints[8] === 150 && parsed.rightType === 0 && parsed.rightPoints[1] === 62
)
check('store rejects short', parseFlyStore(new Uint8Array(100)) === null)
check('store rejects missing FF run', (() => {
  const bad = new Uint8Array(store)
  bad[980] = 0
  return parseFlyStore(bad) === null
})())

// --- LED brightness: XX byte == brightness, cksum (0xDA + b) & FF --------
const ledCaps: Array<[number, number]> = [
  [0, 0xda],
  [7, 0xe1],
  [32, 0xfa],
  [50, 0x0c],
  [77, 0x27],
  [88, 0x32],
  [100, 0x3e],
  [61, 0x17],
  [16, 0xea],
]
check(
  'led checksum rule exact',
  ledCaps.every(([b, c]) => flyLedChecksum(b) === c)
)
const ledBuilt = flyLedWindow(40)
check(
  'led window byte-exact (brightness 40)',
  JSON.stringify(ledBuilt) ===
    JSON.stringify([0, 3, 0, 0, 9, 4, 40, 0x0c, 0x07, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x02, 0, 0, 0, 0, 0])
)

// --- precision write path (live USB captures 2026-10-14) ----------------------
// 12->11->12 flip: [03,05,1d]/ack 05, [03,03,1b]/ack 03; 10-bit: [03,02,1a]/ack 02.
// 0x03 HwFunction replies carried the enum at index 12 (03 at 12-bit, 02 at 10-bit).
check(
  'precision domain is the Space Station picker',
  JSON.stringify(FLY_PRECISION_BITS) === JSON.stringify([
    { bits: 12, value: 3 },
    { bits: 11, value: 5 },
    { bits: 10, value: 2 },
    { bits: 9, value: 4 },
    { bits: 8, value: 1 }
  ])
)
check('precision args 12-bit', JSON.stringify(flyPrecisionArgs(3)) === JSON.stringify([3, 3, 0x1b]))
check('precision args 11-bit', JSON.stringify(flyPrecisionArgs(5)) === JSON.stringify([3, 5, 0x1d]))
check('precision args 10-bit', JSON.stringify(flyPrecisionArgs(2)) === JSON.stringify([3, 2, 0x1a]))
check(
  'precision ack accepts value echo',
  flyPrecisionAck(hex('04-5a-a5-15-01-00-02-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00'), 2)
)
check(
  'precision ack rejects wrong value',
  !flyPrecisionAck(hex('04-5a-a5-15-01-00-02-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00'), 3)
)
check(
  'precision ack rejects short',
  !flyPrecisionAck(hex('04-5a-a5-15-01-00'), 2)
)
check(
  'precision read 12-bit',
  flyPrecisionValue(hex('04-5a-a5-03-01-00-fb-72-01-01-0f-00-03-11-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00')) === 3
)
check(
  'precision read 10-bit',
  flyPrecisionValue(hex('04-5a-a5-03-01-00-fb-72-01-01-0f-00-02-11-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00')) === 2
)
check('precision read rejects short', flyPrecisionValue(new Uint8Array(8)) === -1)

// --- M1 remap path (live USB capture 2026-10-14, B->X->B round trip proven) ---
// 0x11 select [07 FF 00 FF FF FF 14] / ack [01,00,01,00]; A4 sec 03 len C2;
// A5 27 B window with M1 value at [7], checksum (0xBD + sum[0:23]) at [23].
check('map select args captured', JSON.stringify(flyMapSelectArgs()) === JSON.stringify([7, 0xff, 0, 0xff, 0xff, 0xff, 0x14]))
check(
  'map select ack accepts record 00',
  flyMapSelectAck(hex('04-5a-a5-11-01-00-01-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00'))
)
check(
  'map select ack rejects record 01',
  !flyMapSelectAck(hex('04-5a-a5-11-01-00-01-01-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00'))
)
check(
  'map window X byte-exact (captured)',
  JSON.stringify(flyMapWindow(7)) === JSON.stringify([0, 0xff, 0, 0, 0xff, 0, 0, 7, 0, 0, 0xff, 0, 0, 0xff, 0, 0, 0xff, 0, 0, 0xff, 0, 0, 0xff, 0xbd, 0, 0, 0])
)
check(
  'map window B byte-exact (pad-accepted)',
  JSON.stringify(flyMapWindow(5)) === JSON.stringify([0, 0xff, 0, 0, 0xff, 0, 0, 5, 0, 0, 0xff, 0, 0, 0xff, 0, 0, 0xff, 0, 0, 0xff, 0, 0, 0xff, 0xbb, 0, 0, 0])
)
check('map checksum X', flyMapChecksum(flyMapWindow(7).slice(0, 23)) === 0xbd)
check('map checksum B', flyMapChecksum(flyMapWindow(5).slice(0, 23)) === 0xbb)
check(
  'map table M1=A M2=B byte-exact (captured y-pcap)',
  JSON.stringify(flyMapTable({ 2: 4, 3: 5 })) === JSON.stringify([0, 0xff, 0, 0, 0xff, 0, 0, 4, 0, 0, 5, 0, 0, 0xff, 0, 0, 0xff, 0, 0, 0xff, 0, 0, 0xff, 0xc0, 0, 0, 0])
)
check('map table checksum C0', flyMapChecksum(flyMapTable({ 2: 4, 3: 5 }).slice(0, 23)) === 0xc0)
check(
  'map table M1=A M2=B M3=B byte-exact (captured b-pcap)',
  JSON.stringify(flyMapTable({ 2: 4, 3: 5, 4: 5 })) === JSON.stringify([0, 0xff, 0, 0, 0xff, 0, 0, 4, 0, 0, 5, 0, 0, 5, 0, 0, 0xff, 0, 0, 0xff, 0, 0, 0xff, 0xc6, 0, 0, 0])
)
check('map table checksum C6', flyMapChecksum(flyMapTable({ 2: 4, 3: 5, 4: 5 }).slice(0, 23)) === 0xc6)
check(
  'map table M1=A M2=B M3=B M4=B byte-exact (captured next-pcap)',
  JSON.stringify(flyMapTable({ 2: 4, 3: 5, 4: 5, 5: 5 })) === JSON.stringify([0, 0xff, 0, 0, 0xff, 0, 0, 4, 0, 0, 5, 0, 0, 5, 0, 0, 5, 0, 0, 0xff, 0, 0, 0xff, 0xcc, 0, 0, 0])
)
check('map table checksum CC', flyMapChecksum(flyMapTable({ 2: 4, 3: 5, 4: 5, 5: 5 }).slice(0, 23)) === 0xcc)
check('map table rejects bad slot', (() => { try { flyMapTable({ 7: 4 }); return false } catch { return true } })())
check('map table rejects bad value', (() => { try { flyMapTable({ 2: 300 }); return false } catch { return true } })())
check('map targets exclude turbo', !FLY_MAP_TARGETS.some((o) => o.value === 25))
check('map targets carry A/B/X', JSON.stringify(FLY_MAP_TARGETS.filter((o) => ['A', 'B', 'X'].includes(o.label)).map((o) => o.value)) === JSON.stringify([4, 5, 7]))

if (failures > 0) {
  console.error(`${failures} FAILURES`)
  process.exit(1)
}
console.log('ALL FLYDIGI TESTS PASSED')
