import { IconSelect } from './IconSelect'
import { Help } from './Help'
import { KeyIcon } from './KeyIcon'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { Profile } from '@shared/profile'
import { bindingLabel, FUNCTION_LABELS, keyboardCode } from '@shared/bindings'
import { readMacro, writeMacro, validateMacro, SequenceRecorder, type MacroDocument, type MacroStep } from '@shared/macros'
import { api } from './api'
import { KeyPicker } from './Bindings'

export function Macros({ profile, edit, busy }: { profile: Profile; edit: (fn: () => void) => void; busy: boolean }): JSX.Element {
  const [layout, setLayout] = useState<'studio' | 'classic'>(() => {
    try { return localStorage.getItem('macro-editor-layout') === 'classic' ? 'classic' : 'studio' } catch { return 'studio' }
  })
  const [activeStep, setActiveStep] = useState(0)
  const [selected, setSelected] = useState(0)
  const [message, setMessage] = useState('')
  const [recordMode, setRecordMode] = useState<'keyboard' | 'controller' | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [preview, setPreview] = useState<number | null>(null)
  const [bulkHold, setBulkHold] = useState(50)
  const [bulkDelay, setBulkDelay] = useState(50)
  const [copyTarget, setCopyTarget] = useState(1)
  const record = useRef<{ id: string; mode: 'keyboard' | 'controller'; recorder: SequenceRecorder; held: Set<number>; started: number } | null>(null)
  const recordArea = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  let doc: MacroDocument
  let parseError = ''
  try { doc = readMacro(profile.functionKeys[selected]) } catch (e) {
    parseError = (e as Error).message
    doc = { version: 1, enabled: false, pressToTrigger: false, cycle: false, cycleTime: 0, steps: [] }
  }
  const duration = doc.steps.reduce((sum, s) => sum + s.hold + s.delay, 0)
  const locked = busy || !!recordMode || preview !== null || !!parseError
  function apply(next: MacroDocument): boolean {
    try {
      const valid = validateMacro(next)
      edit(() => writeMacro(profile.functionKeys[selected], valid))
      setMessage('Macro staged. Write this profile to apply it to the controller.')
      return true
    } catch (e) { setMessage((e as Error).message); return false }
  }
  function steps(next: MacroStep[]): boolean { return apply({ ...doc, steps: next, enabled: next.length ? doc.enabled : false }) }
  function stopWithError(error: string): void {
    const active = record.current
    record.current = null
    setRecordMode(null)
    if (active?.mode === 'controller') void api().cancelMacroRecording(active.id).catch(() => undefined)
    setMessage(error)
  }
  useEffect(() => {
    const off = api().on('macro:recordError', (error) => { if (record.current?.mode === 'controller') stopWithError(String(error)) })
    return () => { off(); const active = record.current; record.current = null; if (active?.mode === 'controller') void api().cancelMacroRecording(active.id).catch(() => undefined) }
  }, [])
  useEffect(() => {
    if (!recordMode) return
    const timer = window.setInterval(() => {
      if (!record.current) return
      const time = performance.now() - record.current.started
      setElapsed(time)
      if (time >= 30000) stopWithError('Recording stopped at 30 seconds. Previous macro kept; record a shorter sequence.')
    }, 100)
    return () => window.clearInterval(timer)
  }, [recordMode])
  useEffect(() => {
    if (preview === null) return
    const started = performance.now()
    const timer = window.setInterval(() => {
      const time = performance.now() - started
      if (time >= duration) { setPreview(null); setMessage('Preview finished. No keyboard, mouse or controller input was sent.') }
      else setPreview(time)
    }, 25)
    return () => window.clearInterval(timer)
  }, [preview === null, duration])
  async function startRecording(mode: 'keyboard' | 'controller'): Promise<void> {
    if (locked || record.current) return
    const active = { id: crypto.randomUUID(), mode, recorder: new SequenceRecorder(), held: new Set<number>(), started: performance.now() }
    record.current = active
    setRecordMode(mode)
    setElapsed(0)
    try {
      if (mode === 'controller') await api().startMacroRecording(active.id)
      if (record.current !== active) { if (mode === 'controller') void api().cancelMacroRecording(active.id); return }
      active.started = performance.now()
      setMessage('Recording one key at a time. Stop recording to replace the current steps; Cancel keeps them.')
      if (mode === 'keyboard') window.setTimeout(() => recordArea.current?.focus(), 0)
    } catch (e) { stopWithError((e as Error).message) }
  }
  async function finishRecording(): Promise<void> {
    const active = record.current
    if (!active) return
    try {
      const captured = active.mode === 'controller' ? await api().stopMacroRecording(active.id) : active.recorder.finish(performance.now())
      if (record.current !== active) return
      record.current = null
      setRecordMode(null)
      if (!captured.length) { setMessage('No keys captured. Previous macro kept.'); return }
      apply({ ...doc, enabled: true, steps: captured })
    } catch (e) { stopWithError((e as Error).message) }
  }
  function keyEvent(event: KeyboardEvent<HTMLDivElement>, down: boolean): void {
    const active = record.current
    if (!active || active.mode !== 'keyboard') return
    event.preventDefault()
    event.stopPropagation()
    const code = keyboardCode(event.code)
    if (code === undefined) { stopWithError(`This key is not in the controller’s supported key catalog (${event.code}).`); return }
    if (event.repeat) return
    if (down) active.held.add(code); else active.held.delete(code)
    try { active.recorder.push([...active.held], performance.now()) } catch (e) { stopWithError((e as Error).message) }
  }
  function move(index: number, direction: number): boolean {
    const next = doc.steps.map((s) => ({ ...s }))
    ;[next[index], next[index + direction]] = [next[index + direction], next[index]]
    return steps(next)
  }
  useEffect(() => { setActiveStep(0) }, [selected])
  useEffect(() => { setActiveStep(i => Math.min(i, Math.max(0, doc.steps.length - 1))) }, [doc.steps.length])
  const current = doc.steps[activeStep]
  function changeLayout(next: 'studio' | 'classic'): void {
    setLayout(next)
    try { localStorage.setItem('macro-editor-layout', next) } catch { /* Session preference still works. */ }
  }
  let timelineAt = 0
  return <div className="stack" style={{ gap: 16 }}>
    <div className="card">
      <div className="macro-page-heading"><div className="section-title"><h3>Macros</h3><Help title="Macros">Build a sequence for FL1, FR1, FL2 or FR2. Record controller buttons or keyboard keys, edit timings, reorder or duplicate steps, and save reusable files. Up to 32 sequential steps; each hold and delay is 0–65,535 ms. Playback on the controller starts from its assigned physical button after you write the profile. Timeline preview only animates this page. Automated gameplay may break game rules; no ban-safe claim is made. Enabling a macro clears this button’s normal mapping, turbo and toggle to avoid conflicting outputs. Disabling it keeps the steps for later editing.</Help></div><div className="macro-layout-switch" role="group" aria-label="Macro editor layout">
        {(['studio', 'classic'] as const).map(view => <button key={view} className={`btn sm ${layout === view ? '' : 'ghost'}`} aria-pressed={layout === view} disabled={!!recordMode || preview !== null} onClick={() => changeLayout(view)}>{view === 'studio' ? 'Studio' : 'Classic'}</button>)}
      </div></div>
    </div>
    <div className="card">
      <label className="stack">Macro button
        <IconSelect label="Macro button" disabled={busy || !!recordMode || preview !== null} value={selected} onChange={v => { setSelected(v); setMessage('') }} options={FUNCTION_LABELS.map((name, i) => ({ value: i, label: name, icon: i % 2 ? 18 : 17, tag: ['L4', 'R4', 'L5', 'R5'][i] }))} />
      </label>
      {parseError && <p className="note warn">{parseError}. Re-read the profile; its macro bytes have not been changed.</p>}
      <fieldset disabled={locked} className="control-fieldset">
        <div className="row wrap" style={{ gap: 16, marginTop: 16 }}>
          <label><input type="checkbox" checked={doc.enabled} onChange={(e) => apply({ ...doc, enabled: e.target.checked })} /> Enable macro</label>
          <label><input type="checkbox" checked={doc.pressToTrigger} onChange={(e) => apply({ ...doc, pressToTrigger: e.target.checked })} /> Press to trigger (Connect option)</label>
          <label><input type="checkbox" checked={doc.cycle} onChange={(e) => apply({ ...doc, cycle: e.target.checked })} /> Loop</label>
          <label>Loop delay (ms) <input className="input compact" type="number" min={0} max={65535} value={doc.cycleTime} onChange={(e) => apply({ ...doc, cycleTime: Number(e.target.value) })} /></label>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn" onClick={() => void startRecording('controller')}>Record controller</button>
          <button className="btn" onClick={() => void startRecording('keyboard')}>Record keyboard</button>
          <button className="btn ghost" disabled={!doc.steps.length || duration === 0} onClick={() => { setPreview(0); setMessage('Timeline preview only — no inputs are sent.') }}>Preview timeline</button>
          <button className="btn ghost" onClick={() => fileInput.current?.click()}>Import macro</button>
          <button className="btn ghost" onClick={() => {
            try {
              const blob = new Blob([JSON.stringify(validateMacro(doc), null, 2)], { type: 'application/json' })
              const url = URL.createObjectURL(blob)
              const link = document.createElement('a'); link.href = url; link.download = `Stick-Abuse-Limited-${FUNCTION_LABELS[selected]}-macro.json`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000)
            } catch (e) { setMessage((e as Error).message) }
          }}>Export macro</button>
        </div>
        <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(e) => {
          const file = e.target.files?.[0]; e.target.value = ''
          if (!file) return
          if (file.size > 131072) { setMessage('Macro file is too large.'); return }
          const destination = selected
          void file.text().then((text) => {
            const imported = validateMacro(JSON.parse(text))
            edit(() => writeMacro(profile.functionKeys[destination], imported))
            setMessage(`Macro imported into ${FUNCTION_LABELS[destination]}; write the profile to apply.`)
          }).catch((err) => setMessage((err as Error).message))
        }} />
      </fieldset>
      {recordMode && <div className="note" style={{ marginTop: 16 }}>
        <strong>Recording {recordMode} · {(elapsed / 1000).toFixed(1)} s</strong>
        <p>One key at a time. Overlapping keys are rejected; simultaneous combinations belong in Keybindings. Stop replaces the current steps; Cancel keeps them.</p>
        <div className="row" style={{ gap: 8 }}><button className="btn" onClick={() => void finishRecording()}>Stop recording</button><button className="btn ghost" onClick={() => stopWithError('Recording cancelled. Previous macro kept.')}>Cancel</button></div>
      </div>}
      <div ref={recordArea} className={`keyboard-record-area${recordMode === 'keyboard' ? ' recording' : ''}`} tabIndex={0} onKeyDown={(e) => keyEvent(e, true)} onKeyUp={(e) => keyEvent(e, false)} onBlur={() => { if (record.current?.mode === 'keyboard' && record.current.held.size) stopWithError('Keyboard focus changed while a key was held. Recording discarded.') }}>
        {recordMode === 'keyboard' ? 'Type here to record. Only this focused area records keys; click Stop when finished.' : 'Keyboard recording uses this focused area only. It does not monitor other apps.'}
      </div>
      {preview !== null && <button className="btn ghost" onClick={() => setPreview(null)}>Stop preview</button>}
    </div>
    <div className="card">
      <div className="row spread"><h3>Sequence · {doc.steps.length} / 32 steps</h3><span className="mono">{duration.toLocaleString()} ms · one pass</span></div>
      <div className="macro-timeline" aria-label="Macro timeline">
        {doc.steps.map((s, i) => {
          const start = timelineAt; timelineAt += s.hold + s.delay
          const active = preview !== null && preview >= start && preview < timelineAt
          return <span key={i} className={`macro-segment${active ? ' active' : ''}`} style={{ flexGrow: Math.max(1, s.hold + s.delay) }} title={`${i + 1}: ${bindingLabel(s.data)} · hold ${s.hold} ms · delay ${s.delay} ms`}>{i + 1}</span>
        })}
        {!doc.steps.length && <span className="hint">Add a step or record a sequence to begin.</span>}
      </div>
      <fieldset className="control-fieldset" disabled={locked}>
        {layout === 'studio' && <div className="macro-studio">
          <div className="macro-event-pane">
            <div className="macro-pane-heading"><strong>Event sequence</strong><span>{doc.steps.length} / 32</span></div>
            <div className="macro-event-list" role="group" aria-label="Macro steps">
              {doc.steps.map((step, i) => <button key={i} className={`macro-event${i === activeStep ? ' selected' : ''}`} aria-pressed={i === activeStep} onClick={() => setActiveStep(i)}>
                <span className="macro-event-number">{String(i + 1).padStart(2, '0')}</span><KeyIcon value={step.data} />
                <span className="macro-event-name">{bindingLabel(step.data)}<small>Hold {step.hold} ms</small></span>
                <span className="macro-event-delay">+ {step.delay} ms<small>wait</small></span>
              </button>)}
              {!doc.steps.length && <div className="macro-empty">No events yet<span>Record a sequence or add your first step.</span></div>}
            </div>
          </div>
          <div className="macro-inspector">
            <div className="macro-pane-heading"><strong>{current ? `Step ${activeStep + 1}` : 'Step editor'}</strong><Help title="Step timing">Hold is how long the output stays pressed. Delay is the wait after releasing it, before the next step. Steps run sequentially. Timeline preview sends no inputs.</Help></div>
            {current ? <>
              <label className="stack">Output<KeyPicker empty={false} label={`Step ${activeStep + 1} output`} value={current.data} onChange={data => steps(doc.steps.map((s, i) => i === activeStep ? { ...s, data } : s))} /></label>
              <div className="macro-timing-fields">{(['hold', 'delay'] as const).map(field => <label key={field}>{field === 'hold' ? 'Hold' : 'Delay'}<div><input className="input" aria-label={`Step ${activeStep + 1} ${field}`} type="number" min={0} max={65535} disabled={field === 'delay' && activeStep === 31} value={current[field]} onChange={e => steps(doc.steps.map((s, i) => i === activeStep ? { ...s, [field]: Number(e.target.value) } : s))} /><span>ms</span></div></label>)}</div>
              <div className="macro-step-actions">
                <button className="btn sm ghost" disabled={activeStep === 0} onClick={() => { if (move(activeStep, -1)) setActiveStep(activeStep - 1) }}>Move up</button>
                <button className="btn sm ghost" disabled={activeStep === doc.steps.length - 1} onClick={() => { if (move(activeStep, 1)) setActiveStep(activeStep + 1) }}>Move down</button>
                <button className="btn sm ghost" disabled={doc.steps.length >= 32} onClick={() => steps([...doc.steps.slice(0, activeStep + 1), { ...current }, ...doc.steps.slice(activeStep + 1)])}>Duplicate</button>
                <button className="btn sm ghost" disabled={doc.steps.length >= 32} onClick={() => steps([...doc.steps.slice(0, activeStep), { data: 9, hold: 50, delay: 0 }, ...doc.steps.slice(activeStep)])}>Insert before</button>
                <button className="btn sm ghost" onClick={() => steps(doc.steps.filter((_, i) => i !== activeStep))}>Delete step</button>
              </div>
            </> : <p className="hint">Select an event to edit its output and timing.</p>}
          </div>
        </div>}
        {layout === 'classic' && <div className="macro-table-wrap"><table className="macro-table"><thead><tr><th>Step</th><th>Output</th><th>Hold (ms)</th><th>Delay (ms)</th><th>Edit</th></tr></thead><tbody>
          {doc.steps.map((s, i) => <tr key={i}>
            <td>{i + 1}</td>
            <td><KeyPicker empty={false} label={`Step ${i + 1} output`} value={s.data} onChange={(data) => steps(doc.steps.map((v, j) => j === i ? { ...v, data } : v))} /></td>
            {(['hold', 'delay'] as const).map((field) => <td key={field}><input className="input compact" aria-label={`Step ${i + 1} ${field}`} type="number" min={0} max={65535} disabled={field === 'delay' && i === 31} value={s[field]} onChange={(e) => steps(doc.steps.map((v, j) => j === i ? { ...v, [field]: Number(e.target.value) } : v))} /></td>)}
            <td><div className="row" style={{ gap: 4 }}>
              <button className="btn sm ghost" aria-label={`Move step ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
              <button className="btn sm ghost" aria-label={`Move step ${i + 1} down`} disabled={i === doc.steps.length - 1} onClick={() => move(i, 1)}>↓</button>
              <button className="btn sm ghost" disabled={doc.steps.length >= 32} onClick={() => steps([...doc.steps.slice(0, i + 1), { ...s }, ...doc.steps.slice(i + 1)])}>Duplicate</button>
              <button className="btn sm ghost" disabled={doc.steps.length >= 32} onClick={() => steps([...doc.steps.slice(0, i), { data: 9, hold: 50, delay: 0 }, ...doc.steps.slice(i)])}>Insert</button>
              <button className="btn sm ghost" aria-label={`Delete step ${i + 1}`} onClick={() => steps(doc.steps.filter((_, j) => j !== i))}>×</button>
            </div></td>
          </tr>)}
        </tbody></table></div>}
        <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
          <button className="btn" disabled={doc.steps.length >= 32} onClick={() => steps([...doc.steps, { data: 9, hold: 50, delay: 0 }])}>Add step</button>
          <button className="btn ghost" disabled={!doc.steps.length} onClick={() => steps([])}>Clear steps</button>
        </div>
        <div className="row wrap" style={{ gap: 8, marginTop: 16 }}>
          <label>Hold <input className="input compact" type="number" min={0} max={65535} value={bulkHold} onChange={(e) => setBulkHold(Number(e.target.value))} /></label>
          <button className="btn sm ghost" onClick={() => steps(doc.steps.map((s) => ({ ...s, hold: bulkHold })))}>Apply hold to all</button>
          <label>Delay <input className="input compact" type="number" min={0} max={65535} value={bulkDelay} onChange={(e) => setBulkDelay(Number(e.target.value))} /></label>
          <button className="btn sm ghost" onClick={() => steps(doc.steps.map((s, i) => ({ ...s, delay: i === 31 ? 0 : bulkDelay })))}>Apply delay to all</button>
        </div>
        <div className="context-help"><Help title="How this works">Step 32 has no trailing-delay field in the controller format. Use Loop delay for the gap between repeated sequences. Reordering that would lose a delay is rejected.</Help></div>
        <div className="row wrap" style={{ gap: 8 }}>
          <label>Copy to <IconSelect label="Copy macro to" value={copyTarget} onChange={setCopyTarget} options={FUNCTION_LABELS.map((name, i) => ({ value: i, label: name, icon: i % 2 ? 18 : 17, tag: ['L4', 'R4', 'L5', 'R5'][i] }))} /></label>
          <button className="btn ghost" disabled={selected === copyTarget} onClick={() => {
            try { const valid = validateMacro(doc); edit(() => writeMacro(profile.functionKeys[copyTarget], valid)); setMessage(`Copied to ${FUNCTION_LABELS[copyTarget]}. Write the profile to apply.`) } catch (e) { setMessage((e as Error).message) }
          }}>Copy macro</button>
        </div>
      </fieldset>
    </div>
    {message && <p className="note" role="status">{message}</p>}
  </div>
}
