import { Help } from './Help'
import { useState } from 'react'
import { button, trigger, macro, type Profile } from '@shared/profile'
import { BINDING_KEYS, BUTTON_LABELS, FUNCTION_LABELS, bindingLabel, setBinding } from '@shared/bindings'

export function KeyPicker({ value, onChange, empty = true, label = 'Output key' }: { value: number; onChange: (value: number) => void; empty?: boolean; label?: string }): JSX.Element {
  return <select className="input" aria-label={label} value={value} onChange={(e) => onChange(Number(e.target.value))}>
    {empty && <option value={0}>Empty / original</option>}
    {!BINDING_KEYS.some((k) => k.value === value) && value !== 0 && <option value={value}>{bindingLabel(value)}</option>}
    {[...new Set(BINDING_KEYS.map((k) => k.group))].map((group) => <optgroup label={group} key={group}>
      {BINDING_KEYS.filter((k) => k.group === group).map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
    </optgroup>)}
  </select>
}

export function Bindings({ profile, edit, busy }: { profile: Profile; edit: (fn: () => void) => void; busy: boolean }): JSX.Element {
  const [selected, setSelected] = useState(0)
  const targets = [
    ...profile.buttons.map((packet, i) => ({ packet, label: BUTTON_LABELS[i], isTrigger: false, functionKey: false })),
    ...profile.functionKeys.map((packet, i) => ({ packet, label: FUNCTION_LABELS[i], isTrigger: false, functionKey: true })),
    ...profile.triggers.map((packet, i) => ({ packet, label: i === 0 ? 'LT / L2' : 'RT / R2', isTrigger: true, functionKey: false }))
  ]
  const target = targets[selected]
  const access = target.isTrigger ? trigger : button
  const values = access.mapValues(target.packet)
  const mapped = access.mapped(target.packet)
  const hasMacro = target.functionKey && macro.macroEnabled(target.packet)
  return <div className="stack" style={{ gap: 16 }}>
    <div className="card">
      <div className="section-title"><h3>Keybindings</h3><Help title="Keybindings">Map a controller button to another button, keyboard key, mouse action, or up to three simultaneous outputs. Changes are staged in this profile; use Write to controller to apply. Keyboard and mouse outputs depend on controller mode and firmware. Macros, turbo and automated actions may violate a game’s rules. Their presence in Connect does not establish permission to use them in a game.</Help></div>
    </div>
    <fieldset className="card control-fieldset" disabled={busy}>
      <label className="stack">Physical button
        <select className="input" value={selected} onChange={(e) => setSelected(Number(e.target.value))} aria-label="Physical button">
          {targets.map((t, i) => <option key={i} value={i}>{t.label}</option>)}
        </select>
      </label>
      <p className="hint">{hasMacro ? 'Macro overrides this button.' : mapped ? `Current outputs: ${values.filter(Boolean).map(bindingLabel).join(' + ')}` : 'Original button behavior.'}</p>
      <div className="control-grid">
        {values.map((value, i) => <label className="stack" key={i}>Output {i + 1}
          <KeyPicker label={`Output ${i + 1}`} value={value} onChange={(next) => edit(() => { const outputs = [...values]; outputs[i] = next; setBinding(target.packet, outputs, target.isTrigger, target.functionKey) })} />
        </label>)}
      </div>
      <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
        <button className="btn" onClick={() => edit(() => setBinding(target.packet, [0, 0, 0], target.isTrigger, target.functionKey))}>Original behavior</button>
        <button className="btn ghost" onClick={() => edit(() => setBinding(target.packet, [255, 0, 0], target.isTrigger, target.functionKey))}>Unbind button</button>
      </div>
      <div className="control-grid" style={{ marginTop: 20 }}>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={access.toggleOnPress(target.packet)} onChange={(e) => edit(() => access.setToggle(target.packet, e.target.checked))} />Toggle on press</label>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" disabled={hasMacro} checked={button.turboEnabled(target.packet)} onChange={(e) => edit(() => button.setTurbo(target.packet, e.target.checked, button.turboSpeed(target.packet) || 5))} />Turbo</label>
        <label className="stack">Turbo speed
          <input className="input" type="number" min={1} max={255} step={1} disabled={hasMacro || !button.turboEnabled(target.packet)} value={button.turboSpeed(target.packet)} onChange={(e) => {
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
          <strong>{t.label}</strong><span className="hint">{t.functionKey && macro.macroEnabled(t.packet) ? 'Macro' : a.mapped(t.packet) ? a.mapValues(t.packet).filter(Boolean).map(bindingLabel).join(' + ') : 'Original'}</span>
        </button>
      })}</div>
    </details>
  </div>
}
