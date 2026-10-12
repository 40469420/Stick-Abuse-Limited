import { KeyIcon } from './KeyIcon'
import { Help } from './Help'
import { useEffect, useRef, useState } from 'react'
import { api, type DeviceInfo } from './api'
import { BitDepthBench } from './BitDepthBench'
import { INTERVAL_BINS, type BenchCapture, type BenchLive, type BenchMode, type Distribution, type XInputBench } from '@shared/bench'

type Result = { kind: 'vendor'; data: BenchCapture } | { kind: 'xinput'; data: XInputBench } | { kind: 'roundtrip'; data: Distribution }
type Summary = Record<'rate' | 'p95' | 'p99' | 'jitter' | 'noiseL' | 'noiseR' | 'offsetL' | 'offsetR' | 'coverageL' | 'coverageR', number | null>
interface Run { schema: 1; id: string; label: string; date: string; device: string; firmware: string; receiver: string; connection: string; appVersion: string; editedProfile: number; targetHz: number; result: Result; summary: Summary }
const STORAGE = 'sticklabs.performance-bench.v1'
const guidance: Record<BenchMode, { name: string; text: string }> = {
  timing: { name: 'Report timing', text: 'Move both sticks continuously.' },
  rest: { name: 'Center noise', text: 'Place the controller on a stable surface. Leave both sticks and triggers completely untouched.' },
  range: { name: 'Range & circularity', text: 'Slowly rotate both sticks against the outer gate several times in both directions. Cover the entire perimeter.' },
  release: { name: 'Release / snapback', text: 'Push one stick fully to one side and let go without guiding it. Wait a second, then repeat. Test each stick separately.' },
  triggers: { name: 'Trigger sweep', text: 'Slowly press and release each trigger through its full range several times. Pause at rest and full press.' }
}
function number(v: number | null | undefined, digits = 2): string { return v == null ? '—' : v.toFixed(digits) }
function percentage(v: number | null | undefined): string { return v == null ? '—' : `${(v * 100).toFixed(3)}%` }
function timingOf(result: Result): Distribution | null { return result.kind === 'roundtrip' ? result.data : result.data.intervals }
function summarize(result: Result): Summary {
  const d = timingOf(result), v = result.kind === 'vendor' ? result.data : null
  return { rate: result.kind === 'vendor' ? result.data.reportHz : result.kind === 'xinput' ? result.data.changeHz : null,
    p95: d?.p95 ?? null, p99: d?.p99 ?? null, jitter: d?.stdDev ?? null,
    noiseL: v?.mode === 'rest' ? v.sticks[0].rmsNoise * 100 : null, noiseR: v?.mode === 'rest' ? v.sticks[1].rmsNoise * 100 : null,
    offsetL: v?.mode === 'rest' ? v.sticks[0].centerOffset * 100 : null, offsetR: v?.mode === 'rest' ? v.sticks[1].centerOffset * 100 : null,
    coverageL: v?.mode === 'range' ? v.sticks[0].angularCoverage * 100 : null, coverageR: v?.mode === 'range' ? v.sticks[1].angularCoverage * 100 : null }
}
function readSaved(): Run[] {
  try {
    const text = localStorage.getItem(STORAGE) ?? '[]'
    if (text.length > 4000000) return []
    const rows: unknown = JSON.parse(text)
    if (!Array.isArray(rows)) return []
    return rows.filter((r): r is Run => !!r && r.schema === 1 && typeof r.id === 'string' && typeof r.label === 'string' && typeof r.date === 'string' &&
      typeof r.device === 'string' && typeof r.firmware === 'string' && Number.isFinite(r.targetHz) && !!r.result &&
      ['vendor', 'xinput', 'roundtrip'].includes(r.result.kind) && !!r.summary && Object.values(r.summary).every(v => v === null || typeof v === 'number' && Number.isFinite(v))).slice(0, 8)
  } catch { return [] }
}
function exportRun(run: Run): void {
  const blob = new Blob([JSON.stringify(run, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob), a = document.createElement('a')
  a.href = url; a.download = `sticklabs-bench-${run.result.kind}-${run.date.replace(/[:.]/g, '-')}.json`; a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function Timing({ value, title }: { value: Distribution | null; title: string }): JSX.Element {
  return <div><div className="section-title"><h3>{title}</h3><Help title={title}>Jitter is population standard deviation. Histogram buckets show interval lengths in milliseconds.</Help></div>{!value ? <p className="hint">Not enough observations yet.</p> : <>
    <div className="row wrap" style={{ gap: 8 }}>{[['Median', value.median], ['P95', value.p95], ['P99', value.p99], ['Worst', value.max], ['Jitter σ', value.stdDev]].map(([label, v]) => <span className="pill" key={String(label)}>{label} {number(Number(v), 4)} ms</span>)}</div>
    <p className="hint">{value.count.toLocaleString()} intervals · min {number(value.min, 4)} ms · mean {number(value.mean, 4)} ms.</p>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: 4, alignItems: 'end', height: 100 }} aria-label="Interval histogram">
      {value.histogram.map((count, i) => <div key={i} title={`${count.toLocaleString()} samples`} style={{ textAlign: 'center', fontSize: 10 }}>
        <div style={{ height: Math.max(2, count / Math.max(1, ...value.histogram) * 66), background: 'var(--accent, #f43f52)', borderRadius: '3px 3px 0 0' }} />
        <span>{i < 8 ? `≤${INTERVAL_BINS[i]}` : '>16'}</span>
      </div>)}
    </div>
  </>}</div>
}
function Trace({ capture }: { capture: BenchCapture }): JSX.Element {
  const traces = capture.mode === 'triggers' ? [0, 1] : [0, 1, 2, 3]
  const colors = ['#fa5369', '#ffc35c', '#48d7bd', '#7aabff']
  return <><h3>{capture.mode === 'triggers' ? 'Trigger travel over time' : 'Stick motion over time'}</h3>
    <svg viewBox="0 0 800 180" style={{ width: '100%', height: 180 }} role="img" aria-label="Capture timeline">
      <path d="M0 90H800 M0 10H800 M0 170H800" stroke="var(--line-2)" />
      {traces.map(i => <polyline key={i} fill="none" stroke={colors[i]} strokeWidth="1.25" points={capture.trace.map(s => `${s.t / capture.durationMs * 800},${capture.mode === 'triggers' ? 170 - s.triggers[i] * 160 : 90 - s.axes[i] * 80}`).join(' ')} />)}
    </svg><p className="hint">{capture.mode === 'triggers' ? 'Red LT · gold RT' : 'Red LX · gold LY · green RX · blue RY'} · {number(capture.durationMs / 1000)} seconds. <Help title="Timeline">Trace is decimated for display; statistics use all captured samples.</Help></p>
  </>
}
export function PerformanceBench({ context, targetHz, profile, device, info, connected, connection, precisionAvailable, identity, reload }: { context: string; targetHz: number; profile: number; device: string; info: DeviceInfo | null; connected: boolean; connection: string; precisionAvailable: boolean; identity: string; reload: () => Promise<void> }): JSX.Element {
  const session = useRef<string | null>(null)
  const alive = useRef(true)
  const [visible, setVisible] = useState(!document.hidden)
  const [paused, setPaused] = useState(false)
  const [active, setActive] = useState(false)
  const [live, setLive] = useState<BenchLive | null>(null)
  const [history, setHistory] = useState<number[]>([])
  const [error, setError] = useState('')
  const [task, setTask] = useState('')
  const [started, setStarted] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [mode, setMode] = useState<BenchMode>('timing')
  const [seconds, setSeconds] = useState(10)
  const [slots, setSlots] = useState<Awaited<ReturnType<ReturnType<typeof api>['listXInput']>>>([])
  const [slot, setSlot] = useState<number | null>(null)
  const [scanning, setScanning] = useState(false)
  const [run, setRun] = useState<Run | null>(null)
  const [saved, setSaved] = useState<Run[]>(readSaved)
  const [baseline, setBaseline] = useState('')
  const [label, setLabel] = useState('')
  const [version, setVersion] = useState('unknown')
  const [view, setView] = useState<'tests' | 'precision' | 'saved'>('tests')
  useEffect(() => {
    alive.current = true
    const changed = (): void => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', changed)
    void api().version().then(v => { if (alive.current) setVersion(v) }).catch(() => undefined)
    return () => { alive.current = false; document.removeEventListener('visibilitychange', changed) }
  }, [])
  useEffect(() => {
    if (!visible || paused) { setActive(false); return }
    const id = crypto.randomUUID(); session.current = id
    let disposed = false
    const off = api().on('lab:live', (v: BenchLive) => {
      if (v.id !== id || disposed) return
      setLive(v); setHistory(h => [...h.slice(-59), v.reportHz])
    })
    const readyOff = api().on('lab:ready', (v: { id: string }) => { if (v.id === id && !disposed) setStarted(Date.now()) })
    const start = async (): Promise<void> => {
      try { await api().benchStart(id); if (!disposed) { setActive(true); setError('') } }
      catch (e) { if (!disposed) { setActive(false); setError((e as Error).message) } }
    }
    void start()
    const timer = window.setInterval(() => {
      void api().benchRenew(id).catch(() => { if (!disposed) void start() })
    }, 1000)
    return () => {
      disposed = true; if (session.current === id) session.current = null
      off(); readyOff(); window.clearInterval(timer); void api().benchStop(id).catch(() => undefined)
      setTask(''); setStarted(null)
    }
  }, [visible, paused, connected])
  useEffect(() => {
    if (started === null) { setElapsed(0); return }
    const timer = window.setInterval(() => setElapsed((Date.now() - started) / 1000), 100)
    return () => window.clearInterval(timer)
  }, [started])
  async function measure(kind: Result['kind']): Promise<void> {
    const id = session.current
    if (!id || task) return
    const metadata = { device, connection, firmware: info?.firmware ?? 'unknown', receiver: info?.dongle ?? 'unknown', appVersion: version, editedProfile: profile, targetHz }
    setError(''); setTask(kind); setStarted(kind === 'xinput' ? null : Date.now())
    try {
      const result: Result = kind === 'vendor' ? { kind, data: await api().benchCapture(id, mode, seconds) } :
        kind === 'xinput' ? { kind, data: await api().benchXInput(id, slot!, seconds) } : { kind, data: await api().benchPing(id) }
      if (session.current !== id || !alive.current) return
      const date = new Date().toISOString()
      const title = kind === 'vendor' ? guidance[result.kind === 'vendor' ? result.data.mode : mode].name : kind === 'xinput' ? `XInput slot ${slot}` : 'Command round trip'
      const name = `${title} · ${new Date().toLocaleTimeString()}`
      setRun({ schema: 1, id: crypto.randomUUID(), label: name, date, ...metadata, result, summary: summarize(result) }); setLabel(name)
    } catch (e) { if (session.current === id && alive.current) setError((e as Error).message) }
    finally { if (session.current === id && alive.current) { setTask(''); setStarted(null) } }
  }
  async function scan(): Promise<void> {
    const id = session.current
    setScanning(true); setError('')
    try {
      const found = await api().listXInput()
      if (session.current !== id || !alive.current) return
      setSlots(found); setSlot(current => found.some(s => s.slot === current) ? current : null)
    } catch (e) { if (session.current === id && alive.current) setError((e as Error).message) }
    finally { if (alive.current) setScanning(false) }
  }
  function save(): void {
    if (!run) return
    const next = [{ ...run, label: label.trim().slice(0, 100) || run.label }, ...saved.filter(s => s.id !== run.id)].slice(0, 8)
    try {
      const text = JSON.stringify(next)
      if (text.length > 4000000) throw new Error('Saved captures are full. Remove an older capture first.')
      localStorage.setItem(STORAGE, text); setSaved(next)
    } catch (e) { setError((e as Error).message) }
  }
  const base = saved.find(s => s.id === baseline)
  const compatible = !!base && !!run && base.result.kind === run.result.kind && (run.result.kind !== 'vendor' || base.result.kind === 'vendor' && base.result.data?.mode === run.result.data.mode) &&
    (run.result.kind !== 'xinput' || base.result.kind === 'xinput' && base.result.data?.slot === run.result.data.slot)
  const capture = run?.result.kind === 'vendor' ? run.result.data : null
  const native = run?.result.kind === 'xinput' ? run.result.data : null
  const disabled = !active || !!task || scanning
  return <div className="stack" style={{ gap: 16 }}>
    <div className="card"><div className="row spread"><h3>Performance bench</h3><button className="btn sm ghost" onClick={() => setPaused(p => !p)}>{paused ? 'Resume bench' : 'Pause bench'}</button></div>
      <p className="hint">{context}</p><div className="row wrap" style={{ gap: 8 }}>
        <span className="pill">Edited profile: {targetHz.toLocaleString()} Hz · {number(1000 / targetHz, 3)} ms target</span>
        <span className="pill">Vendor reports: {number(live?.reportHz, 0)} /s</span><span className="pill">{live?.reports.toLocaleString() ?? '0'} live reports</span>
        <span className="pill">{active && visible && !paused ? 'Collecting while Lab is visible' : 'Bench stopped'}</span>
      </div>
      <details className="disclosure"><summary>Live report timing and measurement limits</summary><svg viewBox="0 0 600 65" style={{ width: '100%', height: 65, marginTop: 12 }} role="img" aria-label="Last 60 seconds of vendor report rate"><polyline fill="none" stroke="#48d7bd" strokeWidth="2" points={history.map((v, i) => `${i / 59 * 600},${63 - v / Math.max(1, ...history) * 60}`).join(' ')} /></svg>
      <Help title="Report-rate measurement">The vendor stream is a separate channel and may run at 250–500 reports/s while the game-facing path runs faster. The profile setting above is a target, not proof of delivered USB polling. The XInput test below measures host-observed state changes while you move the sticks.</Help>
      <Timing value={live?.intervals ?? null} title="Live vendor report spacing" /></details>
    </div>
    {!!error && <p className="note bad" role="alert">{error}</p>}
    <div className="segmented" role="group" aria-label="Bench section">{([['tests','Timing & captures'],['precision','Bit-depth verification'],['saved','Saved comparisons']] as const).map(([id, label]) => <button type="button" key={id} disabled={!!task} aria-pressed={view === id} className={view === id ? 'selected' : ''} onClick={() => setView(id)}>{label}</button>)}</div>
    <div hidden={view !== 'tests'}><div className="card"><h3>Capture a test</h3><div className="row wrap" style={{ gap: 8 }}>
      <label>Test <select className="input" value={mode} disabled={disabled} onChange={e => setMode(e.target.value as BenchMode)}>{Object.entries(guidance).map(([id, g]) => <option key={id} value={id}>{g.name}</option>)}</select></label>
      <label>Duration <select className="input" value={seconds} disabled={disabled} onChange={e => setSeconds(Number(e.target.value))}>{[5, 10, 30].map(s => <option key={s} value={s}>{s} seconds</option>)}</select></label>
      <button className="btn primary" disabled={disabled || !connected} onClick={() => void measure('vendor')}>Capture vendor test</button>
      <button className="btn" disabled={disabled || !connected} onClick={() => void measure('roundtrip')}>30 command round trips</button>
      {!!task && task !== 'bit-setting' && task !== 'bit-check' && task !== 'bit-scan' && <button className="btn" onClick={() => { if (session.current) void api().benchCancel(session.current).catch(e => setError(e.message)) }}>Cancel test</button>}
    </div><p className="hint">{guidance[mode].text}</p>
      <div className="context-help"><Help title="Capture a test">Repeated values at rest do not establish a low sensor rate. Command round trips use a read-only profile query. They include application, Windows, transport and firmware time; they are not button-to-game latency or isolated USB latency.</Help></div>
      <h3>Game-facing XInput timing</h3><div className="row wrap" style={{ gap: 8 }}>
        <button className="btn" disabled={disabled} onClick={() => void scan()}>{scanning ? 'Finding controllers…' : 'Find XInput controllers'}</button>
        <select className="input" aria-label="XInput controller" value={slot ?? ''} disabled={disabled} onChange={e => setSlot(e.target.value === '' ? null : Number(e.target.value))}>
          <option value="">Identify your controller first</option>{slots.map(s => <option key={s.slot} value={s.slot}>Slot {s.slot} · L {s.lx},{s.ly} · R {s.rx},{s.ry}</option>)}
        </select><button className="btn primary" disabled={disabled || slot === null} onClick={() => void measure('xinput')}>Run fast XInput test</button>
      </div><div className="context-help"><Help title="Capture a test">Move a stick and rescan to identify the correct slot; other devices can occupy slots. During the test, circle both sticks continuously. A dedicated high-resolution reader targets 40,000 queries/s and can use one CPU core briefly. Its achieved query rate is reported separately from state-change rate. Cached states, driver behavior and scheduling can hide updates.</Help></div>
      {!!task && <p className="note" role="status">{task === 'xinput' && started === null ? 'Preparing native XInput reader…' : `Measuring ${task} · ${number(elapsed, 1)} s${task !== 'roundtrip' ? ` / ${seconds} s` : ''}.`} Leaving Lab, pausing, minimizing or closing to tray cancels the test.</p>}

    </div>
    </div><div hidden={view !== 'precision'}><BitDepthBench session={() => session.current} disabled={disabled} available={precisionAvailable} identity={identity} profileSlot={profile} context={{ appVersion: version, device, connection, firmware: info?.firmware ?? 'unknown', receiver: info?.dongle ?? 'unknown', targetHz }} task={task} setTask={setTask} reload={reload} /></div>
    {task === 'bit-capture' && <button className="btn" onClick={() => { if (session.current) void api().benchCancel(session.current).catch(e => setError(e.message)) }}>Cancel bit-depth capture</button>}
    <div hidden={view !== 'tests'}>
    {run && <div className="card"><h3>Latest result: {run.label}</h3><p className="hint">{run.device} · {run.connection} · controller {run.firmware} · receiver {run.receiver} · edited P{run.editedProfile} target {run.targetHz.toLocaleString()} Hz.</p>
      {capture && <><div className="row wrap" style={{ gap: 8 }}><span className="pill">{number(capture.reportHz, 1)} vendor reports/s</span><span className="pill">{number(capture.changedHz, 1)} axis/trigger changes/s</span><span className="pill">{number(capture.repeatedPercent, 1)}% repeated axis/trigger values</span></div>
        {capture.limited && <p className="note warn">Capture reached its sample limit and ended early.</p>}
        <Timing value={capture.intervals} title="Captured vendor report spacing" />
        <Trace capture={capture} />
        <table className="tbl"><thead><tr><th>Axis</th><th>Min</th><th>Max</th><th>Mean</th><th>{capture.mode === 'rest' ? 'RMS noise' : 'Variation RMS'}</th><th>Distinct values</th><th>Smallest observed step</th></tr></thead><tbody>
          {capture.axes.map((a, i) => <tr key={i}><td>{['LX', 'LY', 'RX', 'RY'][i]}</td><td>{percentage(a.min)}</td><td>{percentage(a.max)}</td><td>{percentage(a.mean)}</td><td>{percentage(a.rmsNoise)}</td><td>{a.unique}</td><td>{percentage(a.smallestStep)}</td></tr>)}
        </tbody></table><div className="context-help"><Help title="Latest result:">Measurement captures do not change settings; bit-depth settings change only with Apply. Original-axis values. Distinct values and smallest steps describe this capture; they do not prove ADC bit depth. Noise and center offset are meaningful only with untouched sticks.</Help></div>
        {capture.mode === 'rest' && <><div className="row wrap" style={{ gap: 8 }}>{capture.sticks.map((s, i) => <span key={i} className="pill">{i ? 'Right' : 'Left'} center offset {percentage(s.centerOffset)} · radial RMS noise {percentage(s.rmsNoise)}</span>)}</div>
          <div className="two">{[0, 1].map(side => {
            const x = capture.axes[side * 2], y = capture.axes[side * 2 + 1]
            const scale = Math.max(.005, Math.abs(x.min), Math.abs(x.max), Math.abs(y.min), Math.abs(y.max)) * 1.15
            return <div key={side}><h3><KeyIcon value={side ? 8 : 7} /> {side ? 'Right' : 'Left'} center scatter</h3><svg viewBox="0 0 240 240" style={{ width: '100%', maxHeight: 240 }} role="img" aria-label={`${side ? 'Right' : 'Left'} center noise scatter`}>
              <path d="M20 120H220 M120 20V220" stroke="var(--line-2)" /><circle cx="120" cy="120" r="100" fill="none" stroke="var(--line-2)" />
              {capture.trace.map((s, i) => <circle key={i} cx={120 + s.axes[side * 2] / scale * 100} cy={120 + s.axes[side * 2 + 1] / scale * 100} r="1.6" fill="#48d7bd" opacity=".2" />)}
              <circle cx={120 + x.mean / scale * 100} cy={120 + y.mean / scale * 100} r="4" fill="#fa5369" />
            </svg><p className="hint">Zoom ±{percentage(scale)} · green samples · red average · crosshair is zero.</p></div>
          })}</div>
        </>}
        {capture.mode === 'range' && <><div className="two">{capture.sticks.map((s, side) => <div key={side}><h3><KeyIcon value={side ? 8 : 7} /> {side ? 'Right' : 'Left'} gate trace</h3><svg viewBox="0 0 240 240" style={{ width: '100%', maxHeight: 240 }} role="img" aria-label={`${side ? 'Right' : 'Left'} stick range`}><circle cx="120" cy="120" r="90" fill="none" stroke="var(--line-2)" /><path d="M10 120H230 M120 10V230" stroke="var(--line-2)" /><polyline fill="none" stroke="#48d7bd" strokeWidth=".7" points={capture.trace.map(p => `${120 + p.axes[side * 2] * 90},${120 + p.axes[side * 2 + 1] * 90}`).join(' ')} /></svg><p>Outer-angle coverage {percentage(s.angularCoverage)} · radial deviation {percentage(s.circularityError)}</p></div>)}</div><div className="context-help"><Help title="Latest result:">36 angular sectors; radial deviation compares each covered sector's furthest point to a unit circle. Requires at least 30 covered sectors. Square/raw gates may intentionally differ from a circle; this is not a hardware grade.</Help></div></>}
        {capture.mode === 'release' && <><table className="tbl"><thead><tr><th>Stick</th><th>Detected releases</th><th>Largest opposite excursion</th><th>Worst observed settling time</th></tr></thead><tbody>{capture.sticks.map((s, i) => <tr key={i}><td>{i ? 'Right' : 'Left'}</td><td>{s.releases}</td><td>{percentage(s.oppositePeak)}</td><td>{s.settleMs === null ? 'Not established' : `${number(s.settleMs, 2)} ms`}</td></tr>)}</tbody></table><div className="context-help"><Help title="Latest result:">Heuristic: reach 80%, cross below 70%, then observe 200 ms. Settling requires 50 ms continuously within a 5% center radius. The vendor cadence can miss short peaks; this is a motion trace, not physical input latency.</Help></div></>}
        {capture.mode === 'triggers' && <><table className="tbl"><thead><tr><th>Trigger</th><th>Minimum</th><th>Maximum</th><th>Distinct values</th><th>50% crossings</th></tr></thead><tbody>{capture.triggers.map((t, i) => <tr key={i}><td><KeyIcon value={i ? 20 : 19} /> {i ? 'RT' : 'LT'}</td><td>{percentage(t.min)}</td><td>{percentage(t.max)}</td><td>{t.unique}</td><td>{capture.triggerTransitions[i]}</td></tr>)}</tbody></table><div className="context-help"><Help title="Latest result:">Triggers use mapped 8-bit vendor output. Crossings describe output transitions at 50%; they do not measure mechanical actuation distance or chatter without a controlled press.</Help></div></>}
      </>}
      {native && <><div className="row wrap" style={{ gap: 8 }}><span className="pill">{number(native.changeHz, 1)} observed state changes/s</span><span className="pill">{number(native.pollHz, 0)} queries/s</span><span className="pill">{native.packetChanges.toLocaleString()} packet changes</span><span className="pill">L {number(native.stickChanges[0] * 1000 / native.durationMs, 1)} · R {number(native.stickChanges[1] * 1000 / native.durationMs, 1)} stick changes/s</span></div><Timing value={native.intervals} title="Observed XInput state-change spacing" /><Timing value={native.pollIntervals} title="Reader query spacing" /><Timing value={native.calls} title="XInput API call duration" /><Help title="XInput measurement limits">State-change rate is not USB poll rate. XInput exposes cached state and a change counter, not hardware timestamps. API call time is not controller latency. A slow reader can miss changes; a noisy stick can generate changes while untouched. Physical input-to-host latency needs an external reference or instrumented hardware.</Help></>}
      {run.result.kind === 'roundtrip' && <Timing value={run.result.data} title="ReadCurrentProfile command round-trip time" />}
      <div className="row wrap" style={{ gap: 8, marginTop: 14 }}><input className="input" aria-label="Capture name" maxLength={100} value={label} onChange={e => setLabel(e.target.value)} /><button className="btn" onClick={save}>Save comparison</button><button className="btn" onClick={() => exportRun({ ...run, label: label.trim() || run.label })}>Export JSON</button></div>
    </div>}
    </div><div hidden={view !== 'saved'}><div className="card"><div className="section-title"><h3>Saved comparisons</h3><Help title="Saved comparisons">Up to eight captures stored on this PC. Compare the same test, controller slot, connection and movement pattern. Firmware/target differences are recorded for your A/B tests.</Help></div>
      <select className="input" aria-label="Baseline capture" value={baseline} onChange={e => setBaseline(e.target.value)}><option value="">Choose a baseline</option>{saved.map(s => <option key={s.id} value={s.id}>{s.label} · {s.targetHz} Hz</option>)}</select>
      {base && run && <>{!compatible && <p className="note warn">These captures use different tests or XInput slots. Deltas are hidden.</p>}<table className="tbl"><thead><tr><th>Metric</th><th>Baseline</th><th>Latest</th><th>Difference</th></tr></thead><tbody>{([['rate', 'Observed rate /s'], ['p95', 'P95 spacing / RTT ms'], ['p99', 'P99 spacing / RTT ms'], ['jitter', 'Timing jitter ms'], ['noiseL', 'Left RMS noise %'], ['noiseR', 'Right RMS noise %'], ['offsetL', 'Left center offset %'], ['offsetR', 'Right center offset %'], ['coverageL', 'Left outer-angle coverage %'], ['coverageR', 'Right outer-angle coverage %']] as const).map(([key, name]) => <tr key={key}><td>{name}</td><td>{number(base.summary[key], 4)}</td><td>{number(run.summary[key], 4)}</td><td>{compatible && base.summary[key] != null && run.summary[key] != null ? number(run.summary[key]! - base.summary[key]!, 4) : '—'}</td></tr>)}</tbody></table><p className="hint">Baseline: {base.device} · {base.connection ?? 'connection not recorded'} · firmware {base.firmware} · target {base.targetHz} Hz.</p></>}
      {saved.map(s => <div className="row spread" key={s.id} style={{ marginTop: 8 }}><span>{s.label}</span><button className="btn sm ghost" onClick={() => { const next = saved.filter(v => v.id !== s.id); try { localStorage.setItem(STORAGE, JSON.stringify(next)); setSaved(next) } catch (e) { setError((e as Error).message) } }}>Remove</button></div>)}
    </div>
    </div>
  </div>
}
