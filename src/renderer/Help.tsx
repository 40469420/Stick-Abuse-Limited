import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

/** Clickable help works with keyboard, touch and mouse; it never depends on hover. */
export function Help({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  const [open, setOpen] = useState(false), id = useId(), root = useRef<HTMLSpanElement>(null)
  const popup = useRef<HTMLSpanElement>(null), [position, setPosition] = useState({ left: 8, top: 8 })
  useLayoutEffect(() => {
    if (!open) return
    const place = (): void => {
      const anchor = root.current?.getBoundingClientRect(), panel = popup.current?.getBoundingClientRect()
      if (!anchor || !panel) return
      const left = Math.max(8, Math.min(anchor.left - 120, window.innerWidth - panel.width - 8))
      const top = anchor.bottom + panel.height + 16 <= window.innerHeight ? anchor.bottom + 8 : Math.max(8, anchor.top - panel.height - 8)
      setPosition({ left, top })
    }
    place(); window.addEventListener('resize', place); document.addEventListener('scroll', place, true)
    return () => { window.removeEventListener('resize', place); document.removeEventListener('scroll', place, true) }
  }, [open])
  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent): void => { if (!root.current?.contains(e.target as Node)) setOpen(false) }
    const escape = (e: KeyboardEvent): void => { if (e.key === 'Escape') { setOpen(false); root.current?.querySelector('button')?.focus() } }
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  return <span className="help" ref={root}><button type="button" className="help-button" aria-label={`Help: ${title}`} aria-expanded={open} aria-controls={id} onClick={() => setOpen(v => !v)}>?</button>
    {open && <span ref={popup} style={position} id={id} className="help-popup" role="note"><strong>{title}</strong><span>{children}</span><button type="button" className="btn sm ghost" onClick={() => { setOpen(false); root.current?.querySelector('button')?.focus() }}>Close help</button></span>}</span>
}

