import { command, type ApexProcess } from './apex-guard'
import { GUARDED_GAMES, type GuardedGame } from '../shared/game-guards'

export function parseGameProcesses(game: GuardedGame, csv: string): ApexProcess[] {
  const allowed: readonly string[] = GUARDED_GAMES[game].images
  return csv.split(/\r?\n/).flatMap(line => {
    const match = /^"([^"]+)","(\d+)"(?:,|$)/.exec(line.trim())
    const pid = Number(match?.[2]), image = match?.[1].toLowerCase() ?? ''
    return allowed.includes(image) && Number.isSafeInteger(pid) && pid > 0 ? [{ pid, image }] : []
  })
}
export function isFinalsPath(path: string): boolean {
  return /\\(?:the finals|discovery)\\/i.test(path.trim()) && /\\discovery(?:-e)?\.exe$/i.test(path.trim())
}
export async function listGame(game: GuardedGame): Promise<ApexProcess[]> {
  const rows = await Promise.all(GUARDED_GAMES[game].images.map(image => command('tasklist.exe', ['/FI', `IMAGENAME eq ${image}`, '/FO', 'CSV', '/NH'])))
  return rows.flatMap(row => parseGameProcesses(game, row))
}
export async function killGame(game: GuardedGame, target: ApexProcess): Promise<void> {
  const allowed: readonly string[] = GUARDED_GAMES[game].images
  if (!allowed.includes(target.image) || !Number.isSafeInteger(target.pid) || target.pid <= 0) throw new Error('Invalid game process')
  // Discovery.exe is a generic name. Verify its installation path before closing it.
  if (game === 'finals') {
    const path = await command('WindowsPowerShell/v1.0/powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `(Get-Process -Id ${target.pid} -ErrorAction Stop).Path`])
    if (!isFinalsPath(path)) throw new Error('Could not verify The Finals executable path; process was left running.')
  }
  await command('taskkill.exe', ['/F', '/PID', String(target.pid), '/FI', `IMAGENAME eq ${target.image}`])
  if ((await listGame(game)).some(p => p.pid === target.pid && p.image === target.image)) throw new Error('Game is still running; Windows may have denied termination.')
}
