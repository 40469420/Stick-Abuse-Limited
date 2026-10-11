import { Help } from './Help'
import { useEffect, useRef, useState } from 'react'
import { fun, type Packet } from '@shared/profile'
import { describeRawRc } from '@shared/sticklab'
import { type RcMeasurement } from '@shared/rc'
import { api, b64ToBytes } from './api'

type Capture = { xinput?: import('../main/xinput').XInputCaptureResult; left: RcMeasurement; right: RcMeasurement; levels: number[]; firmware: string; at: string; bytes: Uint8Array; durationMs: number; reportHz: number }

export function RcFilters({ fd, edit, busy, dirty, connected, slot, firmware, bytes }: {
  fd: Packet; edit: (fn: () => void) => void; busy: boolean; dirty: boolean
  connected: boolean; slot: number; firmware: string; bytes: Uint8Array
}): JSX.Element {
  const [guard, setGuard] = useState<import('../main/apex-guard').ApexGuardStatus | null>(null)
  const [savingGuard, setSavingGuard] = useState(false)
  useEffect(() => {
    let mounted=true
    void api().apexGuardStatus().then(s=>{if(mounted)setGuard(s)}).catch(e=>{if(mounted)setMessage((e as Error).message)})
    const off=api().on('apex:status',s=>setGuard(s as unknown as import('../main/apex-guard').ApexGuardStatus))
    return ()=>{mounted=false;off()}
  }, [])
  const [running, setRunning] = useState(false)
  const [reset, setReset] = useState<import('../main/rc-reset').RcResetStatus | null>(null)
  const [savingReset, setSavingReset] = useState(false)
  useEffect(() => {
    let mounted = true
    void api().rcResetStatus().then((s) => { if (mounted) setReset(s) }).catch((e) => { if (mounted) setMessage((e as Error).message) })
    const off = api().on('rc:resetStatus', (s) => setReset(s as unknown as import('../main/rc-reset').RcResetStatus))
    return () => { mounted = false; off() }
  }, [])
  const [acknowledged, setAcknowledged] = useState(false)
  const [message, setMessage] = useState('')
  const [baseline, setBaseline] = useState<Capture | null>(null)
  const [comparison, setComparison] = useState<Capture | null>(null)
  const [xinputSlot, setXinputSlot] = useState('')
  const [slots, setSlots] = useState<import('../main/xinput').XInputSlot[]>([])
  const [scanning, setScanning] = useState(false)
  async function scan(): Promise<void> {
    setScanning(true)
    try { setSlots(await api().listXInput()) } catch (e) { setMessage((e as Error).message) }
    finally { setScanning(false) }
  }
  const cleanup = useRef<(() => void) | null>(null)
  const generation = useRef(0)
  const wires = [fun.extend.lsAntiJitter(fd), fun.extend.rsAntiJitter(fd)]
  const setLevel = (i: number, value: number): void => edit(() => {
    if (i === 0) fun.extend.setLsRcLevel(fd, value)
    else fun.extend.setRsRcLevel(fd, value)
  })
  useEffect(() => () => { generation.current++; cleanup.current?.() }, [])
  useEffect(() => {
    generation.current++
    cleanup.current?.()
    cleanup.current = null
    setRunning(false)
  }, [busy, dirty, connected, wires[0], wires[1], xinputSlot])

  async function capture(target: 'baseline' | 'comparison'): Promise<void> {
    if (!acknowledged) return
    const token = ++generation.current
    const expected = Uint8Array.from(bytes)
    setRunning(true)
    setMessage('Checking the active profile…')
    try {
      if (target === 'comparison' && baseline && (baseline.firmware !== firmware ||
        baseline.bytes.length !== expected.length || baseline.bytes.some((v, i) => i !== 49 && i !== 50 && v !== expected[i]))) {
        throw new Error('Other profile settings or firmware changed. Capture a new baseline for a like-for-like RC comparison.')
      }
      const active = await api().currentProfile()
      const read = await api().readProfile(slot, expected.length)
      if (token !== generation.current) return
      const actual = b64ToBytes(read.bytes)
      if (active !== slot || actual.length !== expected.length || actual.some((v, i) => v !== expected[i])) {
        throw new Error('Write this profile and activate it before measuring. Controller settings differ from the editor.')
      }
      setMessage('Preparing readers, then recording for 3 seconds. Leave both sticks untouched.')
      const id = crypto.randomUUID()
      cleanup.current = () => { void api().cancelRc(id).catch(() => undefined) }
      const measured = await api().captureRc(id, xinputSlot === '' ? undefined : Number(xinputSlot))
      if (token !== generation.current) return
      cleanup.current = null
      setRunning(false)
      const result = { ...measured, levels: [...wires], firmware, at: new Date().toLocaleTimeString(), bytes: expected }
      if (target === 'baseline') { setBaseline(result); setComparison(null) }
      else setComparison(result)
      setMessage('Capture complete. Vendor reports and selected XInput polls are separate measurements; neither establishes filter latency.')
    } catch (e) {
      if (token !== generation.current) return
      cleanup.current = null
      setRunning(false); setMessage((e as Error).message)
    }
  }

  return <div className="stack" style={{ gap: 16 }}>
    <section className="rc-disclaimer" aria-labelledby="rc-disclaimer-title">
      <h2 id="rc-disclaimer-title">DISCLAIMER</h2>
      <p>Controller may need downgraded or custom firmware, I cannot repackage, re-release, or claim that I may or may not have a custom firmware somewhere obtainable. But you may search and you may find something. Regardless I cannot help you here. If you do not know what you're doing stay outta this section.</p>
      <p>Apex officially prohibits jitter aim or RC filters used to exploit aim assist or negate recoil, and says detected offenders will be banned. No RC-specific permission from Call of Duty has been verified. Do not assume it is allowed. RC filtering may violate game rules and put your account at risk. This is your only warning.</p>
      <div className="row wrap" style={{ gap: 8, marginBottom: 14 }}>
        <button className="btn sm ghost" onClick={() => void api().openExternal('https://store.steampowered.com/news/posts/?appids=1172470&enddate=1785253671&feed=steam_community_announcements')}>Apex policy</button>
        <button className="btn sm ghost" onClick={() => void api().openExternal('https://support.activision.com/au/en/articles/call-of-duty-security-and-enforcement-policy')}>Call of Duty policy</button>
      </div>
      <button className="btn rc-acknowledge" disabled={acknowledged} onClick={() => setAcknowledged(true)}>{acknowledged ? 'Acknowledged' : 'I understand Machi'}</button>
    </section>
    <fieldset disabled={!acknowledged} className={`rc-controls${acknowledged ? '' : ' rc-controls-locked'}`} aria-label="RC filter controls">
    <div className="stack" style={{ gap: 16 }}>
    <div className="card">
      <h3>Background protection</h3>
      <label className="row" style={{gap:10}}><input type="checkbox" aria-label="Close Apex While RC Is Enabled" checked={guard?.enabled ?? false} disabled={!guard || savingGuard} onChange={e=>{
        setSavingGuard(true);void api().setApexGuard(e.target.checked).then(setGuard).catch(e=>setMessage((e as Error).message)).finally(()=>setSavingGuard(false))
      }}/><strong>Close Apex While RC Is Enabled</strong><Help title="Apex guard">When enabled, checks the supported controller's stored active-profile RC settings and watches for r5apex.exe or r5apex_dx12.exe. Non-neutral RC arms the guard; neutral RC disarms it. Unsaved editor changes do not arm it. Apex is force-closed, which can interrupt a match and lose progress. Checks run about once per second while the app is running, including in the tray. Busy/disconnected controllers use the last verified RC state; unknown state cannot establish protection. This cannot guarantee ban prevention or close the game before it reads inputs. Turn this off to stop monitoring.</Help></label>
      <p className="hint" role="status">{guard?.message ?? 'Loading Apex guard…'}</p>
      <label className="row" style={{ gap: 10 }}>
        <input type="checkbox" checked={reset?.enabled ?? false} disabled={!reset || savingReset || reset.running} onChange={(e) => {
          setSavingReset(true)
          void api().setRcReset(e.target.checked).then(setReset).catch((err) => setMessage((err as Error).message)).finally(() => setSavingReset(false))
        }} />
        <strong>Reset RC On Disconnect/Reconnect</strong>
      </label>
      <div className="context-help"><Help title="Background protection">Resets both sticks to level 0 in the active profile when a supported G7 connects or reconnects. Disconnecting queues the reset for reconnection; the controller cannot be changed while unplugged. Other profiles and settings are kept. Enabling takes effect on the next connection. Writing a profile can reboot the controller and trigger a reset too. Turn this option off to retain RC settings across reconnects. Closing the window keeps Stick Labs (Unlimited) in the system tray. Double-click its icon to reopen; choose Quit Stick Labs (Unlimited) to stop background monitoring. After starting the app, connect your controller once. This is not a guarantee of neutral settings before a game reads them.</Help></div>
      <p role="status" className="note">{reset?.message ?? 'Loading background settings…'}</p>
    </div>
    <div className="card">
      <div className="section-title"><h3>RC filters</h3><Help title="RC filters">Adjust the controller's stored stick-filter levels independently. Changes are staged in P{slot}; use Write to controller to apply them. GameSir Connect 1.11.1 labels the negative end “Jitter” and the positive end “Smooth”; 0 is neutral. The exact filtering algorithm and its effect on this firmware are unverified. A saved value confirms storage, not that filtering is active.</Help></div>
      <div className="two" style={{ marginTop: 16 }}>
        {wires.map((wire, i) => {
          const info = describeRawRc(wire)
          return <fieldset key={i} disabled={busy || running || !connected} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
            <legend>{i === 0 ? 'Left stick' : 'Right stick'}</legend>
            <label className="stack" style={{ gap: 8 }}>
              <span>RC level: {info.standard ? (info.level > 0 ? '+' : '') + info.level : 'Unknown'}</span>
              <input aria-label={`${i === 0 ? 'Left' : 'Right'} RC level`} type="range" min={-10} max={10} step={1}
                value={info.level} onChange={(e) => setLevel(i, Number(e.target.value))} />
            </label>
            <div className="row wrap" style={{ gap: 6, marginTop: 12 }}>
              {[-10, -5, 0, 5, 10].map((level) => <button key={level} className={`btn sm${wire === level + 11 ? ' primary' : ' ghost'}`}
                onClick={() => setLevel(i, level)}>{level > 0 ? '+' : ''}{level === 0 ? '0 · Neutral' : level}</button>)}
            </div>
            <label style={{ display: 'block', marginTop: 12 }}>Exact level
              <input aria-label={`${i === 0 ? 'Left' : 'Right'} exact RC level`} className="input" type="number" min={-10} max={10} step={1}
                value={info.level} onChange={(e) => { if (e.target.value !== '' && Number.isFinite(e.target.valueAsNumber)) setLevel(i, e.target.valueAsNumber) }} />
            </label>
            <p className={`note${info.standard ? '' : ' bad'}`}>{wire === 0 ? 'Factory/unset byte. Preserved until you edit this stick.' : info.standard ? `Stored level ${info.level > 0 ? '+' : ''}${info.level}` : 'Unrecognized stored value. Preserved until you choose a supported level.'}</p>
          </fieldset>
        })}
      </div>
      <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
        <button className="btn sm ghost" disabled={busy || running || !wires.every((w) => describeRawRc(w).standard)} onClick={() => setLevel(1, describeRawRc(wires[0]).level)}>Copy left → right</button>
        <button className="btn sm ghost" disabled={busy || running || !wires.every((w) => describeRawRc(w).standard)} onClick={() => setLevel(0, describeRawRc(wires[1]).level)}>Copy right → left</button>
        <button className="btn sm ghost" disabled={busy || running} onClick={() => edit(() => { fun.extend.setLsRcLevel(fd, 0); fun.extend.setRsRcLevel(fd, 0) })}>Both neutral</button>
      </div>
    </div>
    <div className="card">
      <div className="section-title"><h3>Compare stick noise</h3><Help title="Compare stick noise">Move the GameSir right stick and rescan to identify its XInput slot by the coordinates. A keyboard knob or virtual controller may occupy another slot. Return the stick to rest before measuring.</Help></div>
      <div className="row wrap" style={{ gap: 8, marginBottom: 12 }}>
        <button className="btn sm ghost" disabled={running || scanning} onClick={() => void scan()}>{scanning ? 'Scanning…' : 'Rescan XInput'}</button>
        <select aria-label="XInput controller" className="input" disabled={running || scanning} value={xinputSlot} onChange={(e) => { setXinputSlot(e.target.value); setBaseline(null); setComparison(null) }}>
          <option value="">Vendor stream only</option>
          {slots.map((s) => <option key={s.slot} value={s.slot}>Slot {s.slot} · Left {s.lx}, {s.ly} · Right {s.rx}, {s.ry}</option>)}
        </select>
      </div>
      <p className="hint">Firmware: {firmware || 'unknown'} · P{slot} · Capture at rest before and after writing RC changes.</p>
      <div className="row wrap" style={{ gap: 8 }}>
        <button className="btn sm primary" disabled={busy || dirty || running || !connected} onClick={() => void capture('baseline')}>Capture baseline · 3 s</button>
        <button className="btn sm ghost" disabled={busy || dirty || running || !connected || !baseline} onClick={() => void capture('comparison')}>Capture comparison · 3 s</button>
        <button className="btn sm ghost" disabled={!running} onClick={() => { generation.current++; cleanup.current?.(); cleanup.current = null; setRunning(false); setMessage('Capture cancelled.') }}>Cancel</button>
      </div>
      {dirty && <p className="note">Write your changes before measuring.</p>}
      {message && <p role="status" className="note">{message}</p>}
      {(baseline || comparison) && <div style={{ overflowX: 'auto', marginTop: 12 }}><table style={{ width: '100%', textAlign: 'left' }}>
        <thead><tr><th>Capture / stick</th><th>RC</th><th>Samples</th><th>RMS noise</th><th>X / Y span</th><th>Center offset</th></tr></thead>
        <tbody>{([['Baseline', baseline], ['Comparison', comparison]] as const).map(([label, c]) => c && [
          { name: 'Vendor', left: c.left, right: c.right, rate: `${c.reportHz.toFixed(1)} reports/s`, duration: c.durationMs },
          ...(c.xinput ? [{ name: `XInput slot ${c.xinput.slot}`, left: c.xinput.left, right: c.xinput.right, rate: `${(c.xinput.polls * 1000 / c.xinput.durationMs).toFixed(1)} polls/s · ${c.xinput.packetChanges} state changes`, duration: c.xinput.durationMs }] : [])
        ].map((stream) => [stream.left, stream.right].map((m, i) =>
          <tr key={`${label}-${stream.name}-${i}`}><td>{label} · {i === 0 ? 'Left' : 'Right'}<br /><small>{stream.name} · {c.at}</small></td><td>{describeRawRc(c.levels[i]).label}</td><td>{m.count}<br /><small>{stream.rate} · {(stream.duration / 1000).toFixed(2)} s</small></td><td>{m.rms.toFixed(3)}</td><td>{m.spanX.toFixed(3)} / {m.spanY.toFixed(3)}</td><td>{m.centerOffset.toFixed(3)}</td></tr>
        )))}</tbody>
      </table></div>}
      <div className="context-help"><Help title="Compare stick noise">Keep deadzones, curves, polling, connection and stick position the same. Measurements use vendor-count units; XInput signed coordinates are divided by 256, retaining fractions, with no added deadzone. XInput polls include repeats and are not USB reports. Its 16-bit coordinate format does not prove a 16-bit sensor. RMS is variation around the mean; center offset is distance from (128,128). Deadzones can hide noise, and movement can inflate it. This comparison cannot establish latency or aim-assist effects.</Help></div>
    </div>
    </div>
    </fieldset>
  </div>
}
