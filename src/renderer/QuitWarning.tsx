import { useEffect, useRef, useState } from 'react'
import { api } from './api'

export function QuitWarning(): JSX.Element | null {
  const [prompt, setPrompt] = useState<{ id: string; detail: string } | null>(null)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const first = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const offPrompt = api().on('rc:quitPrompt', (value) => { setPrompt(value as unknown as { id: string; detail: string }); setError(''); setWorking(false) })
    const offError = api().on('rc:quitError', (value) => setError(String(value)))
    return () => { offPrompt(); offError() }
  }, [])
  useEffect(() => { if (prompt) first.current?.focus() }, [prompt])
  if (!prompt) return error ? <div className="quit-error" role="alert">{error}<button className="btn sm ghost" onClick={() => setError('')}>Dismiss</button></div> : null
  async function choose(reset: boolean): Promise<void> {
    if (!prompt) return
    setWorking(true); setError('')
    try { await api().quitRcDecision(prompt.id, reset) } catch (e) { setError((e as Error).message); setWorking(false) }
  }
  return <div className="quit-warning-backdrop" onKeyDown={(event) => {
    if (event.key === 'Tab') {
      event.preventDefault()
      const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
      if (buttons.length) buttons[(buttons.indexOf(document.activeElement as HTMLButtonElement) + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length]?.focus()
    }
  }}>
    <section className="rc-disclaimer quit-warning" role="alertdialog" aria-modal="true" aria-labelledby="quit-warning-title" aria-describedby="quit-warning-detail">
      <h2 id="quit-warning-title">RC's enabled!!!</h2>
      <p className="quit-warning-question">Would you like to reset them before quitting</p>
      <p id="quit-warning-detail">{prompt.detail}</p>
      {error && <p role="alert" className="note warn">{error}</p>}
      <div className="row" style={{ gap: 14 }}>
        <button ref={first} className="btn rc-acknowledge" disabled={working} onClick={() => void choose(true)}>{working ? 'Checking / resetting…' : 'Yes'}</button>
        <button className="btn ghost" disabled={working} onClick={() => void choose(false)}>No</button>
      </div>
    </section>
  </div>
}
