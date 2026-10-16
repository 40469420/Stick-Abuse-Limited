import { createPortal } from 'react-dom'
import { useEffect, useId, useRef, useState } from 'react'
import { KeyIcon } from './KeyIcon'
export interface IconOption { value: number; label: string; icon?: number; tag?: string; group?: string }
export function IconSelect({ value, options, onChange, label, disabled = false }: { value: number; options: IconOption[]; onChange: (value: number) => void; label: string; disabled?: boolean }): JSX.Element {
  const compact = options.length <= 8 && options.every(o => o.label.length < 18)
  const popupMin = compact ? 160 : 240
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: 0, top: 0, width: 240, height: 300 })
  const id = useId()
  useEffect(() => {
    if (!open) return
    const rect = root.current?.getBoundingClientRect()
    if (rect) { const height = Math.min(330, window.innerHeight - 24); setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - Math.max(rect.width, popupMin) - 8)), top: rect.bottom + height > window.innerHeight ? Math.max(8, rect.top - height) : rect.bottom + 4, width: Math.min(Math.max(rect.width, popupMin), window.innerWidth - 16), height }) }
    const close = (e: Event): void => { if (!popup.current?.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close) }
  }, [open, popupMin])
  const selected = options.find(o => o.value === value)
  useEffect(() => {
    const close = (e: PointerEvent): void => { if (!root.current?.contains(e.target as Node) && !popup.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])
  useEffect(() => { if (disabled) setOpen(false) }, [disabled])
  const filtered = options.filter(o => `${o.label} ${o.group ?? ''}`.toLowerCase().includes(query.toLowerCase()))
  return <div className={`icon-select${compact ? ' is-short' : ''}`} ref={root} onKeyDown={e => {
    if (e.key === 'Escape') { setOpen(false); root.current?.querySelector<HTMLButtonElement>('.icon-select-trigger')?.focus() }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) { setOpen(true); setQuery(''); return }
      const buttons = Array.from(popup.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
      buttons[(index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus()
    }
  }}>
    <button type="button" className="input icon-select-trigger" aria-label={label} aria-haspopup="listbox" aria-expanded={open && !disabled} aria-controls={id} disabled={disabled} onClick={() => { setOpen(!open); setQuery('') }}>
      <KeyIcon value={selected?.icon ?? value} tag={selected?.tag} /><span>{selected?.label ?? `Unknown code ${value}`}</span><span className="icon-select-chevron">▾</span>
    </button>
    {open && !disabled && createPortal(<div ref={popup} className="icon-select-popup" style={{ position: 'fixed', left: position.left, top: position.top, width: position.width, maxHeight: position.height }}>
      {options.length > 12 && <input autoFocus className="input" aria-label={`Search ${label}`} placeholder="Search…" value={query} onChange={e => setQuery(e.target.value)} />}
      <div id={id} role="listbox" aria-label={label} className="icon-select-options">{filtered.map((o, i) => <div key={o.value}>
        {o.group && (i === 0 || filtered[i - 1].group !== o.group) && <div className="icon-select-group">{o.group}</div>}
        <button type="button" role="option" aria-selected={o.value === value} className={`icon-select-option${o.value === value ? ' selected' : ''}`} onClick={() => { if (root.current?.querySelector('.icon-select-trigger')?.matches(':disabled')) { setOpen(false); return } onChange(o.value); setOpen(false); root.current?.querySelector<HTMLButtonElement>('.icon-select-trigger')?.focus() }}><KeyIcon value={o.icon ?? o.value} tag={o.tag} /><span>{o.label}</span></button>
      </div>)}{filtered.length === 0 && <div className="icon-select-group">No matches</div>}</div>
    </div>, document.body)}
  </div>
}
