import { isWebVersion } from './api'
import { DesktopRequired, WEB_DESKTOP_PAGES } from './DesktopRequired'
import { ProfilesPage } from './ProfilesPage'
import appIcon from './assets/app-icon.png'
import { PureRawReconnect } from './PureRawReconnect'
import { applyPureRawProcessing } from '@shared/pure-raw'
import { ControllerPreview } from './ControllerPreview'
import { ThemeSettings, useThemeRevision } from './ThemeSettings'
import { StickRangePreview } from './TuningPreviews'
import { RangeControl } from './RangeControl'
import { stageCurve } from '@shared/curve-staging'
import { LeadJoyPanel } from './LeadJoyPanel'
import { SHIFT_SLOT, copyToShift } from '@shared/shift'
import { AIM_CURVES } from '@shared/aim-curves'
import { KeyIcon } from './KeyIcon'
import { resampleSpline, traceSpline } from '@shared/sticklab'
import { ApexDevice, ApexSticks } from './FlydigiPanel'
import { flyTransport, type FlyIdentity } from './flydigiUsb'
import { GameGuardWarning } from './GameGuards'
import { ApexWarning } from './ApexWarning'
import { TermsGate } from './TermsGate'
import { Help, SectionTitle } from './Help'
import { FirmwarePanel } from './Firmware'
import { PerformanceBench } from './PerformanceBench'
import { useEffect, useMemo, useRef, useState } from 'react'
import { TriggerTuning, GyroTuning } from './Tuning'
import { CalibrationPanel } from './Calibration'
import { RcFilters } from './RcFilters'
import { CenterOffsets } from './CenterOffsets'
import { Bindings } from './Bindings'
import { Macros } from './Macros'
import { QuitWarning } from './QuitWarning'
import { api, b64ToBytes, bytesToB64, type Candidate, type DeviceInfo, type LiveSample } from './api'
import { parseProfile, serializeProfile, fun, stick, LINEAR_CURVE, looksLikeCEProfile, Packet } from '@shared/profile'
import { PROFILE_LENGTH, REPORT_RATE_OPTIONS, STICK_RESOLUTION_OPTIONS } from '@shared/protocol'
import { identifyModel, MODELS, type ControllerModel } from '@shared/models'
import {
  describeRawResolution,
  bitsToLevels,
  bitsToWireRaw,
  EXTENDED_BITS,
  resampleCurve,
  addDesignPoint,
  DESIGN_MIN_POINTS,
  DESIGN_MAX_POINTS,
  outerBufferFromBytes,
  isOuterUnlimited
} from '@shared/sticklab'
import { fitCurveExponent } from '@shared/steamcfg'
import type { MariusConfig, MariusIdentity } from '@shared/marius'
import { mariusDisplayName } from '@shared/marius'

const PAGE_INFO = {
  sticks: ['Sticks', 'Choose a stick, tune its response, then write to apply.'],
  device: ['Device', 'Report rate, resolution and controller output settings.'],
  triggers: ['Triggers', 'Tune left and right trigger travel independently.'],
  gyro: ['Gyro', 'Configure activation, output and motion response.'],
  rc: ['RC filters', 'Filter controls, background resets and measured comparisons.'],
  center: ['Center offsets', 'Drag or nudge the resting center of each stick.'],
  bindings: ['Keybindings', 'Choose a physical button and assign its outputs.'],
  macros: ['Macros', 'Record, arrange and time a button sequence.'],
  profiles: ['Profiles', 'Manage controller backups and browse community profiles.'],
  lab: ['Performance bench', 'Measure input timing, stick behavior and bit-depth changes.'],
  steam: ['Steam export', 'Design settings and export them to installed Steam games.'],
  calibrate: ['Calibration', 'Choose a workflow and follow the controller’s progress.'],
  firmware: ['Firmware', 'Firmware selection, flashing and recovery information.'],
  marius: ['Marius board', 'Read-only identity, configuration and live stick preview.']
} as const

/** Stick deadzone packet → whole percent for the Steam exporter. */
function deadzonePct(pkt: import('@shared/profile').Packet): { begin: number; end: number; anti: number } {
  const d = stick.deadzone(pkt)
  return { begin: d.begin / 10, end: d.end / 10, anti: d.beginAnti / 10 }
}

function Slider(props: {  label: string
  value: number
  min: number
  max: number
  step: number
  unit?: string
  onChange: (v: number) => void
  format?: (v: number) => string
}): JSX.Element {
  if (props.unit === '%' && !props.label.includes('Outer reach')) return <RangeControl label={props.label} value={props.value} min={props.min} max={props.max} step={props.step} onChange={props.onChange} />
  return (
    <div className="slider-field">
      <div className="row spread">
        <span className="row" style={{ gap: 6 }}><span className="label">{props.label.split(' (')[0]}</span>{props.label.includes(' (') && <Help title={props.label.split(' (')[0]}>{props.label}</Help>}</span>
        <span className="mono">{props.format ? props.format(props.value) : `${props.value}${props.unit ?? ''}`}</span>
      </div>
      <input
        type="range"
        aria-label={props.label}
        className="input"
        style={{ width: '100%' }}
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </div>
  )
}

function CurvePlot({ points, onChange, overlay, smooth = false }: { points: Array<{ x: number; y: number }>; onChange?: (next: Array<{ x: number; y: number }>) => void; smooth?: boolean
  overlay?: Array<{ x: number; y: number }> }): JSX.Element {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const drag = useRef<number | null>(null)
  const themeRevision = useThemeRevision()

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
    const lo = i > 0 ? next[i - 1].x : 0
    const hi = i < next.length - 1 ? next[i + 1].x : 255
    next[i] = { x: Math.max(lo, Math.min(hi, x)), y }
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
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--line').trim()
    for (let i = 0; i <= 4; i++) {
      const t = (i / 4) * (w - pad * 2) + pad
      ctx.beginPath()
      ctx.moveTo(t, pad)
      ctx.lineTo(t, h - pad)
      ctx.stroke()
    }
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--line-2').trim()
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(toX(0), toY(0))
    ctx.lineTo(toX(255), toY(255))
    ctx.stroke()
    ctx.setLineDash([])
    // Max X / Y boundary lines (255 edges) with labels.
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--good').trim()
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(toX(255), pad)
    ctx.lineTo(toX(255), h - pad)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(pad, toY(255))
    ctx.lineTo(w - pad, toY(255))
    ctx.stroke()
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--good').trim()
    ctx.font = '10px system-ui'
    ctx.fillText('X max 255', toX(255) - 52, pad + 11)
    ctx.fillText('Y max 255', pad + 4, toY(255) + 13)
    // Endpoint projections: actual max X / max Y reached by the design.
    if (points.length > 0) {
      const maxX = Math.max(...points.map((p) => p.x))
      const maxY = Math.max(...points.map((p) => p.y))
      ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--warn').trim()
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
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--warn').trim()
      ctx.fillText(`max X ${maxX}`, Math.min(toX(maxX) + 5, w - 52), h - pad - 5)
      ctx.fillText(`max Y ${maxY}`, pad + 4, toY(maxY) - 5)
    }
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
    ctx.lineWidth = 2
    ctx.beginPath()
    const line = smooth ? traceSpline(points) : points
    line.forEach((p, i) => {
      if (i === 0) ctx.moveTo(toX(p.x), toY(p.y))
      else ctx.lineTo(toX(p.x), toY(p.y))
    })
    ctx.stroke()
    if (overlay) {
      ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--warn').trim()
      ctx.setLineDash([5, 4])
      ctx.beginPath()
      overlay.forEach((p, i) => {
        if (i === 0) ctx.moveTo(toX(p.x), toY(p.y))
        else ctx.lineTo(toX(p.x), toY(p.y))
      })
      ctx.stroke()
      ctx.setLineDash([])
      overlay.forEach((p) => {
        ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--warn').trim()
        ctx.lineWidth = 1.5
        ctx.strokeRect(toX(p.x) - 3.5, toY(p.y) - 3.5, 7, 7)
      })
      ctx.lineWidth = 2
    }
    points.forEach((p) => {
      ctx.fillStyle = drag.current !== null ? getComputedStyle(document.documentElement).getPropertyValue('--warn').trim() : getComputedStyle(document.documentElement).getPropertyValue('--accent-2').trim()
      ctx.beginPath()
      ctx.arc(toX(p.x), toY(p.y), 5, 0, Math.PI * 2)
      ctx.fill()
    })
  }, [points, overlay, smooth, themeRevision])
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

function SteamCard({ left, right, mouseRate, fittedK }: { left: { begin: number; end: number } | null; right: { begin: number; end: number } | null; mouseRate: number | null; fittedK: number | null }): JSX.Element {
  const [info, setInfo] = useState<{ steamPath: string | null; userId: string | null; apexInstalled: boolean; apexAppId: number; steamRunning: boolean } | null>(null)
  const [games, setGames] = useState<Array<{ appId: number; name: string }>>([])
  const [busy, setBusy] = useState(false)
  const [tryCurve, setTryCurve] = useState(false)
  const [result, setResult] = useState<{ game: string; files: string[]; backedUp: string[]; mapped: string[]; notTransferred: string[] } | null>(null)
  const [bulk, setBulk] = useState<Array<{ appId: number; name: string; ok: boolean; detail: string }> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void api().steamInfo().then(setInfo).catch(() => undefined)
    void api().steamGames().then(setGames).catch(() => undefined)
  }, [])

  async function run(): Promise<void> {
    if (!left || !right) return
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      setResult(await api().steamExport(left, right, mouseRate, tryCurve ? fittedK : null))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function runAll(): Promise<void> {
    if (!left || !right) return
    setBusy(true)
    setError(null)
    setBulk(null)
    try {
      const res = await api().steamExportAll(left, right, mouseRate, tryCurve ? fittedK : null)
      setGames(res.games)
      setBulk(res.result.games)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const okCount = bulk?.filter((g) => g.ok).length ?? 0

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="section-title"><h3>Export to Steam — any controller</h3><Help title="Export to Steam — any controller">Writes your deadzones + Controller Rate pick into Steam's files so any Steam pad plays them.</Help></div>
      <label className="row" style={{ gap: 8, marginTop: 8, fontSize: 12.5 }}>
        <input
          type="checkbox"
          checked={tryCurve}
          disabled={fittedK === null}
          onChange={(e) => setTryCurve(e.target.checked)}
        />
        <span>
          Experimental curve fit{fittedK !== null ? ` (right stick ≈ exponent ${fittedK})` : ' (connect a pad first)'} — direction unconfirmed, may feel inverted. Tell me how it feels.
        </span>
      </label>
      <div className="row wrap" style={{ gap: 8, margin: '10px 0', fontSize: 12 }}>
        <span className="pill">{info ? (info.steamPath ? `Steam found${info.userId ? ` · user ${info.userId}` : ''}` : 'Steam not found') : 'Detecting Steam…'}</span>
        <span className="pill">{games.length > 0 ? `${games.length} games detected` : 'Scanning library…'}</span>
        {info?.steamRunning && <span className="pill bad">Steam is running — close it first</span>}
      </div>
      <div className="row wrap" style={{ gap: 8 }}>
        <button
          className="btn sm"
          disabled={busy || !left || !right || !info?.steamPath || !info?.apexInstalled}
          onClick={() => void run()}
        >
          {busy ? 'Writing…' : 'Apex only'}
        </button>
        <button
          className="btn sm primary"
          disabled={busy || !left || !right || !info?.steamPath || games.length === 0}
          onClick={() => void runAll()}
        >
          {busy ? 'Writing…' : `All ${games.length} games`}
        </button>
      </div>
      {!left && <div className="note" style={{ marginTop: 8 }}>Connect a pad and load a profile first — the export uses your current sticks.</div>}
      {error && <div className="note bad" style={{ marginTop: 8 }}>{error}</div>}
      {result && (
        <div className="stack" style={{ gap: 6, marginTop: 10, fontSize: 12.5 }}>
          <div className="note">Apex done{result.backedUp.length > 0 ? ` (old files kept as .bak)` : ''}. Restart Steam, then enable Steam Input for Apex.</div>
          {result.mapped.map((m) => <span key={m}>✓ {m}</span>)}
          {result.notTransferred.map((m) => <span key={m} style={{ color: 'var(--text-3)' }}>– {m}</span>)}
        </div>
      )}
      {bulk && (
        <div className="stack" style={{ gap: 6, marginTop: 10, fontSize: 12.5 }}>
          <div className="note">{okCount}/{bulk.length} games written — restart Steam afterwards. Old files kept as .bak next to each config.</div>
          <div className="log" style={{ maxHeight: 160 }}>
            {bulk.map((g) => (
              <div key={g.appId}>
                <span className={g.ok ? 'resp' : 'cmd'}>{g.ok ? 'OK  ' : 'FAIL'}</span> {g.name} <span className="t">{g.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}


interface SlotEntry {
  index: number
  name: string | null
  bytes: Uint8Array | null
  loading: boolean
  error: string | null
}

function download(filename: string, data: Uint8Array | string): void {
  const blob =
    typeof data === 'string'
      ? new Blob([data], { type: 'application/json' })
      : new Blob([data.buffer as ArrayBuffer], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function LockedDump({ modelId, modelName, defaultLength }: { modelId: string; modelName: string | null; defaultLength: number }): JSX.Element {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [length, setLength] = useState(defaultLength)

  async function run(): Promise<void> {
    const len = Math.max(100, Math.min(4096, Math.round(Number(length) || 0)))
    if (!len) {
      setMessage('Enter a byte length first (try 680, 1070 or 1935).')
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const dump: Record<string, { name: string; bytes: string }> = {}
      let allZero = true
      for (const s of [1, 2, 3, 4]) {
        const res = await api().readProfile(s, len)
        const bytes = b64ToBytes(res.bytes)
        if (bytes.some((b) => b !== 0)) allZero = false
        let name = ''
        try {
          name = parseProfile(bytes, modelId).name
        } catch {
          name = ''
        }
        dump[String(s)] = { name, bytes: bytesToB64(bytes) }
      }
      if (allZero) {
        setMessage('All slots read back empty — wrong length, or the pad is not answering. Try 680 / 1070 / 1935.')
        return
      }
      download(
        `sticklabs-dump-${modelId}-${new Date().toISOString().slice(0, 10)}.json`,
        JSON.stringify({ version: 1, app: 'stick-labs-dump', model: modelId, length: len, profiles: dump }, null, 2)
      )
      setMessage('Dump downloaded — send it to RealKiyoshi to unlock this model.')
    } catch (e) {
      setMessage(`Dump failed: ${(e as Error).message} — try another length (680 / 1070 / 1935).`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="section-title"><h3>Locked — {modelName ?? 'unknown model'}</h3><Help title="Control details">Profile backup is disabled for this model — its profile layout is unverified, so reads and writes stay off. A read-only dump helps unlock it.</Help></div>
      <div className="row" style={{ gap: 8, marginTop: 10 }}>
        <input
          className="input"
          style={{ width: 110 }}
          type="number"
          min={100}
          max={4096}
          value={length}
          onChange={(e) => setLength(Number(e.target.value))}
        />
        <button
          className="btn sm"
          disabled={busy}
          title="Read-only: dumps all 4 slots for support analysis. Writes nothing."
          onClick={() => void run()}
        >
          {busy ? 'Reading…' : 'Export raw dump for support'}
        </button>
        {message && <span className="pill">{message}</span>}
      </div>
    </div>
  )
}

function MariusPanel(): JSX.Element {
  const [cands, setCands] = useState<Array<{ path: string; productId: number; product: string | undefined; manufacturer: string | undefined }>>([])
  const [session, setSession] = useState<{ identity: MariusIdentity; bInterval: number; pollHz: number } | null>(null)
  const [config, setConfig] = useState<MariusConfig | null>(null)
  const [raw, setRaw] = useState<{ left: { x: number; y: number }; right: { x: number; y: number } } | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  async function scan(): Promise<void> {
    setErr(null)
    setBusy(true)
    try {
      const list = await api().mariusDiscover()
      setCands(list)
      setMsg(`Found ${list.length} 0x054C:0x05C4 interface(s). This ID is shared with real DualShock 4 — the family gate applies on connect.`)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function connect(path: string, selectedCandidate?: Candidate): Promise<void> {
    setErr(null)
    setMsg(null)
    setBusy(true)
    try {
      const s = await api().mariusConnect(path)
      setSession(s)
      setConfig(null)
      setRaw(null)
      setMsg(`Connected — ${mariusDisplayName(s.identity)}.`)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function read(): Promise<void> {
    setErr(null)
    setBusy(true)
    try {
      const res = await api().mariusReadConfig()
      setConfig(res.parsed)
      setMsg('Config read (256 B). Display only — nothing was written.')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function sample(): Promise<void> {
    setErr(null)
    setBusy(true)
    try {
      setRaw(await api().mariusReadRaw())
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function disc(): Promise<void> {
    setErr(null)
    try {
      await api().mariusDisconnect()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setSession(null)
      setConfig(null)
      setRaw(null)
    }
  }

  const id = session?.identity ?? null
  const fullScale = id ? 2 ** id.family.bits : 4096
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="card" style={{ borderColor: 'var(--warn)' }}>
        <div className="section-title"><h3>Marius board — read-only preview</h3><Help title="Marius board — read-only preview">Reverse-engineered from the public setup web app — <strong>unverified against hardware</strong>. This build has no write path: connect, identity and config reads only. Setup mode: hold PS while plugging USB.</Help></div>
        <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
          <button className="btn sm" disabled={busy} onClick={() => void scan()}>Scan USB</button>
          {session && (
            <>
              <button className="btn sm" disabled={busy} onClick={() => void read()}>Read config</button>
              <button className="btn sm" disabled={busy} onClick={() => void sample()}>Sample sticks</button>
              <button className="btn sm ghost" disabled={busy} onClick={() => void disc()}>Disconnect</button>
            </>
          )}
        </div>
        {msg && <div className="note" style={{ marginTop: 8 }}>{msg}</div>}
        {err && <div className="note bad" style={{ marginTop: 8 }}>{err}</div>}
        {!session && cands.length > 0 && (
          <table className="tbl" style={{ marginTop: 8 }}>
            <thead><tr><th>Product</th><th>PID</th><th></th></tr></thead>
            <tbody>
              {cands.map((c) => (
                <tr key={c.path}>
                  <td>{c.product ?? '?'}</td>
                  <td className="mono">0x{c.productId.toString(16)}</td>
                  <td><button className="btn sm" disabled={busy} onClick={() => void connect(c.path)}>Connect</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {id && session && (
        <div className="card">
          <h3>{mariusDisplayName(id)}</h3>
          <div className="mono" style={{ fontSize: 11, marginBottom: 4 }}>firmware string: {id.name || '?'}</div>
          <div className="row wrap" style={{ gap: 6, margin: '8px 0' }}>
            <span className="pill good">{id.family.line} / {id.family.variant}</span>
            <span className="pill">{id.family.bits}-bit raw</span>
            <span className="pill">fw {id.versionMajor}.{id.versionMinor}</span>
            <span className="pill">rev {id.hwRev}</span>
            <span className="pill">{session.pollHz.toLocaleString()} Hz</span>
          </div>
          <div className="mono" style={{ fontSize: 11 }}>uid {id.uid} · build {id.buildDate || '?'}</div>
        </div>
      )}
      {config && (
        <details className="card"><summary>Technical board configuration</summary>

          <div className="row wrap" style={{ gap: 6, margin: '8px 0' }}>
            <span className={`pill${config.valid ? ' good' : ' bad'}`}>{config.valid ? 'valid (v2 + marker)' : 'INVALID — do not trust'}</span>
            {config.curvesPresent && <span className="pill">curves blob ({config.curvesLength} B)</span>}
            {config.rightEffectiveBitsPresent && <span className="pill">per-stick bits</span>}
          </div>
          <table className="tbl">
            <tbody>
              <tr><td className="mono">center L/R</td><td className="mono">({config.center.lx}, {config.center.ly}) · ({config.center.rx}, {config.center.ry})</td></tr>
              <tr><td className="mono">range L</td><td className="mono">x {config.rangeLeft.xMin}–{config.rangeLeft.xMax} · y {config.rangeLeft.yMin}–{config.rangeLeft.yMax}</td></tr>
              <tr><td className="mono">range R</td><td className="mono">x {config.rangeRight.xMin}–{config.rangeRight.xMax} · y {config.rangeRight.yMin}–{config.rangeRight.yMax}</td></tr>
              <tr><td className="mono">deadzone L/R</td><td className="mono">{config.deadzone.leftIn}%/{config.deadzone.leftOut}% · {config.deadzone.rightIn}%/{config.deadzone.rightOut}%</td></tr>
              {config.extDeadzone && <tr><td className="mono">ext dz L/R</td><td className="mono">{config.extDeadzone.leftIn}%/{config.extDeadzone.leftOut}% · {config.extDeadzone.rightIn}%/{config.extDeadzone.rightOut}%</td></tr>}
              <tr><td className="mono">triggers</td><td className="mono">L2 {config.triggers.l2Start}/{config.triggers.l2End} · R2 {config.triggers.r2Start}/{config.triggers.r2End} · hair {config.hairPct}%</td></tr>
              <tr><td className="mono">out bits L/R</td><td className="mono">{config.leftEffectiveBits === 0 || config.leftEffectiveBits === 0xff ? 'full' : config.leftEffectiveBits} · {config.rightEffectiveBits === 0 || config.rightEffectiveBits === 0xff ? 'full' : config.rightEffectiveBits}</td></tr>
              <tr><td className="mono">invert</td><td className="mono">LX{config.invert.lx ? '±' : ''} LY{config.invert.ly ? '±' : ''} RX{config.invert.rx ? '±' : ''} RY{config.invert.ry ? '±' : ''}</td></tr>
            </tbody>
          </table>
        </details>
      )}
      {raw && (
        <div className="card">
          <h3>Raw sticks — full scale {fullScale.toLocaleString()}</h3>
          <div className="mono">L ({raw.left.x}, {raw.left.y}) · R ({raw.right.x}, {raw.right.y})</div>
        </div>
      )}
    </div>
  )
}

function ProfilesPanel({ connected, activeSlot, locked, modelId, modelLen, dumpLength, modelName }: { connected: boolean; activeSlot: number | null; locked: boolean; modelId: string; modelLen: number; dumpLength: number; modelName: string | null }): JSX.Element {
  const [entries, setEntries] = useState<SlotEntry[]>([1, 2, 3, 4].map((index) => ({ index, name: null, bytes: null, loading: false, error: null })))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const update = (index: number, patch: Partial<SlotEntry>): void => {
    setEntries((prev) => prev.map((e) => (e.index === index ? { ...e, ...patch } : e)))
  }

  async function readSlot(index: number): Promise<Uint8Array> {
    update(index, { loading: true, error: null })
    try {
      const res = await api().readProfile(index, modelLen)
      const bytes = b64ToBytes(res.bytes)
      let name = ''
      try {
        name = parseProfile(bytes, modelId).name
      } catch {
        name = ''
      }
      update(index, { bytes, name, loading: false })
      return bytes
    } catch (e) {
      update(index, { loading: false, error: (e as Error).message })
      throw e
    }
  }

  async function refreshAll(): Promise<void> {
    setBusy(true)
    setMessage(null)
    // Sequential, not parallel: five concurrent 19-chunk reads on one handle
    // bury each other and surface as `timed out waiting for cmd 0x4`.
    let failed = 0
    for (const i of [1, 2, 3, 4]) {
      try {
        await readSlot(i)
      } catch {
        failed++
      }
    }
    setMessage(failed ? `${failed} slot(s) failed to read — Retry them individually` : 'Read all 4 stick profiles')
    setBusy(false)
  }

  useEffect(() => {
    if (!connected) return
    // Let the main editor's slot read finish first before starting ours.
    const t = window.setTimeout(() => void refreshAll(), 2000)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected])

  async function exportSlot(entry: SlotEntry, format: 'bin' | 'json'): Promise<void> {
    const bytes = entry.bytes ?? (await readSlot(entry.index))
    const base = (entry.name || `profile-${entry.index}`).replace(/[^\w-]+/g, '_') || `profile-${entry.index}`
    if (format === 'bin') {
      download(`${base}.sticklab.bin`, bytes)
    } else {
      download(`${base}.sticklab.json`, JSON.stringify({ version: 1, app: 'g7-stick-lab', model: modelId, index: entry.index, name: parseProfile(bytes, modelId).name, bytes: bytesToB64(bytes) }, null, 2))
    }
  }

  function handleImport(entry: SlotEntry): void {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.bin,.json,.g7p'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        let bytes: Uint8Array
        if (file.name.endsWith('.json')) {
          const parsed = JSON.parse(await file.text()) as { bytes?: string }
          if (!parsed.bytes) throw new Error('JSON file has no bytes field')
          bytes = b64ToBytes(parsed.bytes)
        } else {
          bytes = new Uint8Array(await file.arrayBuffer())
        }
        if (bytes.length !== modelLen) throw new Error(`expected ${modelLen} bytes, got ${bytes.length}`)
        setBusy(true)
        const result = await api().writeProfile(entry.index, bytesToB64(bytes), modelLen)
        if (!result.verified) throw new Error(result.rolledBack ? 'rejected — previous contents restored' : 'did not verify')
        setMessage(`Imported ${file.name} → P${entry.index} · verified`)
        await readSlot(entry.index)
      } catch (e) {
        setMessage(`Import failed: ${(e as Error).message}`)
      } finally {
        setBusy(false)
      }
    }
    input.click()
  }

  async function copyTo(from: SlotEntry, toIndex: number): Promise<void> {
    if (!window.confirm(`Overwrite P${toIndex} with P${from.index}?`)) return
    try {
      const bytes = from.bytes ?? (await readSlot(from.index))
      setBusy(true)
      const result = await api().writeProfile(toIndex, bytesToB64(bytes))
      if (!result.verified) throw new Error(result.rolledBack ? 'rejected — previous contents restored' : 'did not verify')
      setMessage(`Copied P${from.index} → P${toIndex} · verified`)
      await readSlot(toIndex)
    } catch (e) {
      setMessage(`Copy failed: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function backupAll(): Promise<void> {
    setBusy(true)
    try {
      const dump: Record<string, { name: string; bytes: string }> = {}
      for (const slot of [1, 2, 3, 4]) {
        const bytes = await readSlot(slot)
        dump[String(slot)] = { name: parseProfile(bytes, modelId).name, bytes: bytesToB64(bytes) }
      }
      download(`sticklab-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ version: 1, app: 'g7-stick-lab', device: 'G7ProCE', profiles: dump }, null, 2))
      setMessage('Backup downloaded')
    } catch (e) {
      setMessage(`Backup failed: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  function restoreAll(): void {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      const written: string[] = []
      try {
        const parsed = JSON.parse(await file.text()) as { profiles?: Record<string, { name?: string; bytes?: string }> }
        const slots = Object.entries(parsed.profiles ?? {})
          .map(([slot, entry]) => ({ slot: Number(slot), entry }))
          .filter((x) => Number.isInteger(x.slot) && x.slot >= 1 && x.slot <= 4 && !!x.entry?.bytes)
        if (slots.length === 0) throw new Error('that file holds no profiles')
        if (!window.confirm(`Write ${slots.length} profile(s)? ${slots.map((x) => `P${x.slot} ${x.entry.name || ''}`).join(', ')}`)) return
        setBusy(true)
        for (const { slot, entry } of slots) {
          const bytes = b64ToBytes(entry.bytes as string)
          if (bytes.length !== modelLen) throw new Error(`P${slot}: expected ${modelLen} bytes, got ${bytes.length}`)
          const result = await api().writeProfile(slot, bytesToB64(bytes), modelLen)
          if (!result.verified) throw new Error(result.rolledBack ? `P${slot} rejected — restored` : `P${slot} did not verify`)
          written.push(`P${slot}`)
          await readSlot(slot)
        }
        setMessage(`Restored ${written.join(', ')} · all verified`)
      } catch (e) {
        setMessage(`Restore failed: ${written.length ? `restored ${written.join(', ')} before failing — ` : ''}${(e as Error).message}`)
      } finally {
        setBusy(false)
      }
    }
    input.click()
  }

  if (!connected) return <div className="note">Connect a controller to manage stick profiles.</div>
  if (locked) {
    return (
      <LockedDump
        modelId={modelId}
        modelName={modelName}
        defaultLength={dumpLength > 0 ? dumpLength : 680}
      />
    )
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="section-title"><h3>Stick profiles — backup &amp; transfer</h3><Help title="Stick profiles — backup &amp; transfer">Each slot is a 1070-byte blob; this card only reads/writes whole slots, so stick bytes are never half-merged.</Help></div>
      <div className="row wrap" style={{ gap: 8, margin: '10px 0' }}>
        <button className="btn sm" disabled={busy} onClick={() => void refreshAll()}>{busy ? 'Working…' : 'Read all from controller'}</button>
        <button className="btn sm" disabled={busy} onClick={() => void backupAll()}>Backup all → JSON</button>
        <button className="btn sm" disabled={busy} onClick={restoreAll}>Restore all → controller</button>
        {message && <span className="pill">{message}</span>}
      </div>
      <table className="tbl">
        <thead><tr><th>Slot</th><th>Name</th><th>Active</th><th>Actions</th></tr></thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.index}>
              <td className="mono">P{entry.index}</td>
              <td>{entry.loading ? 'reading…' : entry.error ? <span style={{ color: 'var(--bad)' }}>{entry.error} <button className="btn sm ghost" disabled={busy} onClick={() => void readSlot(entry.index)}>Retry</button></span> : (entry.name || <span style={{ color: 'var(--text-3)' }}>unnamed</span>)}</td>
              <td>{entry.index === activeSlot ? <span className="pill good">current</span> : <span className="tag">—</span>}</td>
              <td>
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn sm ghost" disabled={busy} onClick={() => void exportSlot(entry, 'bin')}>Export</button>
                  <button className="btn sm ghost" disabled={busy} onClick={() => void exportSlot(entry, 'json')}>JSON</button>
                  <button className="btn sm ghost" disabled={busy} onClick={() => handleImport(entry)}>Import…</button>
                  <select className="input" style={{ width: 110 }} disabled={busy} value="" onChange={(e) => { if (e.target.value) void copyTo(entry, Number(e.target.value)) }}>
                    <option value="">Copy to…</option>
                    {[1, 2, 3, 4].filter((s) => s !== entry.index).map((s) => <option key={s} value={s}>P{s}</option>)}
                  </select>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StickCross({ lx, ly, rx, ry }: { lx: number; ly: number; rx: number; ry: number }): JSX.Element {
  const themeRevision = useThemeRevision()
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
      ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--line').trim()
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
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
      ctx.beginPath()
      ctx.arc(px, py, 7, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-2').trim()
      ctx.font = '11px system-ui'
      ctx.fillText(label, cx - 12, h - 8)
    }
    draw(lx, ly, w * 0.27, `L ${lx},${ly}`)
    draw(rx, ry, w * 0.73, `R ${rx},${ry}`)
  }, [lx, ly, rx, ry, themeRevision])
  return <canvas ref={ref} className="plot" style={{ height: 190 }} />
}

export default function App(): JSX.Element {
  return <>{!isWebVersion() && <><QuitWarning /><ApexWarning /><GameGuardWarning /></>}<TermsGate><AppContent /><ThemeSettings /></TermsGate></>
}

function AppContent(): JSX.Element {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [connPath, setConnPath] = useState<string | null>(null)
  // Idle receivers (all-zero frames) are hidden; the open handle and
  // unopenable handles always stay visible. If nothing proves live, show
  // everything rather than an empty list. Receiver interfaces (0x0575) are
  // hidden whenever a direct pad interface is present — they only stay when
  // wireless-through-receiver is the sole path.
  const knownPadPids = MODELS.flatMap((m) => m.pids)
  const hasDirectPad = candidates.some((c) => knownPadPids.includes(c.productId) && c.live === true)
  const visibleCandidates = (
    candidates.some((c) => c.live === true) ? candidates.filter((c) => c.live === true || c.live === null || c.path === connPath) : candidates
  ).filter((c) => !(c.productId === 0x0575 && hasDirectPad))
  const [leadjoyPath,setLeadjoyPath]=useState<string|null>(null)
  const [connected, setConnected] = useState(false)
  const [info, setInfo] = useState<DeviceInfo | null>(null)
  const [pid, setPid] = useState<number | null>(null)
  const [model, setModel] = useState<ControllerModel | null>(null)
  const [slot, setSlot] = useState<number>(() => {
    try { const saved = Number(localStorage.getItem('sticklabs.slot')); if (Number.isInteger(saved) && saved >= 1 && saved <= 4) return saved } catch { /* session default */ }
    return 3
  })
  useEffect(() => { try { localStorage.setItem('sticklabs.slot', String(slot === SHIFT_SLOT ? 3 : slot)) } catch { /* session only */ } }, [slot])
  const [blob, setBlob] = useState<Uint8Array | null>(null)
  const currentBlob = useRef(blob); currentBlob.current = blob
  const [dirty, setDirty] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [which, setWhich] = useState(0)
  const [outputLocks, setOutputLocks] = useState<[boolean, boolean]>(() => {
    try { const v = JSON.parse(localStorage.getItem('sticklabs.outputLocks') ?? 'null'); if (Array.isArray(v) && v.length === 2 && v.every(x => typeof x === 'boolean')) return v as [boolean, boolean] } catch { /* default unlocked */ }
    return [false, false]
  })
  useEffect(() => { try { localStorage.setItem('sticklabs.outputLocks', JSON.stringify(outputLocks)) } catch { /* session only */ } }, [outputLocks])
  const [live, setLive] = useState<LiveSample | null>(null)
  const [pureRecoveryRunning,setPureRecoveryRunning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loadId, setLoadId] = useState(0)
  const [bitCustom, setBitCustom] = useState('')
  const [savedAt, setSavedAt] = useState<{ slot: number; at: number } | null>(null)
  const [flyId, setFlyId] = useState<FlyIdentity | null>(null)
  const [tab, setTab] = useState<'sticks' | 'device' | 'triggers' | 'gyro' | 'rc' | 'center' | 'bindings' | 'macros' | 'profiles' | 'lab' | 'steam' | 'calibrate' | 'firmware' | 'marius'>('sticks')
  // Virtual sticks for pad-less Steam shaping: real packets, never written
  // to hardware — the Steam exporter reads these when no profile is loaded.
  const [vSticks] = useState(() => {
    const make = (): Packet => {
      const p = new Packet(new Uint8Array(36))
      p.setU8(0, 1)
      p.setU8(2, 1)
      stick.setDeadzone(p, { begin: 0, end: 1000, beginAnti: 0, endAnti: 1000 })
      stick.setCurve(p, LINEAR_CURVE.map((c) => ({ ...c })))
      stick.markCurveIdentity(p)
      p.setU8(27, 50)
      return p
    }
    return [make(), make()]
  })
  const [vMouse, setVMouse] = useState<number | null>(null)
  // Virtual curve design for Steam export (2–10 pts). Fitted to a single
  // exponent on export — approximate by nature, stated in the UI.
  const [vDesign, setVDesign] = useState<Array<{ x: number; y: number }>>([
    { x: 0, y: 0 }, { x: 64, y: 64 }, { x: 128, y: 128 }, { x: 191, y: 191 }, { x: 255, y: 255 }
  ])
  const [measuring, setMeasuring] = useState<{ left: number; suggestion: { dev: number; pct10: number } | null } | null>(null)
  const wanderRef = useRef(0)
  const modelLenRef = useRef(PROFILE_LENGTH)
  // The device-event effect below runs once, so its closures go stale — these
  // refs keep the reconnect handler pointed at the live slot + dirty flag.
  const slotRef = useRef(slot)
  slotRef.current = slot
  const dirtyRef = useRef(false)
  dirtyRef.current = dirty
  const [appVersion, setAppVersion] = useState<string | null>(null)
  const [showSafety, setShowSafety] = useState(() => {
    try {
      return window.localStorage.getItem('sticklabs.seenSafety') !== '1'
    } catch {
      return true
    }
  })
  // Free-point curve design (2–10 pts). The pad only stores 5, so this is a
  // design canvas — `quantized` is what actually gets written. Persisted per
  // slot+stick so a half-finished shape survives a reload.
  const [spline, setSpline] = useState(() => {
    try { return localStorage.getItem('sticklabs.spline') === '1' } catch { return false }
  })
  useEffect(() => { try { localStorage.setItem('sticklabs.spline', spline ? '1' : '0') } catch { /* session only */ } }, [spline])
  const [design, setDesign] = useState<Array<{ x: number; y: number }>>([])
  const [, force] = useState(0)
  const bump = (): void => {
    setDirty(true)
    force((n) => n + 1)
  }

  useEffect(() => {
    const offPure=api().on('pure:status',v=>{const status=v as import('@shared/pure-raw').PureRawStatus;setPureRecoveryRunning(status.running);setMsg(status.message)})
    const offPureError=api().on('pure:error',v=>setErr(String(v)))
    const offWebDisconnect = api().on('web:disconnected', () => { setConnected(false); setLive(null); setMsg('Controller disconnected. Click Connect controller to reconnect.'); })
    const offSample = api().on('input:sample', (s) => setLive(s as unknown as LiveSample))
    const offStale = api().on('device:stale', () => {
      setMsg('Pad restarted to apply the write — if the sidebar shows disconnected, hit Rescan USB + Connect again.')
    })
    const offReconnecting = api().on('device:reconnecting', () => {
      setMsg('Controller connection lost — waiting to reconnect automatically…')
    })
    const offReset = api().on('rc:resetStatus', (incoming) => {
      const status = incoming as unknown as import('../main/rc-reset').RcResetStatus
      setMsg(status.message)
    })
    const offReconnected = api().on('device:reconnected', (incoming) => {
      const info = incoming as unknown as DeviceInfo
      setConnected(true)
      setInfo(info)
      if (dirtyRef.current) {
        // A reboot mid-edit must not silently throw away the working copy:
        // keep it and let the user choose when to re-read the pad.
        setMsg('Reconnected — your unsaved edits were kept. Re-select the slot to reload the pad bytes.')
      } else {
        setMsg('Reconnected — profile reloaded.')
        void loadSlot(slotRef.current)
      }
    })
    return () => {
      offWebDisconnect();offPure();offPureError();offSample()
      offStale()
      offReconnecting()
      offReconnected()
      offReset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function refresh(): Promise<void> {
    try {
      setCandidates(await api().discover())
    } catch (e) {
      setErr((e as Error).message)
    }
  }
  useEffect(() => {
    void refresh()
    void api().version().then(setAppVersion).catch(() => undefined)
  }, [])

  async function connect(path: string, selectedCandidate?: Candidate): Promise<void> {
    setErr(null)
    try {
      const cand = selectedCandidate ?? candidates.find((c) => c.path === path)
      if(cand?.productId===0x3519) { await api().disconnect();setConnected(false);setBlob(null);setLeadjoyPath(path);return }
      const pre = identifyModel(cand?.product, cand?.productId) ?? null
      if (pre && pre.support === 'unsupported') {
        // Known-unsupportable (e.g. DLL-driven pads with no HID listener):
        // don't waste 10 s timing out a handshake that cannot answer.
        setModel(pre)
        setPid(cand?.productId ?? null)
        setMsg(`${pre.marketingName} detected — ${pre.supportNote}`)
        return
      }
      if (pre?.id === 'Apex5') {
        await flyTransport.connect()
        const ident = await flyTransport.identify()
        await api().disconnect()
        setFlyId(ident)
        setConnPath(path)
        setConnected(true)
        setInfo({ firmware: 'apex-link', dongle: '', currentProfile: 0 })
        setPid(cand?.productId ?? null)
        setModel(pre)
        setBlob(null)
        setMsg('Flydigi Apex 5 connected. Close Flydigi Space Station while tuning here.')
        return
      }
      const res = await api().connect(path)
      await flyTransport.disconnect()
      setFlyId(null)
      setConnPath(path)
      setConnected(true)
      setInfo(res)
      setPid(cand?.productId ?? null)
      const m = identifyModel(cand?.product, cand?.productId) ?? null
      setModel(m)
      if (m && m.support === 'full') {
        await loadSlot(slot, m.profileLength)
      } else if (m) {
        setBlob(null)
        setMsg(`${m.marketingName} detected — ${m.supportNote}`)
      } else {
        // Unknown PID (new editions like Royal2): prove the family live.
        // Handshake already answered; a 1070-byte read that parses as a
        // CE-family profile unlocks it as an unverified variant. Anything
        // else stays locked — this is what keeps a foreign layout safe.
        setMsg('Unknown edition — proving compatibility (read-only check)…')
        try {
          // Try the running slot first, then every user slot: a single
          // family-shaped read anywhere unlocks the pad.
          const tried = [res.currentProfile, 1, 2, 3, 4].filter((s, i, a) => s >= 1 && s <= 5 && a.indexOf(s) === i)
          let proven: Uint8Array | null = null
          for (const s of tried) {
            try {
              const probe = await api().readProfile(s, PROFILE_LENGTH)
              const bytes = b64ToBytes(probe.bytes)
              if (looksLikeCEProfile(bytes)) {
                proven = bytes
                break
              }
            } catch {
              /* next slot */
            }
          }
          if (proven) {
            const ce = MODELS.find((x) => x.id === 'G7ProCE')
            const variant: ControllerModel = {
              ...(ce ?? {
                id: 'G7ProCE',
                marketingName: 'GameSir G7 Pro 8K',
                vendorId: 0x3537,
                usagePage: 0xfff0,
                usage: 0x40,
                pids: [],
                productHints: [],
                reportRates: REPORT_RATE_OPTIONS.map((o) => ({ gear: o.gear, hz: o.hz, confirmed: o.confirmed })),
                profileLength: 1070,
                dumpLength: 1070,
                support: 'full',
                supportNote: ''
              }),
              supportNote: `Unlisted edition (PID 0x${(cand?.productId ?? 0).toString(16)}) — family proven live by structural check. Report this PID to add it permanently.`
            }
            setModel(variant)
            await loadSlot(slot, variant.profileLength)
          } else {
            setBlob(null)
            setMsg(
              `Unknown model (PID 0x${cand ? cand.productId.toString(16) : '?'}) — its profile does not read as G7-family, so it stays locked. Report the PID and model name to add it.`
            )
          }
        } catch (e) {
          setBlob(null)
          setMsg(
            `Unknown model — compatibility check failed (${(e as Error).message}). Locked as a safety default; report the PID to add it.`
          )
        }
      }
    } catch (e) {
      const raw = (e as Error).message
      setErr(
        raw.includes('timed out waiting for response')
          ? `${raw} — the pad opened but never answered. Use wired USB or the 2.4 GHz dongle (Bluetooth exposes no config channel to any app), update firmware in GameSir Connect first if this is a first connect, then close GameSir Connect (it holds the handle) and retry. If it persists, try another listed interface.`
          : raw
      )
    }
  }

  async function loadSlot(s: number, len = modelLenRef.current): Promise<void> {
    setBusy(true)
    setMsg(null)
    setErr(null)
    try {
      const res = await api().readProfile(s, len)
      setBlob(b64ToBytes(res.bytes))
      setSlot(s)
      setDirty(false)
      setLoadId((n) => n + 1)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function write(): Promise<boolean> {
    if (!blob) return false
    setBusy(true)
    setMsg(null)
    setErr(null)
    try {
      if (profile && stick.lockStickOutput(profile.sticks, outputLocks)) syncBlob()
      const res = await api().writeProfile(slot, bytesToB64(blob), modelLen)
      if (res.verified) {
        if (slot === SHIFT_SLOT) { setSavedAt({ slot, at: Date.now() }); setDirty(false); setMsg('Shift layer written and verified. Use your assigned Shift button from P1-P4 to activate it.'); return true }
        const liveNow = info?.currentProfile
        setSavedAt({ slot, at: Date.now() })
        setDirty(false)
        if (liveNow !== undefined && liveNow !== slot) {
          // One step: apply by switching onto the written slot, then prove
          // it — the pad may reboot instead of acking, so the live slot is
          // read back (across the reboot window) rather than trusting reply.
          try {
            await api().switchProfile(slot)
          } catch {
            /* reboot likely ate the ack — confirm below instead of failing */
          }
          let applied = false
          if (!applied) {
            setMsg(`Slot ${slot} written + verified — confirming it took (pad may be rebooting)…`)
          }
          for (let i = 0; i < 8 && !applied; i++) {
            await new Promise((r) => setTimeout(r, 1000))
            try {
              if ((await api().currentProfile()) === slot) applied = true
            } catch {
              /* handle down mid-reboot — retry */
            }
          }
          if (applied) {
            setInfo((prev) => (prev ? { ...prev, currentProfile: slot } : prev))
            setMsg(`Slot ${slot} written, verified and confirmed live on the pad.`)
          } else {
            setMsg(`Slot ${slot} written + verified, but could not confirm it went live — use Activate in Stick profiles below.`)
          }
        } else {
          let back = false
          for (let i = 0; i < 8 && !back; i++) {
            await new Promise(resolve => setTimeout(resolve, 1000))
            try { back = (await api().currentProfile()) === slot } catch { /* retry across reboot */ }
          }
          setMsg(back ? `Slot ${slot} written, verified and confirmed live on the pad.` : `Slot ${slot} written + verified, but could not confirm it went live — reconnect and check the active profile.`)
        }
        return true
      } else if (res.rolledBack) {
        setErr('Write did not verify — previous bytes restored.')
        await loadSlot(slot)
      }
      return false
    } catch (e) {
      setErr((e as Error).message)
      return false
    } finally {
      setBusy(false)
    }
  }

  const profile = blob ? parseProfile(blob, model?.id ?? 'G7ProCE') : null
  // Mutations go straight into `blob` via Packet views; re-serialize keeps
  // the working copy canonical so write() sends exactly what the UI shows.
  const syncBlob = (): void => {
    if (profile && blob) {
      const out = serializeProfile(profile)
      blob.set(out)
    }
  }
  const edit = (fn: () => void): void => {
    fn()
    syncBlob()
    bump()
  }

  /** Mutate a virtual (Steam-only) stick — no blob, no pad, just rerender. */
  const editVirtual = (fn: () => void): void => {
    fn()
    force((n) => n + 1)
  }

  const pkt = profile?.sticks[which] ?? null
  const fd = profile?.funData ?? null
  const dz = pkt ? stick.deadzone(pkt) : null
  const outerBuffer = dz ? outerBufferFromBytes(dz.end, dz.endAnti) : 0
  const outerUnlimited = dz ? isOuterUnlimited(dz.end, dz.endAnti) : true
  const pts = pkt ? stick.curve(pkt) : []
  const resBits = fd ? fun.extend.stickResolutionBits(fd) : 12
  const gear = fd ? fun.extend.reportRateGear(fd) : 5
  const rates = model && model.reportRates.length > 0 ? model.reportRates : REPORT_RATE_OPTIONS
  const gearHz = rates.find((o) => o.gear === gear)?.hz ?? 0
  const resWire = fd ? fun.extend.stickResolution(fd) : 0
  const resInfo = describeRawResolution(fd ? fun.extend.stickResolution(fd) : 0)
  const experimentalBits = EXTENDED_BITS.find(b => bitsToWireRaw(b) === resWire)
  const resolutionLabel = experimentalBits ? experimentalBits + '-bit request · experimental' : resInfo.standard ? resBits + '-bit · ' + bitsToLevels(resBits).toLocaleString() + ' levels' : 'Resolution wire ' + resWire + ' · unrecognized'

  // Center guard: while measuring, track the worst rest deviation of the
  // current stick; the countdown then proposes a Start % that covers it.
  useEffect(() => {
    if (!measuring || measuring.suggestion || !live) return
    const axes = which === 0 ? [live.lx, live.ly] : [live.rx, live.ry]
    const dev = Math.max(...axes.map((v) => Math.abs(v - 128)))
    if (dev > wanderRef.current) wanderRef.current = dev
  }, [live, measuring, which])

  useEffect(() => {
    if (!measuring || measuring.suggestion) return
    if (measuring.left <= 0) {
      const dev = Math.round(wanderRef.current)
      const pct10 = Math.min(200, Math.ceil((dev / 128) * 1000) + 5)
      setMeasuring({ left: 0, suggestion: { dev, pct10 } })
      return
    }
    const t = window.setTimeout(() => {
      setMeasuring((m) => (m && !m.suggestion ? { ...m, left: m.left - 1 } : m))
    }, 1000)
    return () => window.clearTimeout(t)
  }, [measuring])

  const designKey = `sticklab.design.${slot}.${which}`  // (Re)load the design canvas whenever the slot, stick, or profile bytes
  // change: prefer a saved design, else start from the pad's 5 points.
  useEffect(() => {
    if (!pkt) return
    setMeasuring(null)
    try {
      const saved = window.localStorage.getItem(designKey)
      if (saved) {
        const parsed = JSON.parse(saved) as Array<{ x: number; y: number }>
        if (Array.isArray(parsed) && parsed.length >= DESIGN_MIN_POINTS && parsed.length <= DESIGN_MAX_POINTS) {
          setDesign(parsed.map((p) => ({ x: Math.max(0, Math.min(255, Math.round(p.x))), y: Math.max(0, Math.min(255, Math.round(p.y))) })))
          return
        }
      }
    } catch {
      /* fall through to pad curve */
    }
    setDesign(stick.curve(pkt).map((p) => ({ ...p })))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadId, slot, which, designKey])

  useEffect(() => {
    if (design.length === 0) return
    try {
      window.localStorage.setItem(designKey, JSON.stringify(design))
    } catch {
      /* storage full/blocked — design still works for the session */
    }
  }, [design, designKey])

  const fittedCurve = useMemo(() => design.length >= 2 ? (spline ? resampleSpline(design) : resampleCurve(design)) : null, [design, spline])
  const quantized = fittedCurve ?? pts
  const locked = connected && (!model || model.support !== 'full')
  const modelId = model?.id ?? 'G7ProCE'
  const modelLen = model && model.profileLength > 0 ? model.profileLength : PROFILE_LENGTH
  modelLenRef.current = modelLen
  const padCurve = pts
  const savedDesignPending=quantized.some((p,i)=>p.x!==padCurve[i]?.x||p.y!==padCurve[i]?.y)

  function stageDesign(next: Array<{x:number;y:number}>, smooth = spline): void {
    if(!pkt || busy) return
    setDesign(next)
    edit(()=>stageCurve(pkt,next,smooth))
  }
  function syncDesignFromCopy(): void { if(pkt) setDesign(stick.curve(pkt).map(p=>({...p}))) }

  async function reloadDesignFromPad(): Promise<void> {
    if (!profile || !connected || busy) return
    const requestedSlot=slot, requestedSide=which
    setBusy(true); setErr(null)
    try {
      const read=await api().readProfile(requestedSlot,modelLen)
      if(slotRef.current!==requestedSlot || currentBlob.current!==blob) return
      const fresh=parseProfile(b64ToBytes(read.bytes),modelId)
      profile.sticks[requestedSide].bytes.set(fresh.sticks[requestedSide].bytes.slice(11,24),11)
      const next=serializeProfile(profile)
      const saved=b64ToBytes(read.bytes)
      setBlob(next); setDirty(next.some((v,i)=>v!==saved[i]))
      setDesign(stick.curve(fresh.sticks[requestedSide]).map(p=>({...p})))
      setMsg('Curve reloaded from the controller; other staged settings kept.')
    } catch(e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  if(leadjoyPath) return <LeadJoyPanel path={leadjoyPath} onBack={()=>setLeadjoyPath(null)} />

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <h1 className="app-brand"><span>Stick-Abuse-Limited</span><button className="app-brand-link" title="Open Stick-Abuse-Limited on GitHub" aria-label="Open Stick-Abuse-Limited on GitHub" onClick={() => void api().openExternal('https://github.com/40469420/Stick-Abuse-Limited')}><img className="app-brand-icon" src={appIcon} alt="" aria-hidden="true" /></button></h1>
        </div>
        <nav className="nav">
          <div className="nav-group">
            <h4>Tuning</h4>
            <button type="button" className={`nav-item${tab === 'sticks' ? ' active' : ''}`} onClick={() => setTab('sticks')}>
              Sticks
            </button>
            <button type="button" className={`nav-item${tab === 'device' ? ' active' : ''}`} onClick={() => setTab('device')}>
              Device
            </button>
            <button type="button" className={`nav-item${tab === 'triggers' ? ' active' : ''}`} onClick={() => setTab('triggers')}>Triggers</button>
            <button type="button" className={`nav-item${tab === 'gyro' ? ' active' : ''}`} onClick={() => setTab('gyro')}>Gyro</button>
            <button type="button" className={`nav-item${tab === 'rc' ? ' active' : ''}`} onClick={() => setTab('rc')}>
              RC filters
            </button>
            <button type="button" className={`nav-item${tab === 'calibrate' ? ' active' : ''}`} onClick={() => setTab('calibrate')}>
              Calibrate
            </button>
            <button type="button" className={`nav-item${tab === 'center' ? ' active' : ''}`} onClick={() => setTab('center')}>
              Center offsets
            </button>
            <button type="button" className={`nav-item${tab === 'bindings' ? ' active' : ''}`} onClick={() => setTab('bindings')}>Keybindings</button>
            <button type="button" className={`nav-item${tab === 'macros' ? ' active' : ''}`} onClick={() => setTab('macros')}>Macros</button>
          </div>
          <div className="nav-group">
            <h4>Data</h4>
            <button type="button" className={`nav-item${tab === 'profiles' ? ' active' : ''}`} onClick={() => setTab('profiles')}>
              Profiles
            </button>
            <button type="button" className={`nav-item${tab === 'lab' ? ' active' : ''}`} onClick={() => setTab('lab')}>
              Lab
            </button>
          </div>
          <div className="nav-group">
            <h4>Export</h4>
            <button type="button" className={`nav-item${tab === 'steam' ? ' active' : ''}`} onClick={() => setTab('steam')}>
              Steam
            </button>
          </div>
          <div className="nav-group"><h4>Firmware</h4><button type="button" className={`nav-item${tab === 'firmware' ? ' active' : ''}`} onClick={() => setTab('firmware')}>Firmware</button></div>
          <div className="nav-group">
            <h4>Preview</h4>
            <button type="button" className={`nav-item${tab === 'marius' ? ' active' : ''}`} onClick={() => setTab('marius')}>
              Marius
            </button>
          </div>
        </nav>
        <div className="stack" style={{ gap: 10 }}>
          {isWebVersion() && <button className="btn primary" disabled={busy || !('hid' in navigator)} onClick={() => { void api().requestController?.().then(found => { setCandidates(found); if(found[0]) return connect(found[0].path, found[0]) }).catch(e => setErr((e as Error).message)) }}>Connect controller</button>}
          <button className="btn ghost sm" onClick={() => void refresh()}>{isWebVersion()?'Refresh controllers':'Rescan USB'}</button>
          <button
            className="btn ghost sm"
            title="Copy device + app details for support (nothing personal)"
            onClick={() => {
              const lines = [
                `Stick-Abuse-Limited v${appVersion ?? '?'} ${new Date().toISOString()}`,
                `connected=${connected} model=${model?.id ?? 'none'} pid=${pid !== null ? '0x' + pid.toString(16) : 'none'} fw=${info?.firmware ?? 'none'}`,
                ...candidates.map(
                  (c) => `cand pid=0x${c.productId.toString(16)} live=${c.live} preferred=${c.preferred} product=${c.product ?? '?'}`
                )
              ]
              const text = lines.join('\n')
              try {
                void navigator.clipboard.writeText(text).then(
                  () => setMsg('Diagnostics copied — paste it to RealKiyoshi.'),
                  () => setMsg(text)
                )
              } catch {
                setMsg(text)
              }
            }}
          >
            Copy diagnostics
          </button>
          {visibleCandidates.map((c) => {
            const known = identifyModel(c.product, c.productId)
            return (
              <button key={c.path} className="btn sm" onClick={() => void connect(c.path)}>
                {known ? known.marketingName : (c.product || `Unknown 0x${c.productId.toString(16)}`)}{c.preferred ? ' ★' : ''}
              </button>
            )
          })}
          {connected && (
            <button
              className="btn ghost sm"
              onClick={() => {
                void api().disconnect()
                void flyTransport.disconnect()
                setFlyId(null)
                setConnPath(null)
                setConnected(false)
                setInfo(null)
                setPid(null)
                setModel(null)
              }}
            >
              Disconnect
            </button>
          )}
          {info && (
            <div className="note">
              FW {info.firmware} · live slot P{info.currentProfile}
              <br />{model ? model.marketingName : 'Unknown model'}
            </div>
          )}
          {pid === 0x0575 && (
            <div className="note bad">
              That PID is the <strong>receiver</strong>, not the pad — reads time out on it. Disconnect and connect the ★ interface instead.
            </div>
          )}
        </div>
        <div className="status-bar">
          <div className="status-row">
            <span className={`dot ${connected ? 'good' : 'bad'}`} />
            {connected ? 'Connected' : 'Disconnected'}
            {appVersion && <span style={{ color: 'var(--text-3)' }}>v{appVersion}</span>}
          </div>
          <div className="status-row" style={{ marginTop: 8 }}>
            <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Developed by RealKiyoshi · Forked by @Machixo</span>
          </div>
          <div className="row" style={{ gap: 6, marginTop: 6 }}><button
            type="button"
            className="btn ghost sm"
            aria-label="YouTube @realkiyoshi"
            title="YouTube @realkiyoshi"
            onClick={() => void api().openExternal('https://www.youtube.com/@realkiyoshi').catch(() => undefined)}
          >
            YouTube
          </button>
          <button type="button" className="btn ghost sm" onClick={() => void api().openExternal('https://x.com/Machixo').catch(() => undefined)}>X @Machixo</button></div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="row" style={{ gap: 12 }}>
            <h2>{PAGE_INFO[tab][0]}</h2>
            <span className="sub">{PAGE_INFO[tab][1]}</span>
          </div>
          {modelId !== 'Apex5' && !['center', 'calibrate', 'firmware', 'marius', 'steam', 'profiles'].includes(tab) && !(isWebVersion() && WEB_DESKTOP_PAGES.has(tab)) && <div className="row profile-toolbar" style={{ gap: 8 }}>
            <span className="label">Editing profile</span>
            {[1, 2, 3, 4].map((s) => (
              <button
                key={s}
                className={`btn sm${s === slot ? ' primary' : ' ghost'}`}
                disabled={!connected || busy || pureRecoveryRunning || locked}
                onClick={() => { if(!dirty || window.confirm('Discard unsaved changes and load another profile?')) void loadSlot(s) }}
              >
                P{s}
              </button>
            ))}
            {modelId === 'G7ProCE' && <button className={`choice-btn${slot === SHIFT_SLOT ? ' active' : ''}`} disabled={!connected || busy || pureRecoveryRunning || locked} onClick={() => { if (!dirty || window.confirm('Discard unsaved changes and load the Shift layer?')) void loadSlot(SHIFT_SLOT) }}><span className="choice-label">Shift</span></button>}
            <button className="btn sm primary" disabled={!connected || !dirty || busy || pureRecoveryRunning || locked} onClick={() => void write()}>
              {pureRecoveryRunning?'Recovering PureRaw…':busy ? 'Working…' : 'Write to controller'}
            </button>
            {dirty && <span className="pill warn">Unsaved</span>}
            {!dirty && savedAt && savedAt.slot === slot && (
              <span className="pill good" title="Last verified write, read back from the pad">
                Saved ✓ {new Date(savedAt.at).toLocaleTimeString()}
              </span>
            )}
          </div>}
        </header>
        <div className="content">
          {isWebVersion() && <div className="note">WebHID beta · desktop Chrome or Edge · close other controller apps. Game guards, tray monitoring and automatic PureRaw recovery require the local app. {!('hid' in navigator) && 'This browser does not expose WebHID. Open this page in desktop Chrome or Edge to connect.'}</div>}
          {isWebVersion() && WEB_DESKTOP_PAGES.has(tab) ? <DesktopRequired /> : <>
          {slot === SHIFT_SLOT && <div className="card"><SectionTitle title="Editing the Shift layer">This is the shared fifth profile, used by a button assigned to Shift in P1-P4. Configure and write it here; writing does not activate it. Stick, trigger, gyro and binding changes apply only while the layer is active. Return to a base profile to assign a Shift button.</SectionTitle>
            <button className="btn ghost" disabled={busy} onClick={() => { const source = Number(window.prompt('Copy which saved controller profile into Shift? Enter 1, 2, 3 or 4.', '3')); if (![1,2,3,4].includes(source)) return; void (async () => { setBusy(true); try { const read = await api().readProfile(source, PROFILE_LENGTH); setBlob(copyToShift(b64ToBytes(read.bytes))); setDirty(true); setLoadId(n=>n+1); setMsg(`Copied saved P${source} into the working Shift layer. Write to apply.`) } catch(e) { setErr((e as Error).message) } finally { setBusy(false) } })() }}>Copy a saved base profile</button>
          </div>}
          {showSafety && (
            <div className="card" style={{ marginBottom: 16, borderColor: 'var(--warn)' }}>
              <h3>First — read this (30 seconds)</h3>
              <div className="stack" style={{ gap: 6, fontSize: 13 }}>
                <span>1. <strong>Back up first</strong> — Stick profiles card → Backup all → JSON. You can always restore.</span>
                <span>2. <strong>Close GameSir Connect</strong> — it holds the controller and blocks this app.</span>
                <span>3. <strong>Wired or 2.4G only</strong> — Bluetooth pads don't appear here, ever.</span>
                <span>4. <strong>Writing the active profile reboots the pad</strong> for ~2 seconds. {isWebVersion() ? 'If needed, click Connect controller again.' : 'Normal — it reconnects by itself.'}</span>
                <span>5. <strong>Tournaments</strong> — check your event's rules before competing on a tuned profile.</span>
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <button
                  className="btn sm primary"
                  onClick={() => {
                    try {
                      window.localStorage.setItem('sticklabs.seenSafety', '1')
                    } catch {
                      /* ignore */
                    }
                    setShowSafety(false)
                  }}
                >
                  Got it
                </button>
              </div>
            </div>
          )}
          {err && <div className="note bad">{err}</div>}
          {msg && <div className="note">{msg}</div>}
          {tab === 'steam' && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="section-title"><h3>Steam — no pad needed</h3><Help title="Steam — no pad needed">Tune deadzones here for export to Steam. Outer reach rides along inside Full power. Anti snap exports as Steam's on/off flag.</Help></div>
              <div className="two" style={{ alignItems: 'start', marginTop: 10 }}>
                {(['Left', 'Right'] as const).map((name, i) => {
                  const vp = vSticks[i]
                  const vdz = stick.deadzone(vp)
                  const setVD = (key: 'begin' | 'end', percent: number): void => {
                    const next = { ...stick.deadzone(vp) }
                    next[key] = Math.round(percent * 10)
                    stick.setDeadzone(vp, next)
                  }
                  const outerB = 100 - vdz.end / 10
                  return (
                    <div className="stack" style={{ gap: 12 }} key={name}>
                      <span className="label"><KeyIcon value={i ? 8 : 7} /> {name} stick</span>
                      <Slider label="Deadzone start" value={vdz.begin / 10} min={0} max={20} step={0.5} unit="%" onChange={(v) => editVirtual(() => setVD('begin', v))} format={(v) => `${v.toFixed(1)}%`} />
                      <Slider label="Deadzone end" value={vdz.end / 10} min={10} max={100} step={0.5} unit="%" onChange={(v) => editVirtual(() => setVD('end', v))} format={(v) => `${v.toFixed(1)}%`} />
                      <Slider label="Anti snap" value={vdz.beginAnti / 10} min={0} max={50} step={0.5} unit="%" onChange={(v) => editVirtual(() => { const n = { ...stick.deadzone(vp) }; n.beginAnti = Math.round(v * 10); stick.setDeadzone(vp, n) })} format={(v) => `${v.toFixed(1)}%`} />
                      <Slider label="Anti ceiling" value={vdz.endAnti / 10} min={50} max={100} step={0.5} unit="%" onChange={(v) => editVirtual(() => { const n = { ...stick.deadzone(vp) }; n.endAnti = Math.round(v * 10); stick.setDeadzone(vp, n) })} format={(v) => `${v.toFixed(1)}%`} />
                      <Slider label="Outer reach (earlier max)" value={outerB} min={0} max={90} step={1} unit="%" onChange={(v) => editVirtual(() => stick.setDeadzone(vp, { ...stick.deadzone(vp), end: Math.round((100 - v) * 10), endAnti: 1000 }))} format={(v) => (v === 0 ? '∞ full range' : `max at ${(100 - v).toFixed(0)}%`)} />
                    </div>
                  )
                })}
              </div>
              <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
                <span className="label">Controller Rate</span>
                {[{ label: 'None', value: null as number | null }, ...[100, 150, 200, 250, 300].map((r) => ({ label: `${r}${r > 255 ? '*' : ''}`, value: Math.min(r, 255) as number | null }))].map((opt) => (
                  <button
                    key={opt.label}
                    className={`btn sm${vMouse === opt.value ? ' primary' : ' ghost'}`}
                    onClick={() => setVMouse(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="card" style={{ marginTop: 16 }}>
                <div className="section-title"><h3>Aim response — custom curve for Steam</h3><Help title="Control details">Design freely (drag, add up to 10 points). On export this is fitted to Steam's single-exponent language — the closest thing possible, not 1:1. Current fit: <span className="mono">k ≈ {fitCurveExponent(vDesign)}</span></Help></div>
                <CurvePlot points={vDesign} onChange={setVDesign} />
                <div className="row wrap" style={{ gap: 8, margin: '8px 0' }}>
                  {Object.entries(AIM_CURVES).map(([key, c]) => (
                    <button
                      key={key}
                      className="btn sm ghost"
                      title={c.hint}
                      onClick={() => setVDesign(c.pts.map((p) => ({ ...p })))}
                    >
                      {c.label}
                    </button>
                  ))}
                  <button
                    className="btn sm ghost"
                    disabled={vDesign.length >= DESIGN_MAX_POINTS}
                    onClick={() => setVDesign((d) => addDesignPoint(d))}
                  >
                    + Add point ({vDesign.length}/{DESIGN_MAX_POINTS})
                  </button>
                  {vDesign.length > DESIGN_MIN_POINTS && (
                    <button
                      className="btn sm ghost"
                      onClick={() => setVDesign((d) => d.slice(0, -1))}
                    >
                      − Remove last
                    </button>
                  )}
                </div>
                <table className="tbl" style={{ marginTop: 8 }}>
                  <thead><tr><th>#</th><th>X (input)</th><th>Y (output)</th></tr></thead>
                  <tbody>
                    {vDesign.map((p, i) => (
                      <tr key={i}>
                        <td className="mono">{i + 1}</td>
                        <td><input className="input" type="number" min={0} max={255} value={p.x} onChange={(e) => { const next = vDesign.map((q) => ({ ...q })); const lo = i > 0 ? next[i - 1].x : 0; const hi = i < next.length - 1 ? next[i + 1].x : 255; next[i].x = Math.max(lo, Math.min(hi, Math.round(Number(e.target.value) || 0))); setVDesign(next) }} /></td>
                        <td><input className="input" type="number" min={0} max={255} value={p.y} onChange={(e) => { const next = vDesign.map((q) => ({ ...q })); next[i].y = Math.max(0, Math.min(255, Number(e.target.value))); setVDesign(next) }} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {dirty && <div className="note warn">Unsaved profile changes — write to apply.</div>}
          {tab !== 'steam' && !connected && (
            <div className="msg"><h3>Connect a controller</h3><p>G7 Pro 8K · G7 Pro · Tarantula 8K (plus new 8K editions via auto-check). Rescan, then connect the vendor interface. Close GameSir Connect first — it holds the handle.</p></div>
          )}
          {tab !== 'steam' && connected && modelId !== 'Apex5' && !profile && (
            !model || model.support !== 'full' ? (
              <div className="msg">
                <h3>{model ? `${model.marketingName} — tuning locked` : 'Unknown controller — tuning locked'}</h3>
                <p>{model ? model.supportNote : 'This USB ID is not in the verified model table, so profile access stays off as a safety default.'}</p>
                <p>Live input below still works. Profile reads/writes stay disabled until the layout is verified on hardware.</p>
              </div>
            ) : (
              <div className="msg"><h3>Loading profile…</h3></div>
            )
          )}
          {connected && modelId === 'Apex5' && (tab === 'sticks' ? <ApexSticks flyId={flyId} /> : tab === 'device' ? <ApexDevice flyId={flyId} rates={rates} /> : <div className="note">Flydigi tuning is available in Sticks and Device. Other tuning sections require a supported GameSir controller.</div>)}
          {connected && profile && pkt && dz && fd && (
            <>
              {(tab === 'sticks' || tab === 'device') && <div className="row" style={{ gap: 8, marginBottom: 12 }}>
                {(['Left', 'Right'] as const).map((n, i) => (
                  <button key={n} className={`btn${i === which ? ' primary' : ' ghost'}`} onClick={() => setWhich(i)}>
                    <KeyIcon value={i === 0 ? 7 : 8} /> {n} stick
                  </button>
                ))}
                <div style={{ flex: 1 }} />
                <span className="pill">{resolutionLabel}</span>
              </div>}
              {tab === 'sticks' && (
              <div className="two" style={{ alignItems: 'start' }}>
                <div className="stack" style={{ gap: 16 }}>
                  <StickRangePreview range={dz} side={which} originalAvailable={modelId === 'G7ProCE'} enabled={stick.enabled(pkt)} />
                  <div className="card">
                    <div className="section-title"><h3>Dead zone + anti-deadzone — 0.1% steps</h3><Help title="Dead zone + anti-deadzone — 0.1% steps">Stored ×10 (50 = 5%). <strong>Start/End</strong> bound the input: below Start = no output, past End = already full. <strong>Anti-deadzone</strong> is the output floor/ceiling: raising Anti-start lifts the minimum output so small deflections bite sooner — the snap setting for FPS.</Help></div>
                    <div className="stack" style={{ gap: 12, marginTop: 8 }}>
                      <Slider label="Start (input below = 0)" value={dz.begin / 10} min={0} max={(dz.end-1)/10} step={0.1} unit="%" onChange={(v) => edit(() => stick.setDeadzone(pkt, { ...stick.deadzone(pkt), begin: Math.round(v * 10) }))} format={(v) => `${v.toFixed(1)}%`} />
                      <Slider label="End (input above = full)" value={dz.end / 10} min={(dz.begin+1)/10} max={100} step={0.1} unit="%" onChange={(v) => edit(() => stick.setDeadzone(pkt, { ...stick.deadzone(pkt), end: Math.round(v * 10) }))} format={(v) => `${v.toFixed(1)}%`} />
                      <Slider label="Anti-deadzone start (output floor — snap)" value={dz.beginAnti / 10} min={0} max={dz.endAnti/10} step={0.1} unit="%" onChange={(v) => edit(() => stick.setDeadzone(pkt, { ...stick.deadzone(pkt), beginAnti: Math.round(v * 10) }))} format={(v) => `${v.toFixed(1)}%`} />
                      <Slider label="Anti-deadzone end (output ceiling)" value={dz.endAnti / 10} min={dz.beginAnti/10} max={100} step={0.1} unit="%" onChange={(v) => edit(() => stick.setDeadzone(pkt, { ...stick.deadzone(pkt), endAnti: Math.round(v * 10) }))} format={(v) => `${v.toFixed(1)}%`} />
                    </div>

                    <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
                      <button className="btn sm" onClick={() => edit(() => stick.applyPhysics(pkt))}>Physics: 0% + linear</button>
                      <button className="btn sm ghost" onClick={() => edit(() => stick.setDeadzone(pkt, { begin: 50, end: 1000, beginAnti: 0, endAnti: 1000 }))}>Factory 5%</button>
                      <button className="btn sm ghost" title="Full output at 80% deflection — pairs with FPS Aim" onClick={() => edit(() => stick.setDeadzone(pkt, { ...stick.deadzone(pkt), end: 800 }))}>Aim End 80%</button>
                      <button className="btn sm ghost" title="Full output at 65% — pairs with Flick/Snap" onClick={() => edit(() => stick.setDeadzone(pkt, { ...stick.deadzone(pkt), end: 650 }))}>Flick End 65%</button>
                      <button className="btn sm ghost" title="Output floor 8% — small deflections bite sooner" onClick={() => edit(() => stick.setDeadzone(pkt, { ...stick.deadzone(pkt), beginAnti: 80 }))}>Anti snap 8%</button>
                      <button className="btn sm ghost" title="Output floor 15% — maximum snap, watch for drift" onClick={() => edit(() => stick.setDeadzone(pkt, { ...stick.deadzone(pkt), beginAnti: 150 }))}>Anti max 15%</button>
                      <button className="btn sm ghost" title="Neutral output window" onClick={() => edit(() => stick.setDeadzone(pkt, { ...stick.deadzone(pkt), beginAnti: 0, endAnti: 1000 }))}>Anti off</button>
                      <button
                        className="btn sm ghost"
                        title="Watch this stick untouched for 10 s, then recommend the Start % that swallows its wander"
                        disabled={!live || measuring !== null}
                        onClick={() => {
                          wanderRef.current = 0
                          setMeasuring({ left: 10, suggestion: null })
                        }}
                      >
                        {measuring ? `Measuring… ${measuring.left}s — don't touch` : 'Center guard: measure wander'}
                      </button>
                    </div>
                    {measuring?.suggestion !== null && measuring?.suggestion !== undefined && (
                      <div className="note warn" style={{ marginTop: 8 }}>
                        Max wander {measuring.suggestion.dev} steps off centre.{' '}
                        <button
                          className="btn sm primary"
                          style={{ marginLeft: 8 }}
                          onClick={() => {
                            const pct10 = measuring.suggestion!.pct10
                            edit(() => stick.setDeadzone(pkt, { ...stick.deadzone(pkt), begin: pct10 }))
                            setMeasuring(null)
                          }}
                        >
                          Set Start {measuring.suggestion.pct10 / 10}%
                        </button>{' '}
                        <button className="btn sm ghost" onClick={() => setMeasuring(null)}>Dismiss</button>
                      </div>
                    )}
                  </div>


                  <div className="card">
                    <div className="section-title"><h3>Outer Threshold — {outerUnlimited ? '∞ no limit' : 'custom'}</h3><Help title="Outer Threshold">                    <p>
                      <strong>What this does.</strong> The outer threshold is the deflection where the stick hits maximum output.
                      A positive buffer pulls that boundary inward, so max arrives earlier (hotter rim); a negative buffer
                      soft-caps output below max instead (tamer rim — the zone where extra yaw/pitch-style effects bite).
                      Neutral <strong>0 / ∞</strong> removes the boundary entirely: End 100%, output ceiling 100%, the pad's
                      full physical range with nothing clipped or boosted at the rim.
                    </p>
                    <p>
                      <strong>Same bytes, other names.</strong> Steam's Outer Threshold and the deadzone End / output-ceiling
                      sliders all write the same two firmware fields (input-saturation End, output ceiling). They are just
                      different labels for this boundary — setting ∞ here is identical to End 100% + ceiling 100% over there.
                    </p>
</Help></div>
                    <div className="row spread" style={{ margin: '10px 0' }}>
                      <div>
                        <div style={{ fontSize: 13.5 }}>∞ No limit (neutral 0)</div>
                        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                          {outerUnlimited ? 'Active — full physical range' : 'Off — mild +10 boundary parked'}
                        </div>
                      </div>
                      <button
                        className={`btn sm${outerUnlimited ? ' primary' : ' ghost'}`}
                        onClick={() => {
                          if (outerUnlimited) {
                            edit(() => stick.setDeadzone(pkt, { ...stick.deadzone(pkt), end: 900, endAnti: 1000 }))
                          } else {
                            edit(() => stick.setDeadzone(pkt, { ...stick.deadzone(pkt), end: 1000, endAnti: 1000 }))
                          }
                        }}
                      >
                        {outerUnlimited ? '∞ On' : 'Set ∞'}
                      </button>
                    </div>
                    {!outerUnlimited && (
                      <div className="note warn" style={{ marginTop: 8 }}>
                        This stick currently carries a custom boundary: <span className="mono">{outerBuffer >= 0 ? `max at ${(100 - outerBuffer).toFixed(0)}% deflection` : `output tops at ${(100 + outerBuffer).toFixed(0)}%`}</span>.
                        Tap <strong>Set ∞</strong> to clear it back to the full range.
                      </div>
                    )}
                  </div>
                </div>
                <div className="stack" style={{ gap: 16 }}>
                  <div className="card">
                    <div className="section-title"><h3>Custom curve designer — {design.length} points</h3><Help title="Control details">The pad stores exactly <strong>5 points</strong>, so this is a free-point canvas (2–10): <span style={{ color: getComputedStyle(document.documentElement).getPropertyValue('--accent-2').trim() }}>● red = your design, drag it</span>, <span style={{ color: 'var(--warn)' }}>▢ orange dashed = the 5 bytes that will be written</span>. Dual-zone presets mimic a dynamic response — the pad has no speed sensing, so this is the static LUT a dynamic curve averages to.</Help></div>
                    <CurvePlot points={design.length >= 2 ? design : padCurve} onChange={(next) => stageDesign(next)} overlay={quantized} smooth={spline} />
                    <div className="row" style={{ gap: 8, margin: '8px 0' }}>
                      <span className="pill">Edits stage immediately · Write to apply</span>
                      {savedDesignPending && <button className="btn sm" disabled={busy} onClick={()=>stageDesign(design)}>Restore saved design</button>}
                      <div style={{ flex: 1 }} />
                      <button className="btn sm ghost" onClick={() => void reloadDesignFromPad()}>Reload from pad</button>
                    </div>
                    <div className="row wrap" style={{ gap: 8, margin: '8px 0' }}>
                      {Object.entries(AIM_CURVES).map(([key, c]) => (
                        <button
                          key={key}
                          className="btn sm ghost"
                          title={c.hint}
                          onClick={() => stageDesign(c.pts.map((p) => ({ ...p })))}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                    <div className="row wrap" style={{ gap: 8 }}>
                      <button
                        className="btn sm"
                        disabled={design.length >= DESIGN_MAX_POINTS}
                        onClick={() => stageDesign(addDesignPoint(design.length >= 2 ? design : padCurve))}
                      >
                        + Add point ({design.length}/{DESIGN_MAX_POINTS})
                      </button>
                      <button
                        className="btn sm ghost"
                        title="Copy this stick's pad curve to the other stick"
                        onClick={() => {
                          if (!profile || !pkt) return
                          const other = profile.sticks[which === 0 ? 1 : 0]
                          edit(() => { stick.setCurve(other, stick.curve(pkt).map((p) => ({ ...p }))); stick.markCurveIdentity(other) })
                        }}
                      >
                        Copy pad curve → other stick
                      </button>
                    </div>
                    <label className="row"><input type="checkbox" checked={spline} onChange={(e) => { setSpline(e.target.checked); stageDesign(design, e.target.checked) }} />Smooth spline<Help title="Smooth spline">Uses a smooth curve between your design points, then samples the five points supported by the controller.</Help></label>
                    <details className="disclosure"><summary>Edit exact curve points</summary><table className="tbl" style={{ marginTop: 8 }}>
                      <thead><tr><th>#</th><th>X</th><th>Y</th><th /></tr></thead>
                      <tbody>
                        {design.map((p, i) => (
                          <tr key={i}>
                            <td className="mono">{i + 1}</td>
                            <td><input className="input" type="number" min={0} max={255} value={p.x} onChange={(e) => { const next = design.map((q) => ({ ...q })); const lo = i > 0 ? next[i - 1].x : 0; const hi = i < next.length - 1 ? next[i + 1].x : 255; next[i].x = Math.max(lo, Math.min(hi, Math.round(Number(e.target.value) || 0))); stageDesign(next) }} /></td>
                            <td><input className="input" type="number" min={0} max={255} value={p.y} onChange={(e) => { const next = design.map((q) => ({ ...q })); next[i].y = Math.max(0, Math.min(255, Number(e.target.value))); stageDesign(next) }} /></td>
                            <td>
                              <button className="btn sm ghost" disabled={design.length <= DESIGN_MIN_POINTS} title="Remove point" onClick={() => stageDesign(design.filter((_,j)=>j!==i))}>−</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table><div className="note" style={{ marginTop: 8 }}>
                      <Help title="Hardware curve preview">The five quantized points written to the controller: <span className="mono">{quantized.map((q) => `${q.x}/${q.y}`).join(' · ')}</span></Help>
                    </div></details>
                  </div>


                  <div className="card">
                    <div className="section-title"><h3>Shape</h3><Help title="Shape">{isWebVersion() ? 'Round and square control diagonal reach. Linear full range also resets deadzones, output limits, curve and axis balance. Linear keeps processing enabled. Calibration and game sensitivity may still affect behavior.' : 'Round and square control diagonal reach. Linear full range also resets deadzones, output limits, curve and axis balance. Linear keeps processing enabled. PureRaw clears a firmware processing flag but does not reliably bypass every stage. PureRaw Deadzone (Processing) keeps processing enabled and neutralizes only the curve; selecting another shape enables processing again. Calibration and game sensitivity may still affect behavior.'}</Help></div>
                    <div className="stack" style={{ gap: 8 }}>
                      {(
                        [
                          { name: 'Round diagonals', hint: 'Uses a round diagonal boundary: the stick reaches a circular edge instead of extending into square corners. Your current deadzones and response curve are kept.' },
                          { name: 'Square gate', hint: 'Allows full X and Y output together at the corners. Diagonal magnitude can exceed a circular gate; your current deadzones and response curve are kept.' },
                          { name: 'Linear full range (1:1)', hint: 'Resets deadzones, output limits, curve and axis balance for linear full-range response. Stick processing stays enabled. Calibration and game settings still apply.' },
                          { name: 'PureRaw Deadzone (Processing)', hint: 'Keeps processing enabled with a neutral response curve. Preserves deadzones, anti-deadzones, gate, axis balance, mapping and all unrelated settings.' },
                          { name: 'PureRaw', hint: 'Clears the processing-enable flag while preserving stored tuning. Firmware may still apply deadzones and anti-deadzones. Reconnecting can cap output at about 20%; Auto reapply uses the tested Square-to-PureRaw recovery sequence.' }
                        ] as const
                      ).filter(s => !isWebVersion() || !s.name.startsWith('PureRaw')).map((s) => {
                        const isRaw = stick.isRawLinear(pkt)
                        const isSquare = stick.enabled(pkt) && stick.squareGate(pkt) && !isRaw
                        const isRound = stick.enabled(pkt) && !stick.squareGate(pkt)
                        const active = (s.name === 'Round diagonals' && isRound) || (s.name === 'Square gate' && isSquare) || (s.name === 'Linear full range (1:1)' && isRaw) || (s.name === 'PureRaw Deadzone (Processing)' && stick.enabled(pkt) && stick.isIdentityCurve(pkt) && !isRaw) || (s.name === 'PureRaw' && !stick.enabled(pkt))
                        return (
                          <div key={s.name} className="shape-choice"><button
                            className={`btn sm${active ? ' primary' : ' ghost'}`}
                            title={s.hint}
                            onClick={() => {
                              edit(() => {
                                if (s.name === 'Linear full range (1:1)') {
                                  stick.applyRawLinear(pkt)
                                } else if (s.name === 'PureRaw Deadzone (Processing)') {
                                  applyPureRawProcessing(pkt)
                                } else if (s.name === 'PureRaw') {
                                  stick.setEnabled(pkt, false)
                                } else {
                                  stick.setEnabled(pkt, true)
                                  stick.setSquareGate(pkt, s.name === 'Square gate')
                                }
                              })
                              if(s.name === 'PureRaw Deadzone (Processing)')syncDesignFromCopy()
                            }}
                          >
                            {s.name}
                          </button><Help title={s.name}>{s.hint}</Help>{s.name==='PureRaw'&&<PureRawReconnect/>}</div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="card" style={{ borderColor: 'var(--bad)' }}>
                    <div className="section-title"><h3>Reset everything</h3><Help title="Reset everything">Returns every byte this app can write to stock neutral — both sticks (deadzone, curve, flips, gate, axis, mouse rate, outputs), outer unlimited, 12-bit, 8K polling, RC off. Names, triggers, buttons and macros are untouched. Then Write to apply.</Help></div>
                    <button
                      className="btn danger"
                      style={{ width: '100%', padding: '14px', fontSize: 15, fontWeight: 700, letterSpacing: '0.08em', marginTop: 10 }}
                      onClick={() => {
                        if (!profile || !fd) return
                        if (!window.confirm('Reset EVERYTHING this app controls to stock neutral?\n\nBoth sticks, outer, detail, polling, RC. Names, triggers, buttons and macros are kept.')) return
                        edit(() => {
                          profile.sticks.forEach((s, i) => {
                            stick.setDeadzone(s, { begin: 50, end: 1000, beginAnti: 0, endAnti: 1000 })
                            stick.setCurve(s, LINEAR_CURVE.map((p) => ({ ...p })))
                            stick.markCurveIdentity(s)
                            stick.setFlipX(s, false)
                            stick.setFlipY(s, false)
                            stick.setSquareGate(s, false)
                            stick.setAxisRatio(s, 50)
                            stick.setMouseDpi(s, 50)
                            stick.setMapIndex(s, i === 0 ? 1 : 2)
                            stick.setMapped(s, true)
                          })
                          fun.extend.setStickResolutionBits(fd, 12)
                          fun.extend.setReportRateGear(fd, 5)
                          fun.extend.setLsAntiJitter(fd, 11)
                          fun.extend.setRsAntiJitter(fd, 11)
                        })
                        syncDesignFromCopy()
                        setMsg('Everything reset to stock neutral — Write to apply it to the pad.')
                      }}
                    >
                      RESET EVERYTHING
                    </button>
                  </div>

                </div>
              </div>
              )}
              {tab === 'device' && (
              <>
                <ControllerPreview originalAvailable={modelId === 'G7ProCE'} />
              <div className="two" style={{ alignItems: 'start' }}>
                <div className="stack" style={{ gap: 16 }}>
                  <div className="card">
                    <SectionTitle title="Polling rate">Select the controller's report-rate gear. Rate labels are vendor claims; use Lab to measure reports received by the computer. The 2K option is inferred and has no confirmed vendor label.</SectionTitle>
                    <div className="row wrap" style={{ gap: 8, margin: '10px 0' }}>
                      {rates.filter((o) => o.hz >= 1000).map((o) => (
                        <button
                          key={o.gear}
                          className={`btn sm${fun.extend.reportRateGear(fd) === o.gear ? ' primary' : ' ghost'}`}
                          title={o.confirmed ? `gear ${o.gear}` : `gear ${o.gear} (inferred — no vendor label)`}
                          onClick={() => edit(() => fun.extend.setReportRateGear(fd, o.gear))}
                        >
                          {o.hz >= 1000 ? `${o.hz / 1000}K` : `${o.hz} Hz`}{o.confirmed ? '' : '*'}
                        </button>
                      ))}
                    </div>
                    <div className="row spread">
                      <span className="label">Gear: {fun.extend.reportRateGear(fd)}</span>
                    </div>
                    <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
                      {rates.filter((o) => o.hz < 1000).map((o) => (
                        <button
                          key={o.gear}
                          className={`btn sm${fun.extend.reportRateGear(fd) === o.gear ? ' primary' : ' ghost'}`}
                          title={`gear ${o.gear}`}
                          onClick={() => edit(() => fun.extend.setReportRateGear(fd, o.gear))}
                        >
                          {o.hz} Hz
                        </button>
                      ))}
                    </div>
                  </div>


                  <div className="card">
                    <SectionTitle title="Bit depth — 8–24">8–12 are standard settings. Higher values are experimental firmware requests and may be ignored or produce unusual quantisation. A setting label does not prove sensor resolution. Use Lab → Bit-depth verification to compare vendor original-axis data and XInput output.</SectionTitle>
                    <p className="hint">Anything above 12 is a gimmick, but people want the options so they stay</p>
                    <div className="row wrap" style={{ gap: 8, margin: '10px 0' }}>
                      {STICK_RESOLUTION_OPTIONS.map((o) => (
                        <button
                          key={o.bits}
                          className={`btn sm${resBits === o.bits ? ' primary' : ' ghost'}`}
                          onClick={() => edit(() => fun.extend.setStickResolutionBits(fd, o.bits))}
                        >
                          {o.bits}-bit
                        </button>
                      ))}
                      {EXTENDED_BITS.map((bits) => (
                        <button
                          key={bits}
                          className={`btn sm${resWire === bitsToWireRaw(bits) ? ' primary' : ' ghost'}`}
                          title="Experimental firmware request. Measure output in Lab before keeping it."
                          onClick={() => edit(() => fun.extend.setStickResolution(fd, bitsToWireRaw(bits)))}
                        >
                          {bits}-bit*
                        </button>
                      ))}
                    </div>
                    <div className="row" style={{ gap: 8, marginTop: 8 }}>
                      <input
                        className="input"
                        style={{ width: 90 }}
                        type="number"
                        min={8}
                        max={12}
                        step={1}
                        placeholder="8–12"
                        value={bitCustom}
                        onChange={(e) => setBitCustom(e.target.value)}
                      />
                      <button
                        className="btn sm"
                        onClick={() => {
                          const b = Number(bitCustom)
                          if (!Number.isFinite(b)) return
                          edit(() => fun.extend.setStickResolutionBits(fd, Math.max(8, Math.min(12, Math.round(b)))))
                          setBitCustom('')
                        }}
                      >
                        Set custom bits
                      </button>
                    </div>
                    {!resInfo.standard && (
                      <div className="note bad" style={{ marginTop: 8 }}>
                        Experimental setting · wire {resInfo.wire}
                      </div>
                    )}
                  </div>


                </div>
                <div className="stack" style={{ gap: 16 }}>
                  <div className="card">
                    <div className="section-title"><h3>Controller Rate</h3><Help title="Controller Rate">How fast this stick answers in Mouse mode — higher moves the cursor more per deflection. It does <strong>not</strong> change how often the pad sends inputs; that is the Polling card. Only applies while Output is Mouse. 300* stores the maximum byte value of 255; None stores the stock neutral value of 50.</Help></div>
                    <div className="stack" style={{ gap: 12 }}>
                      <label className="row"><input type="checkbox" checked={outputLocks[which]} onChange={e => { const next: [boolean, boolean] = [...outputLocks]; next[which] = e.target.checked; setOutputLocks(next) }} />Lock normal stick output<Help title="Output lock">On Write, prevents this stick from using Mouse output by restoring its normal left/right stick destination. Saved on this PC; it does not change your curve or sensitivity.</Help></label>
                      <div className="row spread">
                        <div>
                          <div style={{ fontSize: 13.5 }}>Rate — constant per pick</div>
                        </div>
                        <span className="mono">stored: {stick.mouseDpi(pkt)}</span>
                      </div>
                      <div className="row wrap" style={{ gap: 8 }}>
                        {[{ rate: null as number | null, label: 'None' }, ...[100, 150, 200, 250, 300].map((rate) => ({ rate: rate as number | null, label: `${rate}${rate > 255 ? '*' : ''}` }))].map((opt) => {
                          const wire = opt.rate === null ? 50 : Math.min(opt.rate, 255)
                          const active = stick.mouseDpi(pkt) === wire
                          return (
                            <button
                              key={opt.label}
                              className={`btn sm${active ? ' primary' : ' ghost'}`}
                              title={opt.rate === null ? 'Stock neutral 50 — no added rate, Steam export skips it' : opt.rate > 255 ? `Firmware byte caps at 255 — stores ${wire}` : `Stores ${wire}`}
                              onClick={() => edit(() => stick.setMouseDpi(pkt, wire))}
                            >
                              {opt.label}
                            </button>
                          )
                        })}
                        {stick.mapIndex(pkt) === 4 && (
                          <button
                            className="btn sm ghost"
                            title="Restore this stick to normal stick output"
                            onClick={() => edit(() => { stick.setMapIndex(pkt, which === 0 ? 1 : 2); stick.setMapped(pkt, true) })}
                          >
                            ← Back to {which === 0 ? 'Left' : 'Right'} stick
                          </button>
                        )}
                      </div>
                    </div>
                  </div>


                  <div className="card">
                    <div className="section-title"><h3>Shape</h3><Help title="Shape">{isWebVersion() ? 'Round and square control diagonal reach. Linear full range also resets deadzones, output limits, curve and axis balance. Linear keeps processing enabled. Calibration and game sensitivity may still affect behavior.' : 'Round and square control diagonal reach. Linear full range also resets deadzones, output limits, curve and axis balance. Linear keeps processing enabled. PureRaw clears a firmware processing flag but does not reliably bypass every stage. PureRaw Deadzone (Processing) keeps processing enabled and neutralizes only the curve; selecting another shape enables processing again. Calibration and game sensitivity may still affect behavior.'}</Help></div>
                    <div className="stack" style={{ gap: 8 }}>
                      {(
                        [
                          { name: 'Round diagonals', hint: 'Uses a round diagonal boundary: the stick reaches a circular edge instead of extending into square corners. Your current deadzones and response curve are kept.' },
                          { name: 'Square gate', hint: 'Allows full X and Y output together at the corners. Diagonal magnitude can exceed a circular gate; your current deadzones and response curve are kept.' },
                          { name: 'Linear full range (1:1)', hint: 'Resets deadzones, output limits, curve and axis balance for linear full-range response. Stick processing stays enabled. Calibration and game settings still apply.' },
                          { name: 'PureRaw Deadzone (Processing)', hint: 'Keeps processing enabled with a neutral response curve. Preserves deadzones, anti-deadzones, gate, axis balance, mapping and all unrelated settings.' },
                          { name: 'PureRaw', hint: 'Clears the processing-enable flag while preserving stored tuning. Firmware may still apply deadzones and anti-deadzones. Reconnecting can cap output at about 20%; Auto reapply uses the tested Square-to-PureRaw recovery sequence.' }
                        ] as const
                      ).filter(s => !isWebVersion() || !s.name.startsWith('PureRaw')).map((s) => {
                        const isRaw = stick.isRawLinear(pkt)
                        const isSquare = stick.enabled(pkt) && stick.squareGate(pkt) && !isRaw
                        const isRound = stick.enabled(pkt) && !stick.squareGate(pkt)
                        const active = (s.name === 'Round diagonals' && isRound) || (s.name === 'Square gate' && isSquare) || (s.name === 'Linear full range (1:1)' && isRaw) || (s.name === 'PureRaw Deadzone (Processing)' && stick.enabled(pkt) && stick.isIdentityCurve(pkt) && !isRaw) || (s.name === 'PureRaw' && !stick.enabled(pkt))
                        return (
                          <div key={s.name} className="shape-choice"><button
                            className={`btn sm${active ? ' primary' : ' ghost'}`}
                            title={s.hint}
                            onClick={() => {
                              edit(() => {
                                if (s.name === 'Linear full range (1:1)') {
                                  stick.applyRawLinear(pkt)
                                } else if (s.name === 'PureRaw Deadzone (Processing)') {
                                  applyPureRawProcessing(pkt)
                                } else if (s.name === 'PureRaw') {
                                  stick.setEnabled(pkt, false)
                                } else {
                                  stick.setEnabled(pkt, true)
                                  stick.setSquareGate(pkt, s.name === 'Square gate')
                                }
                              })
                              if(s.name === 'PureRaw Deadzone (Processing)')syncDesignFromCopy()
                            }}
                          >
                            {s.name}
                          </button><Help title={s.name}>{s.hint}</Help>{s.name==='PureRaw'&&<PureRawReconnect/>}</div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="card" style={{ borderColor: 'var(--bad)' }}>
                    <div className="section-title"><h3>Reset everything</h3><Help title="Reset everything">Returns every byte this app can write to stock neutral — both sticks (deadzone, curve, flips, gate, axis, mouse rate, outputs), outer unlimited, 12-bit, 8K polling, RC off. Names, triggers, buttons and macros are untouched. Then Write to apply.</Help></div>
                    <button
                      className="btn danger"
                      style={{ width: '100%', padding: '14px', fontSize: 15, fontWeight: 700, letterSpacing: '0.08em', marginTop: 10 }}
                      onClick={() => {
                        if (!profile || !fd) return
                        if (!window.confirm('Reset EVERYTHING this app controls to stock neutral?\n\nBoth sticks, outer, detail, polling, RC. Names, triggers, buttons and macros are kept.')) return
                        edit(() => {
                          profile.sticks.forEach((s, i) => {
                            stick.setDeadzone(s, { begin: 50, end: 1000, beginAnti: 0, endAnti: 1000 })
                            stick.setCurve(s, LINEAR_CURVE.map((p) => ({ ...p })))
                            stick.setFlipX(s, false)
                            stick.setFlipY(s, false)
                            stick.setSquareGate(s, false)
                            stick.setAxisRatio(s, 50)
                            stick.setMouseDpi(s, 50)
                            stick.setMapIndex(s, i === 0 ? 1 : 2)
                            stick.setMapped(s, true)
                          })
                          fun.extend.setStickResolutionBits(fd, 12)
                          fun.extend.setReportRateGear(fd, 5)
                          fun.extend.setLsAntiJitter(fd, 11)
                          fun.extend.setRsAntiJitter(fd, 11)
                        })
                        syncDesignFromCopy()
                        setMsg('Everything reset to stock neutral — Write to apply it to the pad.')
                      }}
                    >
                      RESET EVERYTHING
                    </button>
                  </div>

                </div>
              </div>
              </>
              )}
            </>
          )}
          {tab === 'center' && (
            connected && modelId === 'G7ProCE' ? <CenterOffsets busy={busy} /> :
              <div className="msg"><h3>Connect a G7 Pro 8K</h3><p>Center-offset commands are currently verified against the G7 Pro 8K software path only.</p></div>
          )}
          {tab === 'firmware' && <FirmwarePanel hasUnsavedEdits={dirty} />}
          {(tab === 'triggers' || tab === 'gyro') && (connected && profile && modelId === 'G7ProCE' ? (tab === 'triggers' ? <TriggerTuning key={`triggers:${slot}:${loadId}`} profile={profile} edit={edit} busy={busy} /> : <GyroTuning key={`gyro:${slot}:${loadId}`} profile={profile} edit={edit} busy={busy} />) : <div className="note">Connect an identified G7 Pro 8K and load a profile to tune triggers and gyro.</div>)}
          {tab === 'bindings' && (connected && profile && ['G7ProCE', 'T3CE'].includes(modelId) ? <Bindings key={`${slot}:${loadId}`} profile={profile} modelId={modelId} edit={edit} busy={busy} shiftLayer={slot === SHIFT_SLOT} /> : <div className="note">Connect an identified G7 Pro 8K or Tarantula 8K and load a profile to edit bindings.</div>)}
          {tab === 'macros' && (connected && profile && modelId === 'G7ProCE' ? <Macros key={`${slot}:${loadId}`} profile={profile} edit={edit} busy={busy} /> : <div className="note">Connect an identified G7 Pro 8K and load a profile to edit macros.</div>)}
          {tab === 'rc' && (
            connected && !locked && fd && blob ? (
              <RcFilters key={modelId + ':' + slot + ':' + loadId} fd={fd} edit={edit} busy={busy} dirty={dirty} connected={connected} slot={slot} firmware={info?.firmware ?? ''} bytes={blob} />
            ) : <div className="msg"><h3>Connect and load a supported controller</h3><p>RC filters need a loaded G7 Pro 8K, G7 Pro or Tarantula 8K profile.</p></div>
          )}
          {tab === 'profiles' && (
            <ProfilesPage>
              <ProfilesPanel connected={connected} activeSlot={info?.currentProfile ?? null} locked={locked} modelId={modelId} modelLen={modelLen} dumpLength={model?.dumpLength ?? 0} modelName={model?.marketingName ?? null} />
            </ProfilesPage>
          )}
          {tab === 'calibrate' && (
            connected && modelId === 'G7ProCE' ? (
              <CalibrationPanel />
            ) : (
              <div className="msg"><h3>Connect a supported controller</h3><p>Guided calibration currently supports the identified G7 Pro 8K.</p></div>
            )
          )}
          {tab === 'marius' && (
            <MariusPanel />
          )}
          {tab === 'lab' && (
          <PerformanceBench
            precisionAvailable={connected && modelId === 'G7ProCE' && !!profile && !dirty && !busy && !locked}
            identity={(connPath ?? '') + ' · ' + (info?.firmware ?? '') + ' · ' + (modelId ?? '')}
            reload={() => loadSlot(slot)}
            targetHz={gearHz}
            connection={pid === null ? 'Unknown' : [0x10c5, 0x10c7].includes(pid) ? 'USB wired' : [0x10c6, 0x10c8].includes(pid) ? '2.4 GHz receiver' : 'USB identity 0x' + pid.toString(16)}
            profile={slot}
            connected={connected}
            device={model?.marketingName ?? 'Unknown controller'}
            info={info}
            context={
              profile && fd
                ? 'Now editing P' + slot + ': set ' + gearHz.toLocaleString() + ' Hz (gear ' + gear + ') · ' + resolutionLabel + '. This is the edited profile; it may differ from the running slot.'
                : 'Connect and load a slot to record the target settings alongside your measurements.'
            }
          />
          )}
          {tab === 'steam' && <SteamCard
            left={tab === 'steam' ? deadzonePct(vSticks[0]) : profile ? deadzonePct(profile.sticks[0]) : null}
            right={tab === 'steam' ? deadzonePct(vSticks[1]) : profile ? deadzonePct(profile.sticks[1]) : null}
            mouseRate={tab === 'steam' ? vMouse : profile && stick.mouseDpi(profile.sticks[1]) !== 50 ? stick.mouseDpi(profile.sticks[1]) : null}
            fittedK={tab === 'steam' ? fitCurveExponent(vDesign) : profile ? fitCurveExponent(stick.curve(profile.sticks[1])) : null}
          />}
          </>}
        </div>
      </main>
    </div>
  )
}
