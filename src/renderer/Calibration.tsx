import { useEffect, useRef, useState } from 'react'
import { api, type LiveSample } from './api'

export function CalibrationPanel(): JSX.Element {
  const [part, setPart] = useState(15), [stage, setStage] = useState<'ready' | 'running' | 'done'>('ready')
  const [live, setLive] = useState<LiveSample | null>(null), [busy, setBusy] = useState(false), [note, setNote] = useState('')
  const active = useRef(false), seen = useRef(false), started = useRef(0)
  useEffect(() => {
    const off = api().on('input:sample', (value) => {
      const sample = value as LiveSample; setLive(sample)
      if (!active.current) return
      if (!sample.live) { active.current = false; setStage('ready'); setNote('Controller disconnected. Calibration result is unknown; reconnect and start again.'); return }
      if (part === 19 ? sample.calTarget === 3 && [0, 1, 2, 3, 4, 128].includes(sample.calMask) : sample.calTarget !== 1) seen.current = true
      if (part === 16 && seen.current && sample.calTarget === 1) {
        active.current = false; setStage('done'); setNote(sample.calMask & 16 ? 'Controller reports sensor calibration complete.' : 'Sensor calibration ended without a success flag. Try again.')
      }
    })
    const timer = window.setInterval(() => {
      if (active.current && !seen.current && Date.now() - started.current > 3500) { setNote('No calibration progress received. Check that this firmware supports the selected mode, or cancel and retry.'); }
      if (active.current && Date.now() - started.current > 120000) { active.current = false; setStage('ready'); void api().calibration(2, part).catch(() => {}); setNote('Calibration timed out. Cancel requested; check controller status before retrying.') }
    }, 1000)
    return () => { off(); window.clearInterval(timer); if (active.current) { active.current = false; void api().calibration(2, part).catch(() => {}) } }
  }, [part])
  async function command(state: number): Promise<void> {
    setBusy(true); setNote('')
    try {
      if (state === 0) { seen.current = false; started.current = Date.now(); active.current = true }
      await api().calibration(state, part)
      if (state === 0) { setStage('running'); setNote('Calibration started. Follow the steps below; progress comes from the controller.') }
      else { active.current = false; setStage(state === 1 ? 'done' : 'ready'); setNote(state === 1 ? 'Controller confirmed calibration finished.' : 'Controller confirmed calibration mode ended after cancel.') }
    } catch (e) { if (state === 0) active.current = false; setNote((e as Error).message) }
    finally { setBusy(false) }
  }
  const parts = [[1, 'Left stick'], [2, 'Right stick'], [4, 'Left trigger'], [8, 'Right trigger'], [16, 'Motion sensor']] as const
  const fine = part === 19
  const passed = !!live && (fine ? live.calTarget === 3 && live.calMask === 128 : (live.calMask & part) === part)
  return <div className="card"><h3>Guided calibration</h3><p className="hint">Calibration changes the controller’s stored reference values. Center offsets are separate. Finish other controller operations first. Leaving this page requests cancellation.</p><fieldset className="control-fieldset" disabled={busy || stage === 'running'}><label className="stack">Calibrate<select className="input" value={part} onChange={(e) => setPart(Number(e.target.value))}><option value={15}>Sticks and triggers</option><option value={3}>Sticks only</option><option value={12}>Triggers only</option><option value={16}>Motion sensor</option><option value={19}>Fine stick tuning</option></select></label></fieldset><ol><li>Place the controller on a stable surface. Release both sticks and triggers.</li>{!fine && part & 3 ? <li>Slowly rotate each stick around its full outer edge several times, then release it to rest.</li> : null}{!fine && part & 12 ? <li>Fully press and release each trigger several times.</li> : null}{part === 16 ? <li>Keep the controller completely still. Sensor calibration finishes automatically when the firmware reports its result.</li> : <li>Wait for all selected parts to pass, release the controls, then save.</li>}</ol>{fine && <p className="note">{stage !== 'running' ? 'Fine tuning guides both sticks through up, down, left, right and full circles.' : live?.calTarget === 3 ? live.calMask === 128 ? 'All fine tuning stages complete. Release both sticks, then save.' : `Move BOTH sticks: ${['fully up, then release', 'fully down, then release', 'fully left, then release', 'fully right, then release', 'in slow full circles, then release'][live.calMask] ?? 'waiting for controller guidance'}.` : 'Waiting for fine tuning status…'}</p>}{stage === 'running' && !fine && <div className="row wrap">{parts.filter(([mask]) => part & mask).map(([mask, label]) => <span className={`pill${live && live.calMask & mask ? ' good' : ''}`} key={mask}>{label}: {live && live.calMask & mask ? 'passed' : 'waiting'}</span>)}</div>}<div className="row wrap" style={{ gap: 8, marginTop: 16 }}><button className="btn primary" disabled={busy || stage === 'running' || !live?.live} onClick={() => void command(0)}>Start calibration</button>{stage === 'running' && <><button className="btn primary" disabled={busy || part === 16 || !passed || !seen.current} onClick={() => { if (window.confirm('Save this calibration to the controller? Release the sticks and triggers before continuing.')) void command(1) }}>Save calibration</button><button className="btn" disabled={busy} onClick={() => void command(2)}>Cancel</button></>}</div>{note && <p className="note" role="status">{note}</p>}<p className="hint">Device mode: {live ? live.calTarget : 'unavailable'} · progress mask: {live ? live.calMask : 'unavailable'}. A sent command alone is never treated as a successful save.</p></div>
}
