import { useEffect, useRef, useState } from 'react'
import { GUARDED_GAMES, type GuardedGame, type GameGuardStatuses } from '../shared/game-guards'
import { api } from './api'
import { Help } from './Help'
const games = Object.keys(GUARDED_GAMES) as GuardedGame[]
function useGameGuards() {
  const [statuses, setStatuses] = useState<GameGuardStatuses | null>(null)
  useEffect(() => {
    let mounted = true
    void api().gameGuardStatus().then(s => { if (mounted) setStatuses(s) }).catch(() => undefined)
    const off = api().on('games:status', s => setStatuses(s as unknown as GameGuardStatuses))
    return () => { mounted = false; off() }
  }, [])
  return [statuses, setStatuses] as const
}
export function GameGuardControls(): JSX.Element {
  const [statuses, setStatuses] = useGameGuards()
  const [saving, setSaving] = useState<GuardedGame | null>(null)
  const [error, setError] = useState('')
  return <div className="stack" style={{ gap: 12 }}>{games.map(game => <div key={game}>
    <label className="row" style={{ gap: 10 }}><input type="checkbox" checked={statuses?.[game].enabled ?? false} disabled={!statuses || saving !== null} onChange={e => {
      setSaving(game); setError('')
      void api().setGameGuard(game, e.target.checked).then(setStatuses).catch(e => setError((e as Error).message)).finally(() => setSaving(null))
    }} /><strong>Close {GUARDED_GAMES[game].name} While RC Is Enabled</strong><Help title={`${GUARDED_GAMES[game].name} guard`}>Force-closes this game when the connected supported controller's stored active profile has non-neutral RC. Runs while Stick Abuse is open, including in the tray. Busy or disconnected controllers retain the last verified RC state. Unsaved edits do not arm protection. Closing a game may lose progress. Windows may deny termination. This cannot guarantee ban prevention or close the game before it receives inputs. Battlefield covers BF6, 2042, V, 1 and 4. The Finals also requires a matching installation path. These are optional precautions, not claims that each publisher specifically bans RC filters.</Help></label>
    <p className="hint" role="status">{statuses?.[game].message ?? 'Loading guard…'}</p>
  </div>)}{error && <p role="alert">{error}</p>}</div>
}
export function GameGuardWarning(): JSX.Element | null {
  const [statuses, setStatuses] = useGameGuards()
  const game = games.find(key => statuses?.[key].alert)
  const button = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (game) button.current?.focus() }, [game])
  if (!game || !statuses) return null
  const status = statuses[game]
  return <div className="quit-warning-backdrop" onKeyDown={e => { if (e.key === 'Tab') { e.preventDefault(); button.current?.focus() } }}><section className="rc-disclaimer quit-warning" role="alertdialog" aria-modal="true" aria-labelledby="game-warning-title"><h2 id="game-warning-title">RC enabled</h2><p>{status.alert}</p><p>{status.message}</p><button ref={button} className="btn rc-acknowledge" onClick={() => { void api().dismissGameGuard(game).then(setStatuses).catch(() => undefined) }}>Understood</button></section></div>
}
