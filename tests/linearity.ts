// Linearity-bench math: frontier filter, resampling, median pick,
// nonlinearity scoring. Clean-room implementation of the classic
// center-to-edge method; these tests pin the formulas.
import {
  linFrontier, linTremor, linResolution, linResample, linMedian,
  linRepresentative, linNonlinearity, linLinearity, LIN_GRID
} from '../src/shared/sticklab'

let failed = 0
function check(name: string, cond: boolean): void {
  if (cond) console.log(`✓ ${name}`)
  else {
    console.log(`✗ FAIL: ${name}`)
    failed++
  }
}

function approx(a: number, b: number, eps = 1e-9): boolean {
  return Math.abs(a - b) <= eps
}

// frontier keeps the advancing edge, drops repeats and backtracks
{
  const { kept, dropped } = linFrontier([0, 0.1, 0.1, 0.05, 0.2, 0.3])
  check('frontier keeps advances', JSON.stringify(kept) === JSON.stringify([0, 0.1, 0.2, 0.3]))
  check('frontier counts drops', dropped === 2)
}

// perfect ramp: no tremor, full linearity
{
  const pts = [0, 0.25, 0.5, 0.75, 1]
  const tms = [0, 1, 2, 3, 4]
  const f = linFrontier(pts)
  check('clean ramp keeps all', f.dropped === 0)
  check('clean ramp tremor 0', linTremor(pts.length, f.kept.length) === 0)
  check('clean ramp linearity 100', approx(linLinearity(pts, tms), 100))
}

// tremor is the dropped share
{
  check('half dropped = 50% tremor', approx(linTremor(10, 5), 50))
  check('empty = 0 tremor', linTremor(0, 0) === 0)
}

// resolution = floored reciprocal of mean step
{
  check('0.01 steps = 100', linResolution([0, 0.01, 0.02, 0.03]) === 100)
  check('single sample = 0', linResolution([0.5]) === 0)
  check('flat = 0', linResolution([0.2, 0.2, 0.2]) === 0)
}

// nonlinearity: max-heavy blend, capped, scaled
{
  // mid kink of +0.2 over range 1 → avg 0.2/3? single interior point
  const nl = linNonlinearity([0, 0.7, 1], [0, 1, 2])
  // ideal mid = 0.5, dev = 0.2 → avg=max=20% → 1.5*(8+12)=30
  check('kink scores 30', approx(nl.score, 30))
  check('linearity is 100-score', approx(linLinearity([0, 0.7, 1], [0, 1, 2]), 70))
  check('short input scores 0', linNonlinearity([0, 1], [0, 1]).score === 0)
  check('flat range scores 0', linNonlinearity([0.5, 0.5, 0.5], [0, 1, 2]).score === 0)
}

// resample: uniform grid, clamped edges
{
  const g = linResample([0, 1], [10, 20], 5)
  check('grid length', g.length === 5)
  check('grid endpoints', approx(g[0], 0) && approx(g[4], 1))
  check('grid midpoint', approx(g[2], 0.5))
}

// median + representative pick
{
  const grids = [[0, 1, 2], [0, 1.2, 2], [0, 0.8, 2], [10, 10, 10]]
  const med = linMedian(grids)
  check('median per column', approx(med[0], 0) && approx(med[1], 1.1) && approx(med[2], 2))
  const grids2 = [[0, 0, 0], [0, 1, 0], [0, 2, 0]]
  const med2 = linMedian(grids2)
  check('representative is closest', linRepresentative(grids2, med2) === 1)
  check('grid default width', linResample([0, 1], [0, 1]).length === LIN_GRID)
}

if (failed > 0) {
  console.log(`${failed} FAILURES`)
  process.exit(1)
} else {
  console.log('linearity math: all green')
}
