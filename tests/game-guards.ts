import assert from 'node:assert/strict'
import { ApexGuard } from '../src/main/apex-guard'
import { parseGameProcesses, isFinalsPath, killGame } from '../src/main/game-guards'
import { GUARDED_GAMES, isGuardedGame, type GuardedGame } from '../src/shared/game-guards'
async function test(): Promise<void> {
  assert(!isGuardedGame('__proto__')); assert(!isGuardedGame('apex')); assert(isGuardedGame('finals'))
  assert(isFinalsPath('C:\\Games\\THE FINALS\\Discovery.exe'))
  assert(isFinalsPath('D:\\Steam\\THE FINALS\\Discovery\\Binaries\\Win64\\Discovery-e.exe'))
  assert(!isFinalsPath('C:\\Other\\Discovery.exe'))
  assert(!isFinalsPath('C:\\Games\\THE FINALS\\other.exe'))
  for (const game of Object.keys(GUARDED_GAMES) as GuardedGame[]) {
    const image = GUARDED_GAMES[game].images[0]
    const csv = `"${image.toUpperCase()}","123","Console"\n"other.exe","456"\n"${image}","0"\n"${image}","999999999999999999999"`
    assert.deepEqual(parseGameProcesses(game, csv), [{ image, pid: 123 }])
    await assert.rejects(killGame(game, { image: 'other.exe', pid: 123 }), /Invalid/)
    let rc: boolean | null = false, scans = 0, kills = 0
    const guard = new ApexGuard({ rc: async () => rc, list: async () => { scans++; return [{ image, pid: 123 }] }, kill: async () => { kills++ }, changed: () => {} }, GUARDED_GAMES[game].name)
    await guard.tick(); assert.equal(scans, 0)
    guard.setEnabled(true); await guard.tick(); assert.equal(scans, 0)
    rc = true; await guard.tick(); assert.equal(kills, 1); assert(guard.status.alert?.includes(GUARDED_GAMES[game].name))
    rc = null; await guard.tick(); assert.equal(kills, 2)
    guard.dismiss(); assert.equal(guard.status.alert, null)
    rc = false; await guard.tick(); assert.equal(kills, 2)
    guard.setEnabled(false); rc = true; await guard.tick(); assert.equal(kills, 2)
  }
  console.log('Game guards: four games, exact matching, unrelated-process rejection, Finals path checks, off/neutral/armed/disconnected behavior passed. No real games closed.')
}
void test().catch(e => { console.error(e); process.exitCode = 1 })
