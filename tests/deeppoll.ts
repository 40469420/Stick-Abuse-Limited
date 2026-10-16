// Kernel poll math: steady-rate with stall exclusion, URB pairing, bins.
import { dpPercentile, dpComputeRate, dpPairIntervals, dpBin, dpPickDevice } from '../src/shared/deeppoll'

let failed = 0
function check(name: string, cond: boolean): void {
  if (cond) console.log(`✓ ${name}`)
  else {
    console.log(`✗ FAIL: ${name}`)
    failed++
  }
}

function approx(a: number, b: number, eps = 1e-6): boolean {
  return Math.abs(a - b) <= eps
}

// percentile: nearest-rank, clamped
{
  const s = [10, 20, 30, 40]
  check('p50', dpPercentile(s, 50) === 30)
  check('p0 is min', dpPercentile(s, 0) === 10)
  check('p100 is max', dpPercentile(s, 100) === 40)
  check('empty is 0', dpPercentile([], 50) === 0)
}

// steady 8K with one host stall excluded
{
  const iv = new Array<number>(100).fill(125)
  iv.push(9000)
  const r = dpComputeRate(iv)
  check('8K steady', r.rateHz > 7950 && r.rateHz < 8050)
  check('one stall counted', r.stalls === 1)
  check('stall ms ~9', approx(r.stallMs, 9))
  check('threshold is 4x median', approx(r.thresholdUs, 1000))
}

// empty / garbage input
{
  const r = dpComputeRate([])
  check('empty rate 0', r.rateHz === 0 && r.stalls === 0)
  const r2 = dpComputeRate([NaN, -5, 1e9])
  check('garbage filtered', r2.rateHz === 0)
}

// URB pairing: starts open, stops close; intervals from completions
{
  const recs = [
    { urb: 'a', dev: 'd1', t: 0, kind: 'start' as const },
    { urb: 'b', dev: 'd1', t: 50, kind: 'start' as const },
    { urb: 'a', dev: 'd1', t: 100, kind: 'stop' as const },
    { urb: 'b', dev: 'd1', t: 225, kind: 'stop' as const },
    { urb: 'z', dev: 'd1', t: 300, kind: 'stop' as const },
    { urb: 'c', dev: 'd2', t: 400, kind: 'start' as const },
    { urb: 'c', dev: 'd2', t: 500, kind: 'stop' as const }
  ]
  const m = dpPairIntervals(recs)
  const d1 = m.get('d1') ?? []
  check('one interval on d1', d1.length === 1 && approx(d1[0], 125))
  check('orphan stop ignored', !m.get('d9'))
  check('single completion has no interval', !m.has('d2'))
}

// bins cover ~100% and label the fast overflow first
{
  const iv = new Array<number>(1000).fill(125)
  const bins = dpBin(iv)
  check('8 bins', bins.length === 8)
  const total = bins.reduce((a, b) => a + b.pct, 0)
  check('bins sum to 100', approx(total, 100))
  check('fast bin first', bins[0].label.startsWith('>'))
  check('empty bins none', dpBin([]).length === 0)
}

// headline pick: busiest in-V family else busiest overall
{
  const perDev = new Map<string, number[]>([
    ['a', [1, 2]],
    ['b', [1, 2, 3]],
    ['c', [1, 2, 3, 4]]
  ])
  const devmap = new Map<string, string>([['a', '3537:103D'], ['b', '1234:5678'], ['c', '9999:0001']])
  const pick = dpPickDevice(perDev, devmap, '3537')
  check('family busiest picked', pick !== null && pick.dev === 'a')
  const pick2 = dpPickDevice(perDev, devmap, 'FFFF')
  check('fallback busiest overall', pick2 !== null && pick2.dev === 'c')
  check('empty picks null', dpPickDevice(new Map(), devmap, '3537') === null)
}

if (failed > 0) {
  console.log(`${failed} FAILURES`)
  process.exit(1)
} else {
  console.log('deeppoll math: all green')
}
