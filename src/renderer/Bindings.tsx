import { IconSelect } from './IconSelect'
import { KeyIcon } from './KeyIcon'
import { Help } from './Help'
import { useState } from 'react'
import { button, trigger, macro, type Profile } from '@shared/profile'
import { BINDING_KEYS, BUTTON_LABELS, FUNCTION_LABELS, bindingLabel, setBinding } from '@shared/bindings'

export function KeyPicker({ value, onChange, empty = true, label = 'Output key' }: { value: number; onChange: (value: number) => void; empty?: boolean; label?: string }): JSX.Element {
  const options = BINDING_KEYS.map(k => ({ value: k.value, label: k.label, group: k.group }))
  if (empty) options.unshift({ value: 0, label: 'Empty / original', group: '' })
  if (!options.some(o => o.value === value)) options.unshift({ value, label: bindingLabel(value), group: '' })
  return <IconSelect label={label} value={value} options={options} onChange={onChange} />
}

export function Bindings({ profile, edit, busy }: { profile: Profile; edit: (fn: () => void) => void; busy: boolean }): JSX.Element {
  const [selected, setSelected] = useState(0)
  const targets = [
    ...profile.buttons.map((packet, i) => ({ packet, label: BUTTON_LABELS[i], isTrigger: false, functionKey: false })),
    ...profile.functionKeys.map((packet, i) => ({ packet, label: ['FL1 / L4', 'FR1 / R4', 'FL2 / L5', 'FR2 / R5'][i] ?? FUNCTION_LABELS[i], isTrigger: false, functionKey: true })),
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
        <IconSelect label="Physical button" value={selected} onChange={setSelected} disabled={busy} options={targets.map((t, i) => ({ value: i, label: t.label, icon: t.isTrigger ? (t.label.startsWith('LT') ? 19 : 20) : t.functionKey ? (t.label.startsWith('FL') ? 17 : 18) : BUTTON_LABELS.indexOf(t.label) + 1, tag: t.functionKey ? t.label.split(' / ')[1] : undefined }))} />
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
          <KeyIcon value={t.isTrigger ? (t.label.startsWith('LT') ? 19 : 20) : t.functionKey ? (t.label.startsWith('FL') ? 17 : 18) : BUTTON_LABELS.indexOf(t.label) + 1} tag={t.functionKey ? t.label.split(' / ')[1] : undefined} /><strong>{t.label}</strong><span className="hint">{t.functionKey && macro.macroEnabled(t.packet) ? 'Macro' : a.mapped(t.packet) ? a.mapValues(t.packet).filter(Boolean).map(bindingLabel).join(' + ') : 'Original'}</span>
        </button>
      })}</div>
    </details>
  </div>
}
