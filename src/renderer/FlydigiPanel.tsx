import { Help } from './Help'
import { LINEAR_CURVE } from '@shared/profile'
import { STICK_RESOLUTION_OPTIONS } from '@shared/protocol'
import { EXTENDED_BITS } from '@shared/sticklab'
import { useEffect, useRef, useState } from 'react'
import { flyTransport, type FlyIdentity } from './flydigiUsb'
import { flyTypeName } from '@shared/flydigi'
import { useFlyLive, axisToByte } from './flydigiLive'
import { useT } from './i18n'
import { traceSpline } from '@shared/sticklab'
function Slider(props: {  label: string
  value: number
  min: number
  max: number
  step: number
  unit?: string
  onChange: (v: number) => void
  format?: (v: number) => string
}): JSX.Element {
  return (
    <label style={{ display: 'block' }}>
      <div className="row spread">
        <span className="label">{props.label}</span>
        <span className="mono">{props.format ? props.format(props.value) : `${props.value}${props.unit ?? ''}`}</span>
      </div>
      <input
        type="range"
        className="input"
        style={{ width: '100%' }}
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </label>
  )
}

function CurvePlot({ points, onChange, overlay, smooth }: { points: Array<{ x: number; y: number }>; onChange?: (next: Array<{ x: number; y: number }>) => void; overlay?: Array<{ x: number; y: number }>; smooth?: boolean }): JSX.Element {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const drag = useRef<number | null>(null)

  function toPx(w: number, h: number): { toX: (v: number) => number; toY: (v: number) => number } {
    const pad = 10
    return {
      toX: (v: number): number => pad + (v / 255) * (w - pad * 2),
      toY: (v: number): number => h - pad - (v / 255) * (h - pad * 2)
    }
  }

  function pointAt(e: React.PointerEvent, w: number, h: number): number | null {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    const { toX, toY } = toPx(w, h)
    let best: number | null = null
    let bestD = 14
    points.forEach((p, i) => {
      const d = Math.hypot(toX(p.x) - px, toY(p.y) - py)
      if (d < bestD) {
        bestD = d
        best = i
      }
    })
    return best
  }

  function movePoint(e: React.PointerEvent, i: number): void {
    const canvas = ref.current
    if (!canvas || !onChange) return
    const rect = canvas.getBoundingClientRect()
    const w = canvas.clientWidth
    const h = 200
    const pad = 10
    const x = Math.max(0, Math.min(255, Math.round(((e.clientX - rect.left - pad) / (w - pad * 2)) * 255)))
    const y = Math.max(0, Math.min(255, Math.round((1 - (e.clientY - rect.top - pad) / (h - pad * 2)) * 255)))
    const next = points.map((p) => ({ ...p }))
    next[i] = { x, y }
    onChange(next)
  }
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    const w = c.clientWidth
    const h = 200
    c.width = w * dpr
    c.height = h * dpr
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    const pad = 10
    const toX = (v: number): number => pad + (v / 255) * (w - pad * 2)
    const toY = (v: number): number => h - pad - (v / 255) * (h - pad * 2)
    ctx.strokeStyle = '#3a2230'
    for (let i = 0; i <= 4; i++) {
      const t = (i / 4) * (w - pad * 2) + pad
      ctx.beginPath()
      ctx.moveTo(t, pad)
      ctx.lineTo(t, h - pad)
      ctx.stroke()
    }
    ctx.strokeStyle = '#552c38'
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(toX(0), toY(0))
    ctx.lineTo(toX(255), toY(255))
    ctx.stroke()
    ctx.setLineDash([])
    // Max X / Y boundary lines (255 edges) with labels.
    ctx.strokeStyle = 'rgba(62,207,142,0.55)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(toX(255), pad)
    ctx.lineTo(toX(255), h - pad)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(pad, toY(255))
    ctx.lineTo(w - pad, toY(255))
    ctx.stroke()
    ctx.fillStyle = '#3ecf8e'
    ctx.font = '10px system-ui'
    ctx.fillText('X max 255', toX(255) - 52, pad + 11)
    ctx.fillText('Y max 255', pad + 4, toY(255) + 13)
    // Endpoint projections: actual max X / max Y reached by the design.
    if (points.length > 0) {
      const maxX = Math.max(...points.map((p) => p.x))
      const maxY = Math.max(...points.map((p) => p.y))
      ctx.strokeStyle = 'rgba(245,181,68,0.8)'
      ctx.setLineDash([5, 4])
      ctx.beginPath()
      ctx.moveTo(toX(maxX), toY(0))
      ctx.lineTo(toX(maxX), toY(255))
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(toX(0), toY(maxY))
      ctx.lineTo(toX(255), toY(maxY))
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = '#f5b544'
      ctx.fillText(`max X ${maxX}`, Math.min(toX(maxX) + 5, w - 52), h - pad - 5)
      ctx.fillText(`max Y ${maxY}`, pad + 4, toY(maxY) - 5)
    }
    ctx.strokeStyle = '#f43f52'
    ctx.lineWidth = 2
    ctx.beginPath()
    const line = smooth ? traceSpline(points) : points
    line.forEach((p, i) => {
      if (i === 0) ctx.moveTo(toX(p.x), toY(p.y))
      else ctx.lineTo(toX(p.x), toY(p.y))
    })
    ctx.stroke()
    if (overlay) {
      ctx.strokeStyle = 'rgba(245,181,68,0.85)'
      ctx.setLineDash([5, 4])
      ctx.beginPath()
      overlay.forEach((p, i) => {
        if (i === 0) ctx.moveTo(toX(p.x), toY(p.y))
        else ctx.lineTo(toX(p.x), toY(p.y))
      })
      ctx.stroke()
      ctx.setLineDash([])
      overlay.forEach((p) => {
        ctx.strokeStyle = 'rgba(245,181,68,0.9)'
        ctx.lineWidth = 1.5
        ctx.strokeRect(toX(p.x) - 3.5, toY(p.y) - 3.5, 7, 7)
      })
      ctx.lineWidth = 2
    }
    points.forEach((p) => {
      ctx.fillStyle = drag.current !== null ? '#f5b544' : '#ff8fa0'
      ctx.beginPath()
      ctx.arc(toX(p.x), toY(p.y), 5, 0, Math.PI * 2)
      ctx.fill()
    })
  }, [points, overlay, smooth])
  return (
    <canvas
      ref={ref}
      className="plot"
      style={{ height: 200, cursor: onChange ? 'grab' : 'default', touchAction: 'none' }}
      onPointerDown={(e) => {
        if (!onChange || !ref.current) return
        const i = pointAt(e, ref.current.clientWidth, 200)
        if (i !== null) {
          drag.current = i
          ;(e.target as HTMLCanvasElement).setPointerCapture(e.pointerId)
        }
      }}
      onPointerMove={(e) => {
        if (drag.current !== null) movePoint(e, drag.current)
      }}
      onPointerUp={() => {
        drag.current = null
      }}
    />
  )
}

/**
 * FPS curve pack — static 5-point dual-zone approximations of a "dynamic"
 * response (fine centre for micro-aim, hot edge for flicks). The pad has no
 * speed-sensing, so true velocity-dynamic curves are impossible; these bend
 * the same LUT a dynamic curve would average out to. All verified byte-safe:
 * curve bytes only, +14..+23.
 */
const AIM_CURVES: Record<string, { label: string; hint: string; pts: Array<{ x: number; y: number }> }> = {
  linear: { label: 'Linear', hint: '1:1 raw', pts: [...LINEAR_CURVE] },
  fpsAim: {
    label: 'Kiyoshi Curve',
    hint: 'calm centre, hot edge',
    pts: [{ x: 0, y: 0 }, { x: 64, y: 38 }, { x: 128, y: 100 }, { x: 191, y: 185 }, { x: 255, y: 255 }]
  },
  micro: {
    label: 'Micro-aim',
    hint: 'extra-fine centre for tracking',
    pts: [{ x: 0, y: 0 }, { x: 64, y: 28 }, { x: 128, y: 80 }, { x: 191, y: 170 }, { x: 255, y: 255 }]
  },
  flick: {
    label: 'Flick/Snap',
    hint: 'fast start for 180s',
    pts: [{ x: 0, y: 0 }, { x: 64, y: 100 }, { x: 128, y: 160 }, { x: 191, y: 215 }, { x: 255, y: 255 }]
  },
  snappy: {
    label: 'Snappy mid',
    hint: 'COD-style boosted mid',
    pts: [{ x: 0, y: 0 }, { x: 64, y: 78 }, { x: 128, y: 140 }, { x: 191, y: 200 }, { x: 255, y: 255 }]
  },
  steady: {
    label: 'Steady track',
    hint: 'Apex-style even pull',
    pts: [{ x: 0, y: 0 }, { x: 64, y: 52 }, { x: 128, y: 112 }, { x: 191, y: 188 }, { x: 255, y: 255 }]
  },  expo: {
    label: 'Expo',
    hint: 'late surge',
    pts: [{ x: 0, y: 0 }, { x: 64, y: 16 }, { x: 128, y: 70 }, { x: 191, y: 158 }, { x: 255, y: 255 }]
  },
  sacreds: {    label: 'Sacreds',
    hint: 'Hyperstrike-style smooth fast start, 10 points',
    pts: [
      { x: 0, y: 0 },
      { x: 26, y: 41 },
      { x: 49, y: 72 },
      { x: 76, y: 107 },
      { x: 102, y: 140 },
      { x: 133, y: 157 },
      { x: 153, y: 177 },
      { x: 168, y: 197 },
      { x: 191, y: 223 },
      { x: 229, y: 255 }
    ]
  },
  machixo: {
    label: 'Machixo',
    hint: 'Slow-start desensitized, tops at 94%',
    pts: [
      { x: 0, y: 0 },
      { x: 20, y: 15 },
      { x: 82, y: 61 },
      { x: 133, y: 99 },
      { x: 184, y: 138 },
      { x: 235, y: 176 },
      { x: 255, y: 240 }
    ]
  }
}


export function ApexDevice({ flyId, rates }: { flyId: FlyIdentity | null; rates: ReadonlyArray<{ gear: number; hz: number; confirmed: boolean }> }): JSX.Element {
  const t = useT()
  const [bright, setBright] = useState(40)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function write(): Promise<void> {
    setErr(null)
    setMsg(null)
    if (!flyTransport.connected) {
      setErr('Apex 5 not connected — connect it from the sidebar first, and close Space Station.')
      return
    }
    if (!window.confirm(`Set LED brightness to ${bright}%? This sends Default-mode constants — another active LED mode resets to Default.`)) return
    setBusy(true)
    try {
      const res = await flyTransport.writeLed(bright)
      setMsg(`Brightness ${bright}% written + saved (stamp ${res.stamp}) — visible on the pad itself.`)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="card">
        <h3>{t('nav.device')} — Apex 5</h3>
        <div className="row"><Help title="About this control">1000 Hz max on this pad — nothing faster is offered. Polling-rate switching, bit depth (precision) and shapes are GameSir-only or unmapped, so those cards stay off here. Curves live in Sticks.</Help></div>
        {flyId && <div className="mono" style={{ fontSize: 11, marginTop: 6 }}>uid {flyId.uid}</div>}
      </div>
      <div className="card">
        <h3>{t('device.polling')} - {rates.map((o) => (o.hz >= 1000 ? `${o.hz / 1000}K` : `${o.hz}`)).join(' / ')}</h3>
        <div className="row"><Help title="About this control">Report-rate gears. Rate switching is unmapped on this pad — 1000 Hz max.</Help></div>
        <div className="row wrap" style={{ gap: 8, margin: '10px 0' }}>
          {rates.map((o) => (
            <button
              key={o.gear}
              className="btn sm ghost"
              disabled
              title="Rate switching is unmapped on this pad"
            >
              {o.hz >= 1000 ? `${o.hz / 1000}K` : `${o.hz} Hz`}
            </button>
          ))}
        </div>
      </div>
      <div className="card">
        <h3>{t('device.bits')} - 8-24</h3>
        <div className="row"><Help title="About this control">Precision switching is unmapped on this pad — the sensor runs its stock resolution.</Help></div>
        <div className="row wrap" style={{ gap: 8, margin: '10px 0' }}>
          {STICK_RESOLUTION_OPTIONS.map((o) => (
            <button
              key={o.bits}
              className="btn sm ghost"
              disabled
              title="Precision switching is unmapped on this pad"
            >
              {o.bits}-bit
            </button>
          ))}
          {EXTENDED_BITS.map((bits) => (
            <button
              key={bits}
              className="btn sm ghost"
              disabled
              title="Precision switching is unmapped on this pad"
            >
              {bits}-bit*
            </button>
          ))}
        </div>
      </div>
      <div className="card">
        <h3>{t('device.rate')}</h3>
        <div className="row"><Help title="About this control">How fast this stick answers in Mouse mode on GameSir pads. No equivalent on this pad.</Help></div>
      </div>
      <div className="card">
        <h3>{t('sticks.shape')}</h3>
        <div className="row"><Help title="About this control">Round/square/raw processing flags. This pad has no shape flags: output always follows the curve.</Help></div>
        <div className="stack" style={{ gap: 8 }}>
          {['Round diagonals', 'Square gate', 'Pure raw 1:1'].map((name) => (
            <button key={name} className="btn sm ghost" disabled title="No processing-flag equivalent on this pad">{name}</button>
          ))}
        </div>
      </div>
      <div className="card" style={{ borderColor: 'var(--bad)' }}>
        <h3>{t('sticks.reset')}</h3>
        <div className="row"><Help title="About this control">Curve reset lives in the Sticks tab for this pad (designs state is shared there).</Help></div>
      </div>
      <div className="card">
        <h3>LED</h3>
        <div className="row"><Help title="About this control">Mirrored from live captures (checksum rule proven). Brightness-only — the write carries Default-mode constants, so another active LED mode resets to Default.</Help></div>
        <div className="stack" style={{ gap: 8, marginTop: 8 }}>
          <Slider label="Brightness" value={bright} min={0} max={100} step={1} unit="%" onChange={(v) => setBright(Math.round(v))} format={(v) => `${v.toFixed(0)}%`} />
        </div>
        <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
          <button className="btn sm primary" disabled={busy} onClick={() => void write()}>{busy ? 'Writing…' : 'Write LED'}</button>
        </div>
        {msg && <div className="note" style={{ marginTop: 8 }}>{msg}</div>}
        {err && <div className="note bad" style={{ marginTop: 8 }}>{err}</div>}
      </div>
    </div>
  )
}

const FLY_P2D = (v: number): number => Math.max(0, Math.min(255, Math.round((v * 255) / 150)))
const FLY_D2P = (p: number): number => Math.max(0, Math.min(150, Math.round((p * 150) / 255)))
const FLY_SLOTX = (i: number): number => Math.round((i * 255) / 8)
const flyToDesign = (pts: number[]): Array<{ x: number; y: number }> =>
  pts.map((v, i) => ({ x: FLY_SLOTX(i), y: FLY_P2D(v) }))
const flyFromDesign = (d: Array<{ x: number; y: number }>): number[] => d.map((p) => FLY_D2P(p.y))
/** Resample an 8K-style free polyline (0–255) to 9 even outputs (0–150). */
const flyResampleAim = (pts: Array<{ x: number; y: number }>): number[] => {
  const sorted = [...pts].sort((a, b) => a.x - b.x)
  const at = (x: number): number => {
    if (x <= sorted[0].x) return sorted[0].y
    for (let i = 1; i < sorted.length; i++) {
      if (x <= sorted[i].x) {
        const a = sorted[i - 1]
        const b = sorted[i]
        const t = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x)
        return a.y + t * (b.y - a.y)
      }
    }
    return sorted[sorted.length - 1].y
  }
  const out: number[] = []
  for (let i = 0; i < 9; i++) out.push(Math.max(0, Math.min(150, Math.round((at((i * 255) / 8) * 150) / 255))))
  return out
}

export function ApexSticks({ flyId }: { flyId: FlyIdentity | null }): JSX.Element {
  const t = useT()
  const [ptype, setPtype] = useState(2)
  const [which, setWhich] = useState(0)
  const [leftDesign, setLeftDesign] = useState(() => flyToDesign([50, 56, 63, 69, 75, 94, 113, 131, 150]))
  const [rightDesign, setRightDesign] = useState(() => flyToDesign([50, 62, 75, 87, 100, 112, 125, 137, 150]))
  const [padLeft, setPadLeft] = useState(() => flyToDesign([50, 56, 63, 69, 75, 94, 113, 131, 150]))
  const [padRight, setPadRight] = useState(() => flyToDesign([50, 62, 75, 87, 100, 112, 125, 137, 150]))
  const [padType, setPadType] = useState(2)
  const [deadStart, setDeadStart] = useState(10)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [stamp, setStamp] = useState<string | null>(null)
  const liveFeed = useFlyLive(true)
  const [measuring, setMeasuring] = useState<null | { left: number; suggestion: { dev: number; pct: number } | null }>(null)
  const peakRef = useRef(0)

  useEffect(() => {
    if (measuring && liveFeed.present) {
      const dev = Math.max(Math.abs(liveFeed.lx), Math.abs(liveFeed.ly), Math.abs(liveFeed.rx), Math.abs(liveFeed.ry))
      peakRef.current = Math.max(peakRef.current, dev)
    }
  })

  useEffect(() => {
    if (!measuring) return
    if (measuring.left <= 0) {
      const devSteps = Math.round(peakRef.current * 128)
      const pct = Math.round(peakRef.current * 1000) / 10
      setMeasuring({ left: 0, suggestion: { dev: devSteps, pct } })
      return
    }
    const t = window.setTimeout(() => setMeasuring((m) => (m ? { ...m, left: m.left - 1 } : m)), 1000)
    return () => window.clearTimeout(t)
  }, [measuring])

  async function load(): Promise<void> {
    setErr(null)
    if (!flyTransport.connected) {
      setErr('Apex 5 not connected — connect it from the sidebar first, and close Space Station.')
      return
    }
    setBusy(true)
    try {
      const store = await flyTransport.readStore()
      setPtype(store.leftType)
      setPadType(store.leftType)
      setLeftDesign(flyToDesign(store.leftPoints))
      setPadLeft(flyToDesign(store.leftPoints))
      setRightDesign(flyToDesign(store.rightPoints))
      setPadRight(flyToDesign(store.rightPoints))
      setLoaded(true)
      setMsg(`Store read — left ${flyTypeName(store.leftType)}, right type ${store.rightType}. Editing writes both sticks, verified by re-read.`)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (flyTransport.connected && !loaded) void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const resetAll = (): void => {
    if (!window.confirm('Reset both curves to the Slow baseline? Writes nothing until you Send.')) return
    setLeftDesign(flyToDesign([50, 56, 63, 69, 75, 94, 113, 131, 150]))
    setRightDesign(flyToDesign([50, 62, 75, 87, 100, 112, 125, 137, 150]))
    setPtype(2)
    setDeadStart(10)
    setMsg('Reset to the Slow baseline — Send to apply it to the pad.')
  }

  const design = which === 0 ? leftDesign : rightDesign
  const padDesign = which === 0 ? padLeft : padRight
  const setDesign = which === 0 ? setLeftDesign : setRightDesign
  const changed =
    ptype !== padType ||
    design.some((p, i) => p.y !== (padDesign[i]?.y ?? -1))

  const onDesign = (next: Array<{ x: number; y: number }>): void => {
    setDesign(next.map((p, i) => ({ x: FLY_SLOTX(i), y: Math.max(0, Math.min(255, Math.round(p.y))) })))
    setPtype(3)
  }
  const fillPreset = (t: number, p: number[]): void => {
    setPtype(t)
    setDesign(flyToDesign(p))
  }
  /** Deadzone nudge: mirrors Space Station's coupling (one observation — verify feel). */
  const nudgeHead = (v: number): void => {
    const delta = Math.round(v) - deadStart
    if (delta === 0) return
    setDesign((prev) =>
      prev.map((p, i) => (i < 4 ? { ...p, y: Math.max(0, Math.min(255, p.y - Math.round((delta * 255) / 150))) } : p))
    )
    setDeadStart(Math.round(v))
    setPtype(3)
  }

  async function write(): Promise<void> {
    setErr(null)
    setMsg(null)
    if (!flyTransport.connected) {
      setErr('Apex 5 not connected — connect it from the sidebar first, and close Space Station.')
      return
    }
    if (!window.confirm('Write both stick curves to the Apex 5? Polling and precision are untouched. Space Station can restore.')) return
    setBusy(true)
    // Snapshot for best-effort restore.
    let snapshot: { leftType: number; leftPoints: number[]; rightType: number; rightPoints: number[] } | null = null
    try {
      const store = await flyTransport.readStore()
      snapshot = { leftType: store.leftType, leftPoints: [...store.leftPoints], rightType: store.rightType, rightPoints: [...store.rightPoints] }
    } catch {
      /* proceed without a snapshot — user confirmed */
    }
    try {
      const res = await flyTransport.writeCurves(
        { type: ptype, points: flyFromDesign(leftDesign) },
        { type: ptype, points: flyFromDesign(rightDesign) },
        () => flyTransport.readStore().catch(() => null)
      )
      setStamp(res.stamp)
      setMsg(`Both curves written + save committed (stamp ${res.stamp}), read-back matches. Test feel in game.`)
      await load()
    } catch (e) {
      const message = (e as Error).message
      if (snapshot) {
        try {
          await flyTransport.writeCurves(
            { type: snapshot.leftType, points: snapshot.leftPoints },
            { type: snapshot.rightType, points: snapshot.rightPoints },
            () => flyTransport.readStore().catch(() => null)
          )
          setErr(`${message} — original curves restored.`)
          await load()
          return
        } catch {
          /* restore failed too */
        }
      }
      setErr(`${message} — restore in Space Station if feel changed.`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="two" style={{ alignItems: 'start' }}>
      <div className="stack" style={{ gap: 16 }}>
      <div className="card">
        <h3>{t('sticks.live')}</h3>
        <div className="row"><Help title="About this control">Standard gamepad stream (XInput side), -1..1. {t('sticks.liveHint')}</Help></div>
        {liveFeed.present ? (
          <>
            <StickCross lx={axisToByte(liveFeed.lx)} ly={axisToByte(liveFeed.ly)} rx={axisToByte(liveFeed.rx)} ry={axisToByte(liveFeed.ry)} />
            <div className="row spread">
              <span className="mono">L {liveFeed.lx.toFixed(2)},{liveFeed.ly.toFixed(2)}</span>
              <span className="mono">R {liveFeed.rx.toFixed(2)},{liveFeed.ry.toFixed(2)}</span>
            </div>
          </>
        ) : (
          <div className="row"><Help title="About this control">No live gamepad stream — press a button on the pad (the browser needs input to see it).</Help></div>
        )}
      </div>
      <div className="card">
        <h3>{t('sticks.deadzone')} — 0.1% steps</h3>
        <div className="row"><Help title="About this control">No separate window on this pad — deadzone lives in the curve head, full range always. <strong>Start</strong> reshapes the first 4 points of the viewed stick, mirroring Space Station's coupling (single observation — verify feel). End and anti stay neutral.</Help></div>
        <div className="stack" style={{ gap: 12, marginTop: 8 }}>
          <Slider label="Start (head lift)" value={deadStart} min={0} max={20} step={0.1} unit="%" onChange={(v) => nudgeHead(v)} format={(v) => `${v.toFixed(1)}%`} />
          <div style={{ opacity: 0.45, pointerEvents: 'none' }}>
            <Slider label="End (input above = full)" value={100} min={10} max={100} step={0.1} unit="%" onChange={() => undefined} format={(v) => `${v.toFixed(1)}%`} />
          </div>
          <div style={{ opacity: 0.45, pointerEvents: 'none' }}>
            <Slider label="Anti-deadzone start (output floor — snap)" value={0} min={0} max={50} step={0.1} unit="%" onChange={() => undefined} format={(v) => `${v.toFixed(1)}%`} />
          </div>
          <div style={{ opacity: 0.45, pointerEvents: 'none' }}>
            <Slider label="Anti-deadzone end (output ceiling)" value={100} min={50} max={100} step={0.1} unit="%" onChange={() => undefined} format={(v) => `${v.toFixed(1)}%`} />
          </div>
        </div>
        <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
          {(
            [
              { label: 'Start', key: 'start', value: deadStart, locked: false },
              { label: 'End', key: 'end', value: 100, locked: true },
              { label: 'Anti-start', key: 'beginAnti', value: 0, locked: true },
              { label: 'Anti-end', key: 'endAnti', value: 100, locked: true }
            ] as const
          ).map((f) => (
            <label key={f.key} className="row" style={{ gap: 6, fontSize: 12 }}>
              <span className="label">{f.label}</span>
              <input
                className="input"
                style={{ width: 76 }}
                type="number"
                min={0}
                max={100}
                step={0.1}
                disabled={f.locked}
                value={Number(f.value.toFixed(1))}
                onChange={(e) => {
                  const v = Math.max(0, Math.min(100, Number(e.target.value)))
                  if (!Number.isFinite(v)) return
                  if (!f.locked) nudgeHead(v)
                }}
              />
              <span style={{ color: 'var(--text-3)' }}>%</span>
            </label>
          ))}
        </div>
        <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
          <button className="btn sm ghost" title="Reshape the curve head to a 5% start" onClick={() => nudgeHead(5)}>Factory 5%</button>
          <button
            className="btn sm ghost"
            title="Watch this stick untouched for 10 s, then recommend the Start % that swallows its wander"
            disabled={!liveFeed.present || measuring !== null}
            onClick={() => {
              peakRef.current = 0
              setMeasuring({ left: 10, suggestion: null })
            }}
          >
            {measuring ? `${t('sticks.measuring')} ${measuring.left}s` : t('sticks.centerGuard')}
          </button>
        </div>
        {measuring?.suggestion !== null && measuring?.suggestion !== undefined && (
          <div className="note warn" style={{ marginTop: 8 }}>
            {t('sticks.suggest').replace('{dev}', String(measuring.suggestion.dev))}{' '}
            <button
              className="btn sm primary"
              style={{ marginLeft: 8 }}
              onClick={() => {
                nudgeHead(measuring.suggestion!.pct)
                setMeasuring(null)
              }}
            >
              {t('sticks.setStart').replace('{pct}', String(measuring.suggestion.pct))}
            </button>{' '}
            <button className="btn sm ghost" onClick={() => setMeasuring(null)}>{t('common.dismiss')}</button>
          </div>
        )}
      </div>
      <div className="card">
        <h3>{t('sticks.outer')} — ∞ no limit</h3>
        <div className="row"><Help title="About this control">The boundary of max stick input. This pad is full range, always.</Help></div>
        <div className="row spread" style={{ margin: '10px 0' }}>
          <div>
            <div style={{ fontSize: 13.5 }}>{t('sticks.noLimitTitle')}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
              {t('sticks.outerActive')}
            </div>
          </div>
          <button
            className="btn sm primary"
            disabled
            title="Fixed full range on this pad"
          >
            {t('sticks.infiniteOn')}
          </button>
        </div>
        <div className="note">
          <strong>What this does.</strong> The outer threshold is the deflection where the stick hits maximum output. Neutral removes the boundary entirely: full physical range with nothing clipped or boosted at the rim.
        </div>
      </div>
      </div>
      <div className="stack" style={{ gap: 16 }}>
      <div className="card" style={{ borderColor: 'var(--warn)' }}>
        <h3>{t('sticks.curve')} - 9 points</h3>
        <div className="row"><Help title="About this control">The pad stores exactly <strong>9 points</strong> per stick, so this canvas is exact — no quantization. <span style={{ color: '#ff8fa0' }}>● red = your design, drag it</span>, <span style={{ color: 'var(--warn)' }}>▢ orange dashed = the pad bytes</span>. Same tab, native protocol mirrored byte-exact from live captures. Close Space Station first.</Help></div>
        {flyId && <div className="mono" style={{ fontSize: 11, marginTop: 6 }}>uid {flyId.uid}{stamp ? ` · last write ${stamp}` : ''}</div>}
        <div className="row" style={{ gap: 8, margin: '10px 0' }}>
          {(['Left', 'Right'] as const).map((n, i) => (
            <button key={n} className={`btn${i === which ? ' primary' : ' ghost'}`} onClick={() => setWhich(i)}>
              {n} stick
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <span className={`pill${changed ? ' warn' : ' good'}`}>{changed ? 'design ≠ pad — send it' : 'pad matches design'}</span>
        </div>
        <CurvePlot points={design} onChange={(next) => onDesign(next)} overlay={padDesign} />
        <div className="row" style={{ gap: 8, margin: '8px 0' }}>
          <button className="btn sm" disabled={busy} onClick={() => void load()}>{loaded ? 'Reload from pad' : 'Load from pad'}</button>
          <div style={{ flex: 1 }} />
          <button className="btn sm primary" disabled={!changed || busy} onClick={() => void write()}>{busy ? 'Writing…' : 'Write both curves'}</button>
        </div>
        <div className="row wrap" style={{ gap: 8, margin: '8px 0' }}>
          {[{ t: 3, label: 'Custom' }, { t: 1, label: 'Quick' }, { t: 2, label: 'Slow' }].map((o) => (
            <button key={o.t} className={`btn sm${ptype === o.t ? ' primary' : ' ghost'}`} onClick={() => setPtype(o.t)}>{o.label}</button>
          ))}
        </div>
        <div className="row wrap" style={{ gap: 8, margin: '8px 0' }}>
          {Object.entries(AIM_CURVES).map(([key, c]) => (
            <button
              key={key}
              className="btn sm ghost"
              title={`${c.hint} (resampled to 9 points)`}
              onClick={() => {
                setDesign(flyToDesign(flyResampleAim(c.pts)))
                setPtype(3)
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn sm ghost" onClick={() => fillPreset(2, [50, 56, 63, 69, 75, 94, 113, 131, 150])}>Slow</button>
          <button className="btn sm ghost" onClick={() => fillPreset(1, [50, 69, 88, 107, 126, 132, 138, 144, 150])}>Quick</button>
          <button
            className="btn sm ghost"
            title="Copy this stick's pad curve to the other stick"
            onClick={() => {
              const src = which === 0 ? padRight : padLeft
              setDesign(src.map((p) => ({ ...p })))
            }}
          >
            {t('sticks.copyCurve')}
          </button>
        </div>
        <div className="note" style={{ marginTop: 8 }}>Fixed 9 points per stick — no add/remove. X positions are hardware slots.</div>
        <table className="tbl" style={{ marginTop: 8 }}>
          <thead><tr><th>#</th><th>X</th><th>Y</th></tr></thead>
          <tbody>
            {design.map((p, i) => (
              <tr key={i}>
                <td className="mono">{i + 1}</td>
                <td><input className="input" type="number" min={0} max={255} value={p.x} disabled /></td>
                <td><input className="input" type="number" min={0} max={150} value={FLY_D2P(p.y)} onChange={(e) => {
                  const v = Math.max(0, Math.min(150, Number(e.target.value)))
                  if (!Number.isFinite(v)) return
                  onDesign(design.map((q, j) => (j === i ? { ...q, y: FLY_P2D(v) } : q)))
                }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="note" style={{ marginTop: 8 }}>
          Pad bytes (exact, no quantization): <span className="mono">{padDesign.map((q) => `${FLY_D2P(q.y)}`).join(' · ')}</span>
        </div>
        {msg && <div className="note" style={{ marginTop: 8 }}>{msg}</div>}
        {err && <div className="note bad" style={{ marginTop: 8 }}>{err}</div>}
      </div>
        <div className="card">
          <h3>{t('sticks.shape')}</h3>
          <div className="row"><Help title="About this control">Three shapes for this stick — processing on for the first two, fully bypassed for raw. This pad has no shape flags: output always follows the curve.</Help></div>
          <div className="stack" style={{ gap: 8 }}>
            {['Round diagonals', 'Square gate', 'Pure raw 1:1'].map((name) => (
              <button key={name} className="btn sm ghost" disabled title="No processing-flag equivalent on this pad">{name}</button>
            ))}
          </div>
        </div>
        <div className="card" style={{ borderColor: 'var(--bad)' }}>
          <h3>{t('sticks.reset')}</h3>
          <div className="row"><Help title="About this control">Returns both curves to the Slow baseline. Polling, precision and names are untouched. Then Send to apply.</Help></div>
          <button
            className="btn danger"
            style={{ width: '100%', padding: '14px', fontSize: 15, fontWeight: 700, letterSpacing: '0.08em', marginTop: 10 }}
            onClick={() => resetAll()}
          >
            {t('sticks.resetAll')}
          </button>
        </div>
      </div>
    </div>
  )
}


function StickCross({ lx, ly, rx, ry }: { lx: number; ly: number; rx: number; ry: number }): JSX.Element {
  const ref = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    const w = c.clientWidth
    const h = 190
    c.width = w * dpr
    c.height = h * dpr
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    const draw = (x: number, y: number, cx: number, label: string): void => {
      const r = 62
      ctx.strokeStyle = '#3a2230'
      ctx.beginPath()
      ctx.arc(cx, h / 2, r, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(cx - r, h / 2)
      ctx.lineTo(cx + r, h / 2)
      ctx.moveTo(cx, h / 2 - r)
      ctx.lineTo(cx, h / 2 + r)
      ctx.stroke()
      const nx = (x - 128) / 128
      const ny = (y - 128) / 128
      const px = cx + nx * r
      const py = h / 2 + ny * r
      ctx.fillStyle = '#f43f52'
      ctx.beginPath()
      ctx.arc(px, py, 7, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#c9a3ad'
      ctx.font = '11px system-ui'
      ctx.fillText(label, cx - 12, h - 8)
    }
    draw(lx, ly, w * 0.27, `L ${lx},${ly}`)
    draw(rx, ry, w * 0.73, `R ${rx},${ry}`)
  }, [lx, ly, rx, ry])
  return <canvas ref={ref} className="plot" style={{ height: 190 }} />
}
