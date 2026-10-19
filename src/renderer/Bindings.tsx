import { virtualOutputSupported } from '@shared/virtual-controller'
import { setShiftBinding, SHIFT_KEY } from '@shared/shift'
import { IconSelect, type IconOption } from './IconSelect'
import { KeyIcon } from './KeyIcon'
import { Help } from './Help'
import { useState } from 'react'
import { button, trigger, macro, type Profile } from '@shared/profile'
import { bindingKeys, BUTTON_LABELS, functionLabels, bindingLabel, setBinding } from '@shared/bindings'

export function KeyPicker({ value, onChange, empty = true, allowShift = true, label = 'Output key', modelId = 'G7ProCE', virtualOnly = false }: { value: number; onChange: (value: number) => void; empty?: boolean; allowShift?: boolean; label?: string; modelId?: string; virtualOnly?: boolean }): JSX.Element {
  const options: IconOption[] = bindingKeys(modelId).filter(k => !virtualOnly || virtualOutputSupported(k.value)).filter(k => allowShift || k.value !== SHIFT_KEY).map(k => ({ value: k.value, label: k.label, group: k.group, tag: modelId === 'T3CE' && k.value >= 31 && k.value <= 39 ? k.label : undefined, icon: modelId === 'T3CE' && k.value >= 31 && k.value <= 39 ? 17 : undefined }))
  if (empty) options.unshift({ value: 0, label: 'Empty / original', group: '' })
  if (!options.some(o => o.value === value)) options.unshift({ value, label: bindingLabel(value, modelId), group: '' })
  return <IconSelect label={label} value={value} options={options} onChange={onChange} />
}

export function Bindings({ profile, modelId, edit, busy, shiftLayer = false }: { profile: Profile; modelId: string; edit: (fn: () => void) => void; busy: boolean; shiftLayer?: boolean }): JSX.Element {
  const [selected, setSelected] = useState(0)
  const targets = [
    ...profile.buttons.map((packet, i) => ({ packet, label: BUTTON_LABELS[i], isTrigger: false, functionKey: false })),
    ...profile.functionKeys.map((packet, i) => ({ packet, label: functionLabels(modelId)[i] ?? `Extra ${i + 1}`, isTrigger: false, functionKey: true })),
    ...profile.triggers.map((packet, i) => ({ packet, label: i === 0 ? 'LT / L2' : 'RT / R2', isTrigger: true, functionKey: false }))
  ]
  const target = targets[selected]
  const access = target.isTrigger ? trigger : button
  const values = access.mapValues(target.packet)
  const mapped = access.mapped(target.packet)
  const isShift = mapped && values.includes(SHIFT_KEY)
  const hasMacro = target.functionKey && macro.macroEnabled(target.packet)
  return <div className="stack" style={{ gap: 16 }}>
    <div className="card">
      <div className="section-title"><h3>Keybindings</h3><Help title="Keybindings">Map a controller button to another button, keyboard key, mouse action, or up to three simultaneous outputs. Changes are staged in this profile; use Write to controller to apply. Keyboard and mouse outputs depend on controller mode and firmware. Macros, turbo and automated actions may violate a game’s rules. Their presence in Connect does not establish permission to use them in a game.</Help></div>
    </div>
    <fieldset className="card control-fieldset" disabled={busy}>
      <label className="stack">Physical button
        <IconSelect label="Physical button" value={selected} onChange={setSelected} disabled={busy} options={targets.map((t, i) => ({ value: i, label: t.label, icon: t.isTrigger ? (t.label.startsWith('LT') ? 19 : 20) : t.functionKey ? (t.label.startsWith('FL') ? 17 : t.label.startsWith('FR') ? 18 : 17) : BUTTON_LABELS.indexOf(t.label) + 1, tag: t.functionKey ? t.label.split(' / ')[1] ?? t.label : undefined }))} />
      </label>
      <p className="hint">{hasMacro ? 'Macro overrides this button.' : mapped ? `Current outputs: ${values.filter(Boolean).map(value => bindingLabel(value, modelId)).join(' + ')}` : 'Original button behavior.'}</p>
      <div className="control-grid">
        {values.map((value, i) => <label className="stack" key={i}>Output {i + 1}
          <KeyPicker modelId={modelId} label={`Output ${i + 1}`} allowShift={modelId === 'G7ProCE' && !shiftLayer} value={value} onChange={(next) => edit(() => { if(next === SHIFT_KEY) { setShiftBinding(target.packet, target.isTrigger, target.functionKey, false); return } const outputs = [...values]; outputs[i] = next; setBinding(target.packet, outputs, target.isTrigger, target.functionKey) })} />
        </label>)}
      </div>
      <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
        <button className="btn" onClick={() => edit(() => setBinding(target.packet, [0, 0, 0], target.isTrigger, target.functionKey))}>Original behavior</button>
        <button className="btn ghost" onClick={() => edit(() => setBinding(target.packet, [255, 0, 0], target.isTrigger, target.functionKey))}>Unbind button</button>
      </div>
      {modelId === 'G7ProCE' && !shiftLayer && <div className="context-help">
        <button className="btn" onClick={() => edit(() => setShiftBinding(target.packet, target.isTrigger, target.functionKey, false))}>Use as Shift button</button>
        <Help title="Shift layer">Hold this button to use the shared Shift profile. Enable Toggle on press below for press-to-toggle behavior. Edit the layer with the Shift button beside P1-P4, write it first, then write this base profile. This replaces the selected button's outputs and disables its macro and turbo, keeping stored macro steps.</Help>
      </div>}
      <div className="control-grid" style={{ marginTop: 20 }}>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={access.toggleOnPress(target.packet)} onChange={(e) => edit(() => access.setToggle(target.packet, e.target.checked))} />Toggle on press</label>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" disabled={hasMacro || isShift} checked={button.turboEnabled(target.packet)} onChange={(e) => edit(() => button.setTurbo(target.packet, e.target.checked, button.turboSpeed(target.packet) || 5))} />Turbo</label>
        <label className="stack">Turbo speed
          <input className="input" type="number" min={1} max={255} step={1} disabled={hasMacro || isShift || !button.turboEnabled(target.packet)} value={button.turboSpeed(target.packet)} onChange={(e) => {
            const v = Number(e.target.value)
            if (Number.isInteger(v) && v >= 1 && v <= 255) edit(() => button.setTurbo(target.packet, true, v))
          }} />
        </label>
      </div>
      <div className="context-help"><Help title="How this works">Changing a binding disables its macro but keeps the stored steps. Empty slots leave the original behavior when all three are empty. Unbound explicitly disables output. Turbo uses the controller’s stored speed scale; firmware may limit the usable range.</Help></div>
    </fieldset>
    <details className="card"><summary>All button bindings</summary>
      <div className="control-overview">{targets.map((t, i) => {
        const a = t.isTrigger ? trigger : button
        return <button className={`btn ghost${selected === i ? ' active' : ''}`} key={i} onClick={() => setSelected(i)}>
          <KeyIcon value={t.isTrigger ? (t.label.startsWith('LT') ? 19 : 20) : t.functionKey ? (t.label.startsWith('FL') ? 17 : t.label.startsWith('FR') ? 18 : 17) : BUTTON_LABELS.indexOf(t.label) + 1} tag={t.functionKey ? t.label.split(' / ')[1] ?? t.label : undefined} /><strong>{t.label}</strong><span className="hint">{t.functionKey && macro.macroEnabled(t.packet) ? 'Macro' : a.mapped(t.packet) ? a.mapValues(t.packet).filter(Boolean).map(value => bindingLabel(value, modelId)).join(' + ') : 'Original'}</span>
        </button>
      })}</div>
    </details>
  </div>
}
