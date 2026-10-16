import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Help } from './Help'
import type { LiveSample } from './api'
import { LIN_GRID, LIN_MIN_PASSES, linFrontier, linTremor, linResolution, linResample, linMedian, linRepresentative, linLinearity } from '@shared/linearity'
const labels: Record<string,string> = {"lab.linIdle": "Idle — pick a stick, then start.", "lab.linPush": "Push center → rim, steady 2–3 s…", "lab.linTremor": "Tremor", "lab.linLinearity": "Linearity", "sticks.stick": "stick", "cal.left": "Left", "lab.linTitle": "Linearity bench", "cal.right": "Right", "common.cancel": "Cancel", "lab.linCentering": "Hold the stick perfectly still…", "lab.linHint": "Guided center-to-edge passes on the live stream. Hold still to set center, then push to the rim at a steady 2–3 s pace — at least 3 passes. Scores tremor (jitter share), linearity (ideal tracking) and resolution (mean step). Rim-hold ends each pass; passes normalize by their own max.", "lab.linPass": "Pass {n}", "lab.linRes": "Resolution", "lab.linReturn": "Back to center, then push again…", "lab.linDone": "Done — {n} passes.", "lab.linAvg": "Average", "lab.linStart": "Start", "lab.linFinish": "Finish & analyze"}
function Hint({children}:{children:ReactNode}):JSX.Element { return <Help title="Linearity test">{children} Hand speed affects the score; this measures observed output and is not an ADC-precision or latency measurement.</Help> }
type LinPhase = 'idle' | 'centering' | 'topass' | 'pass' | 'toreturn' | 'done'

interface LinPass {
  pts: number[]
  tms: number[]
  dur: number
}

export function LinearityBench({ live, connected }: { live: LiveSample | null; connected: boolean }): JSX.Element {
  const t = (key: string): string => labels[key] ?? key
  const [visible, setVisible] = useState(!document.hidden)
  const [stick, setStick] = useState<0 | 1>(0)
  const [phase, setPhase] = useState<LinPhase>('idle')
  const [center, setCenter] = useState<{ x: number; y: number } | null>(null)
  const [passes, setPasses] = useState<LinPass[]>([])
  const [, setTick] = useState(0)
  const buf = useRef<Array<{ x: number; y: number; t: number }>>([])
  const cur = useRef<{ pts: number[]; tms: number[]; t0: number } | null>(null)
  const phaseRef = useRef<LinPhase>(phase)
  phaseRef.current = phase
  const stickRef = useRef<0 | 1>(stick)
  stickRef.current = stick
  const centerRef = useRef<{ x: number; y: number } | null>(center)
  centerRef.current = center

  useEffect(() => {
    const changed=():void=>{setVisible(!document.hidden); if(document.hidden) { phaseRef.current='idle';cur.current=null;buf.current=[];setPhase('idle') } }
    document.addEventListener('visibilitychange',changed)
    const id = window.setInterval(() => setTick((v) => v + 1), 250)
    return () => { window.clearInterval(id);document.removeEventListener('visibilitychange',changed);cur.current=null;buf.current=[] }
  }, [])

  const reset = (): void => {
    buf.current = []
    cur.current = null
    setCenter(null)
    setPasses([])
    setPhase('idle')
  }

  const pickStick = (s: 0 | 1): void => {
    setStick(s)
    reset()
  }

  useEffect(()=>{ if(!connected) { phaseRef.current='idle';cur.current=null;buf.current=[];setPhase('idle') } },[connected])

  const start = (): void => {
    buf.current = []
    cur.current = null
    setCenter(null)
    setPasses([])
    setPhase('centering')
  }

  useEffect(() => {
    if (!live || !connected || !visible || !live.live) return
    const s = stickRef.current
    const x = s === 0 ? live.lx : live.rx
    const y = s === 0 ? live.ly : live.ry
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    const now = Date.now()
    const ph = phaseRef.current
    if (ph === 'centering') {
      if(buf.current.length < 10000) buf.current.push({ x, y, t: now }); else buf.current.shift()
      const b = buf.current
      if (b.length >= 3 && now - b[0].t >= 1500) {
        let spread = 0
        let sx = 0
        let sy = 0
        for (const p of b) {
          sx += p.x
          sy += p.y
        }
        const mx = sx / b.length
        const my = sy / b.length
        for (const p of b) {
          spread = Math.max(spread, Math.abs(p.x - mx), Math.abs(p.y - my))
        }
        if (spread <= 6) {
          setCenter({ x: mx, y: my })
          buf.current = []
          setPhase('topass')
        } else {
          buf.current = []
        }
      }
    } else if (ph === 'topass') {
      const c = centerRef.current
      if (!c) return
      const r = Math.hypot(x - c.x, y - c.y) / 127
      if (r > 0.2) {
        cur.current = { pts: [r], tms: [0], t0: now }
        setPhase('pass')
      }
    } else if (ph === 'pass') {
      const c = centerRef.current
      const session = cur.current
      if (!c || !session) return
      const r = Math.hypot(x - c.x, y - c.y) / 127
      if(session.pts.length >= 15000) { reset(); return }
      session.pts.push(r)
      session.tms.push(now - session.t0)
      const dur = now - session.t0
      const recent = session.pts.filter((_, i) => session.tms[i] >= dur - 500)
      const held = r >= 0.85 && recent.length >= 3 && Math.max(...recent) - Math.min(...recent) <= 0.03
      if ((held && dur >= 800) || dur >= 12000) {
        const pts = session.pts
        const tms = session.tms
        cur.current = null
        if (dur >= 500 && pts.length >= 10) {
          const peak = Math.max(...pts)
          if (peak > 0.05) {
            setPasses((prev) => [...prev.slice(-19), { pts: pts.map((v) => v / peak), tms: [...tms], dur: dur / 1000 }])
            setPhase('toreturn')
            return
          }
        }
        setPhase('topass')
      }
    } else if (ph === 'toreturn') {
      const c = centerRef.current
      if (!c) return
      if (Math.hypot(x - c.x, y - c.y) / 127 < 0.25) setPhase('topass')
    }
  }, [live, connected, visible])

  const grids = passes.map((p) => linResample(p.pts, p.tms))
  const median = grids.length > 0 ? linMedian(grids) : []
  const rep = grids.length > 0 && median.length > 0 ? linRepresentative(grids, median) : 0
  const scored = passes.map((p) => {
    const f = linFrontier(p.pts)
    return {
      dur: p.dur,
      tremor: linTremor(p.pts.length, f.kept.length),
      linearity: linLinearity(p.pts, p.tms),
      res: linResolution(f.kept)
    }
  })
  const avg = (vs: number[]): number => (vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : 0)

  const status =
    phase === 'idle' ? t('lab.linIdle')
    : phase === 'centering' ? t('lab.linCentering')
    : phase === 'done' ? t('lab.linDone').replace('{n}', String(passes.length))
    : phase === 'toreturn' ? t('lab.linReturn')
    : t('lab.linPush')

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3>{t('lab.linTitle')}</h3>
      <Hint>{t('lab.linHint')}</Hint>
      <div className="row" style={{ gap: 8, margin: '10px 0' }}>
        {([0, 1] as const).map((s) => (
          <button
            key={s}
            className={`choice-btn${stick === s ? ' active' : ''}`}
            onClick={() => pickStick(s)}
          >
            <span className="choice-label">{s === 0 ? t('cal.left') : t('cal.right')} {t('sticks.stick')}</span>
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <span className="pill">{passes.length}/{LIN_MIN_PASSES}+</span>
      </div>
      <div className="label" style={{ marginBottom: 8 }}>{status}</div>
      <div className="row wrap" style={{ gap: 8 }}>
        {(phase === 'idle' || phase === 'done') && (
          <button className="btn sm primary" disabled={!connected || !live} onClick={start}>
            <span className="choice-label">{t('lab.linStart')}</span>
          </button>
        )}
        {phase !== 'idle' && phase !== 'done' && (
          <button className="btn sm ghost" onClick={reset}>
            <span className="choice-label">{t('common.cancel')}</span>
          </button>
        )}
        {(phase === 'topass' || phase === 'pass' || phase === 'toreturn') && (
          <button className="btn sm primary" disabled={passes.length < LIN_MIN_PASSES} onClick={() => setPhase('done')}>
            <span className="choice-label">{t('lab.linFinish')}</span>
          </button>
        )}
      </div>
      {scored.length > 0 && (
        <div className="stack" style={{ gap: 4, marginTop: 10 }}>
          {scored.map((m, i) => (
            <div key={i} className="mono" style={{ fontSize: 12 }}>
              {t('lab.linPass').replace('{n}', String(i + 1))}{i === rep && phase === 'done' ? ' ★' : ''} · {m.dur.toFixed(1)}s · {t('lab.linTremor')} {m.tremor.toFixed(1)}% · {t('lab.linLinearity')} {m.linearity.toFixed(1)}% · {t('lab.linRes')} {m.res}
            </div>
          ))}
          {phase === 'done' && (
            <div className="mono" style={{ fontSize: 12, color: 'var(--accent-2)' }}>
              {t('lab.linAvg')} · {t('lab.linTremor')} {avg(scored.map((m) => m.tremor)).toFixed(1)}% · {t('lab.linLinearity')} {avg(scored.map((m) => m.linearity)).toFixed(1)}% · {t('lab.linRes')} {Math.round(avg(scored.map((m) => m.res)))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
