import { GyroPreview, TriggerPreview } from './TuningPreviews'
import { RangeControl } from './RangeControl'
import { IconSelect } from './IconSelect'
import { KeyIcon } from './KeyIcon'
import { useState } from 'react'
import { type Packet, type Profile, motion, fun } from '@shared/profile'
import { bounded, curvePoints, setCustomCurve, setHair, setMotionActivation, setPercent, setWindow } from '@shared/tuning'
import { KeyPicker } from './Bindings'
import { SectionTitle } from './Help'

type Props = { profile: Profile; edit: (fn: () => void) => void; busy: boolean }
function NumberField({ label, value, max = 100, step = 1, change }: { label: string; value: number; max?: number; step?: number; change: (v: number) => void }): JSX.Element {
  return <label className="stack">{label}<input className="input" type="number" min={0} max={max} step={step} value={value} onChange={(e) => { if (e.target.value !== '') change(Number(e.target.value)) }} /></label>
}
function WindowControls({ p, start, enabled, change }: { p: Packet; start: number; enabled: number; change: (fn: () => void) => void }): JSX.Element {
  const values = Array.from({ length: 4 }, (_, i) => p.u16be(start + i * 2))
  return <><SectionTitle title="Input and output range">Input minimum removes movement near rest. Input maximum sets where full travel is reached. Output minimum adds an initial output; output maximum caps it. Input minimum must stay below input maximum.</SectionTitle><label><input type="checkbox" checked={p.bit(enabled, 0)} onChange={(e) => change(() => p.setBit(enabled, 0, e.target.checked))} /> Enable deadzone and output range</label><div className="range-controls">{['Input minimum %', 'Input maximum %', 'Output minimum %', 'Output maximum %'].map((label, i) => <RangeControl key={label} label={label.replace(' %','')} step={0.1} value={values[i] / 10} min={i===1?(values[0]+1)/10:i===3?values[2]/10:0} max={i===0?(values[1]-1)/10:i===2?values[3]/10:100} onChange={(v) => change(() => { const next = [...values]; next[i] = Math.round(v * 10); setWindow(p, start, next) })} />)}</div></>
}
function CurveControls({ p, offset, change }: { p: Packet; offset: number; change: (fn: () => void) => void }): JSX.Element {
  const points = curvePoints(p, offset)
  return <><SectionTitle title="Response curve">Maps input movement to output. Custom points use the input range above; endpoints stay at 0 and 100%. Editing a point enables the curve.</SectionTitle><label><input type="checkbox" checked={p.bit(offset - 3, 0)} onChange={(e) => change(() => p.setBit(offset - 3, 0, e.target.checked))} /> Enable curve</label><svg viewBox="0 0 260 110" style={{ width: '100%', height: 160 }} aria-label="Response curve"><path d="M2 2V108H258" fill="none" stroke="var(--line-2)" /><polyline points={points.map((v) => `${2 + v.x},${108 - v.y * 106 / 255}`).join(' ')} stroke="var(--accent)" fill="none" strokeWidth="2" /></svg><div className="control-grid">{points.slice(1, 4).map((point, i) => <div key={i}><NumberField label={`Point ${i + 1} input %`} step={0.1} value={Math.round(point.x / 255 * 1000) / 10} change={(v) => change(() => { const next = points.map((pt) => ({ ...pt })); next[i + 1].x = Math.round(v * 255 / 100); setCustomCurve(p, offset, next) })} /><NumberField label={`Point ${i + 1} output %`} step={0.1} value={Math.round(point.y / 255 * 1000) / 10} change={(v) => change(() => { const next = points.map((pt) => ({ ...pt })); next[i + 1].y = Math.round(v * 255 / 100); setCustomCurve(p, offset, next) })} /></div>)}</div><button className="btn" onClick={() => change(() => { setCustomCurve(p, offset, [0, 64, 128, 191, 255].map((v) => ({ x: v, y: v }))); p.setU8(offset - 2, 0); p.setU8(offset - 1, 50) })}>Linear curve</button></>
}
export function TriggerTuning({ profile, edit, busy, side: sharedSide }: Props & { side?: number }): JSX.Element {
  const [localSide, setSide] = useState(0), [error, setError] = useState('')
  const side = sharedSide ?? localSide
  const p = profile.triggers[side]
  function change(fn: () => void): void { try { edit(fn); setError('') } catch (e) { setError((e as Error).message) } }
  const status = p.u8(16), mode = status & 128 ? status & 1 ? 1 : 2 : 0
  return <div className="stack tuning-page"><div className="card"><SectionTitle title="Trigger tuning">LT and RT have independent ranges, curves and hair-trigger settings. Use Write to controller to apply edits. Trigger button assignments and turbo are on Keybindings. Live output is the controller’s mapped result, not physical trigger position.</SectionTitle>
    {sharedSide === undefined && <div className="segmented" role="group" aria-label="Trigger selection">{['Left trigger', 'Right trigger'].map((label, i) => <button type="button" disabled={busy} aria-pressed={side === i} className={side === i ? 'selected' : ''} key={label} onClick={() => setSide(i)}><KeyIcon value={i ? 20 : 19} /> {label}<small>{i ? 'RT / R2' : 'LT / L2'}</small></button>)}</div>}
    <div className="row spread"><button className="btn ghost" disabled={busy} onClick={() => change(() => { setWindow(p, 3, [0, 1000, 0, 1000]); p.setBit(2, 0, true); setHair(p, 0, 0, 100); setCustomCurve(p, 22, [0, 64, 128, 191, 255].map(v => ({ x: v, y: v }))); p.setU8(20, 0); p.setU8(21, 50) })}>Reset this trigger’s tuning</button></div>
  </div><TriggerPreview side={side} range={p.bit(2,0)?{begin:p.u16be(3),end:p.u16be(5),beginAnti:p.u16be(7),endAnti:p.u16be(9)}:{begin:0,end:1000,beginAnti:0,endAnti:1000}} />{error && <p className="note bad" role="alert">{error}</p>}<fieldset className="control-fieldset" disabled={busy}><div className="settings-grid">
    <section className="card"><WindowControls p={p} start={3} enabled={2} change={change} /></section>
    <section className="card"><SectionTitle title="Hair trigger">Off keeps analog travel. Adaptive and Fixed select the firmware’s hair-trigger modes. Thresholds control their activation window; behavior depends on firmware.</SectionTitle>
      <label className="stack">Hair-trigger mode<select className="input" value={mode} onChange={e => change(() => setHair(p, Number(e.target.value), p.u8(17), p.u8(18)))}><option value={0}>Off</option><option value={1}>Adaptive</option><option value={2}>Fixed</option></select></label>
      <fieldset className="control-fieldset" disabled={mode === 0}><div className="control-grid">{[17, 18].map((offset, i) => <NumberField key={offset} label={i ? 'End threshold %' : 'Start threshold %'} value={p.u8(offset)} change={v => change(() => setHair(p, mode, i ? p.u8(17) : v, i ? v : p.u8(18)))} />)}</div></fieldset>
    </section><section className="card"><CurveControls p={p} offset={22} change={change} /></section>
  </div></fieldset></div>
}
export function GyroTuning({ profile, edit, busy }: Props): JSX.Element {
  const [side, setSide] = useState(0), [error, setError] = useState('')
  const p = profile.motion[side], activation = p.u8(0), output = p.u8(33)
  function change(fn: () => void): void { try { edit(fn); setError('') } catch (e) { setError((e as Error).message) } }
  const percent = (offset: number, label: string): JSX.Element => <NumberField key={offset} label={label} value={p.u8(offset)} change={(v) => change(() => setPercent(p, offset, v))} />
  return <div className="stack tuning-page">
    <div className="card"><SectionTitle title="Gyro tuning">Aim and Tilt are separate firmware configurations. Enabling one disables the other without deleting its settings. Support depends on firmware and connection mode. Changes apply with Write to controller.</SectionTitle>
      <div className="segmented" role="group" aria-label="Motion configuration">{['Tilt', 'Aim'].map((label, i) => <button type="button" disabled={busy} aria-pressed={side === i} key={label} className={side === i ? 'selected' : ''} onClick={() => setSide(i)}>{label}<small>{i ? 'Aim configuration' : 'Tilt configuration'}</small></button>)}</div>
      <p className="hint">Editing {side ? 'Aim' : 'Tilt'} · {['Off', 'Hold combination', 'Toggle combination', 'Always on'][activation] ?? 'Stored activation'} · write to apply</p>
    </div>
    <GyroPreview />
    {error && <p className="note bad" role="alert">{error}</p>}
    <fieldset className="control-fieldset" disabled={busy}><div className="settings-grid">
      <section className="card"><SectionTitle title="1. Activation">Off disables this configuration. Hold requires the chosen combination to remain pressed. Toggle switches it on and off with the combination. Always on needs no activation keys.</SectionTitle>
        <label className="stack">When motion is active<select className="input" value={activation} onChange={e => change(() => setMotionActivation(profile.motion, side, Number(e.target.value)))}>
          {![0,1,2,3].includes(activation) && <option value={activation}>Stored activation {activation}</option>}
          {['Off', 'Hold button combination', 'Toggle with button combination', 'Always on'].map((label, i) => <option key={label} value={i}>{label}</option>)}
        </select></label>
        {(activation === 1 || activation === 2) && <div className="control-grid">{motion.triggerKeys(p).map((value, i) => <label className="stack" key={i}>Combination key {i + 1}<KeyPicker label={'Activation key ' + (i + 1)} value={value} onChange={v => change(() => { const keys = motion.triggerKeys(p); keys[i] = v; motion.setTriggerKeys(p, keys) })} /></label>)}</div>}
        <SectionTitle title="Sensor mode · shared">Precision and High speed are the firmware’s sensor presets. This selection applies to both Aim and Tilt; it does not establish a measured sampling rate.</SectionTitle>
        <label className="stack">Sensor preset<select className="input" value={fun.extend.sensorQuickMode(profile.funData)} onChange={e => change(() => fun.extend.setSensorQuickMode(profile.funData, bounded(Number(e.target.value), 1)))}>
          {![0,1].includes(fun.extend.sensorQuickMode(profile.funData)) && <option value={fun.extend.sensorQuickMode(profile.funData)}>Stored mode {fun.extend.sensorQuickMode(profile.funData)}</option>}
          <option value={0}>Precision</option><option value={1}>High speed</option>
        </select></label>
      </section>
      <section className="card"><SectionTitle title="2. Output mapping">Converts motion into the selected destination. Disabling mapping preserves its stored settings. Directional outputs use the key assignments below. Mouse support depends on firmware and connection mode.</SectionTitle>
        <label className="check-row"><input type="checkbox" checked={p.bit(27, 0)} onChange={e => change(() => p.setBit(27, 0, e.target.checked))} /> Enable output mapping</label>
        <fieldset className="control-fieldset" disabled={!p.bit(27, 0)}><label className="stack">Send motion to<IconSelect label="Send motion to" value={output} onChange={v => change(() => p.setU8(33, bounded(v, 4)))} disabled={!p.bit(27, 0)} options={[...(![1, 2, 3, 4].includes(output) ? [{ value: output, label: 'Stored value ' + output, icon: 0 }] : []), { value: 1, label: 'Left stick', icon: 7 }, { value: 2, label: 'Right stick', icon: 8 }, { value: 3, label: 'Directional keys / wheel', icon: 1 }, { value: 4, label: 'Mouse', icon: 200 }]} /></label>
        {output === 4 && percent(32, 'Mouse sensitivity · 50 neutral')}{(output === 1 || output === 2) && percent(40, 'Stick sensitivity · 50 neutral')}
        {output === 3 && <div className="control-grid">{['Up', 'Down', 'Left', 'Right', 'Outside deadzone'].map((label, i) => <label className="stack" key={label}>{label}<KeyPicker label={'Motion output: ' + label} value={p.u8(35 + i)} onChange={v => change(() => p.setU8(35 + i, v))} /></label>)}</div>}</fieldset>
      </section>
      <section className="card"><SectionTitle title="3. Axes and direction">Yaw turns the controller left/right; roll tilts its sides. Orientation chooses the horizontal motion source. Inversion reverses an axis. Axis balance adjusts the firmware’s relative axis weighting; 50 is neutral.</SectionTitle>
        <label className="stack">Horizontal motion<select className="input" value={motion.orientation(p)} onChange={e => change(() => motion.setOrientation(p, Number(e.target.value)))}>{['Yaw', 'Roll', 'Yaw + roll'].map((label, i) => <option key={label} value={i}>{label}</option>)}</select></label>
        <div className="stack">{[[28, 'Invert horizontal roll'], [29, 'Invert vertical'], [30, 'Invert horizontal yaw']].map(([offset, label]) => <label className="check-row" key={offset}><input type="checkbox" checked={p.bit(Number(offset), 0)} onChange={e => change(() => p.setBit(Number(offset), 0, e.target.checked))} />{label}</label>)}</div>
        {percent(31, 'Axis balance · 50 equal')}
      </section>
      <section className="card"><SectionTitle title="4. Motion response">Range controls the deadzone and output limits. The curve changes how motion grows between those limits. Reset affects only this configuration’s range and curve, preserving activation and output mapping.</SectionTitle>
        <WindowControls p={p} start={6} enabled={5} change={change} /><CurveControls p={p} offset={17} change={change} />
        <button type="button" className="btn ghost" onClick={() => change(() => { setWindow(p, 6, [0, 1000, 0, 1000]); p.setBit(5, 0, true); setCustomCurve(p, 17, [0, 64, 128, 191, 255].map(v => ({ x: v, y: v }))); p.setU8(15, 0); p.setU8(16, 50) })}>Reset range and curve</button>
      </section>
    </div></fieldset>
  </div>
}
