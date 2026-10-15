// LeadJoy Saber Plus read model: captured vectors + JSON/wire alignment.
import {
  LJ_CURVE_POINTS,
  LJ_QUERIES,
  ljDecodeValue,
  ljEncodeValue,
  ljWireCurve,
  ljWireValue
} from '../src/shared/leadjoy.ts'

let failures = 0
function check(name: string, cond: boolean): void {
  if (cond) console.log(`✓ ${name}`)
  else {
    console.error(`✗ ${name}`)
    failures++
  }
}

// all 8 polling queries byte-exact from USBPcap
check('8 queries captured', LJ_QUERIES.length === 8)
check(
  'version query exact',
  JSON.stringify(LJ_QUERIES[0].bytes) === JSON.stringify([0, 1, 5, 1, 1])
)
check(
  'main/sub differ only in slot tag',
  JSON.stringify(LJ_QUERIES[1].bytes.map((b, i) => (i === 13 || i === 17 || i === 21 || i === 25 ? 0 : b))) ===
    JSON.stringify(LJ_QUERIES[2].bytes.map((b, i) => (i === 13 || i === 17 || i === 21 || i === 25 ? 0 : b)))
)

// value codec: big-endian + 0xCD separator, clamp at 32768
check('encode 8225', JSON.stringify(ljEncodeValue(8225)) === JSON.stringify([0x20, 0x21, 0xcd]))
check('encode 9830', JSON.stringify(ljEncodeValue(9830)) === JSON.stringify([0x26, 0x66, 0xcd]))
check('clamp 32768 -> 7FFF', JSON.stringify(ljEncodeValue(32768)) === JSON.stringify([0x7f, 0xff, 0xcd]))
check('decode round-trip', ljDecodeValue(ljEncodeValue(15401), 0) === 15401)

// full dz30 JSON curve -> the 15 wire values seen at pcap t=14.113
const dz30: Array<readonly [number, number]> = [
  [9830, 0], [13435, 5046], [16580, 9568], [19759, 14090],
  [23101, 18874], [26312, 23396], [29425, 27918], [32768, 32768]
]
check(
  'dz30 wire chain exact',
  JSON.stringify(ljWireCurve(dz30)) === JSON.stringify([
    9830, 13435, 5046, 16580, 9568, 19759, 14090, 23101,
    18874, 26312, 23396, 29425, 27918, 0x7fff, 0x7fff
  ])
)
// dz25.1 JSON curve -> wire values at pcap t=12.133
const dz25: Array<readonly [number, number]> = [
  [8225, 0], [12026, 5046], [15401, 9568], [18809, 14090],
  [22380, 18874], [25821, 23396], [29163, 27918], [32768, 32768]
]
check(
  'dz25 wire chain exact',
  JSON.stringify(ljWireCurve(dz25)) === JSON.stringify([
    8225, 12026, 5046, 15401, 9568, 18809, 14090, 22380,
    18874, 25821, 23396, 29163, 27918, 0x7fff, 0x7fff
  ])
)
check('rejects non-8-point', (() => { try { ljWireCurve([[0, 0]]); return false } catch { return true } })())
check('curve points constant', LJ_CURVE_POINTS === 8)

if (failures > 0) {
  console.error(`${failures} FAILURES`)
  process.exit(1)
} else console.log('ALL LEADJOY TESTS PASSED')
