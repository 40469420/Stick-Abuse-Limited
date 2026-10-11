/**
 * Flydigi Apex 5 protocol tests — vectors captured live (2026-10-11).
 *
 *   node scripts/test.mjs tests/flydigi.ts
 */
import {
  FLY_CURVE_POINTS,
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

if (failures > 0) {
  console.error(`${failures} FAILURES`)
  process.exit(1)
}
console.log('ALL FLYDIGI TESTS PASSED')
