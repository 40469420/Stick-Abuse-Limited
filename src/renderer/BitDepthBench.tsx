import { useEffect, useRef, useState } from 'react'
import { fun, parseProfile, serializeProfile } from '@shared/profile'
import { PROFILE_LENGTH } from '@shared/protocol'
import { bitsToWireRaw, EXTENDED_BITS } from '@shared/sticklab'
import { comparePrecision, type CodeEvidence, type PrecisionPair } from '@shared/precision'
import type { BenchSample } from '@shared/bench'
import { api } from './api'
import { Help, SectionTitle } from './Help'

const KEY = 'sticklabs.bit-depth.restore.v1'
const encode = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes))
const decode = (text: string): Uint8Array => Uint8Array.from(atob(text), c => c.charCodeAt(0))
interface Backup { identity: string; slot: number; wire: number }
interface Capture { wire: number; stage: 'rest' | 'sweep'; source: string; date: string; codes: CodeEvidence[]; durationMs: number; observations: number; trace?: BenchSample[] }
function backup(): Backup | null {
  try { const b = JSON.parse(localStorage.getItem(KEY) ?? 'null'); return b && typeof b.identity === 'string' && Number.isInteger(b.slot) && b.slot >= 1 && b.slot <= 4 && Number.isInteger(b.wire) && b.wire >= 0 && b.wire <= 255 ? b : null } catch { return null }
}
export function BitDepthBench({ session, disabled, available, identity, profileSlot, task, setTask, reload, context }: {
  session: () => string | null; disabled: boolean; available: boolean; identity: string; profileSlot: number; task: string
  setTask: (v: string) => void; reload: () => Promise<void>
  context: { appVersion: string; device: string; firmware: string; receiver: string; connection: string; targetHz: number }
}): JSX.Element {
  const [original, setOriginal] = useState<Backup | null>(backup), [bits, setBits] = useState(16)
  const [source, setSource] = useState('vendor'), [slots, setSlots] = useState<number[]>([]), [seconds, setSeconds] = useState(10)
  const [captures, setCaptures] = useState<Capture[]>([]), [note, setNote] = useState(''), [signature, setSignature] = useState('')
  const alive = useRef(true), operation = useRef(false), latest = useRef({ identity, profileSlot })
  latest.current = { identity, profileSlot }
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => { setCaptures([]); setSignature(''); setNote('') }, [identity, profileSlot, source, bits, seconds])
  const matches = original?.identity === identity && original.slot === profileSlot
  async function read(): Promise<{ bytes: Uint8Array; wire: number; signature: string }> {
    if (await api().currentProfile() !== profileSlot) throw new Error('Activate the selected profile before testing. The bench will not switch profiles automatically.')
    const result = await api().readProfile(profileSlot, PROFILE_LENGTH), bytes = decode(result.bytes)
    if (bytes.length !== PROFILE_LENGTH) throw new Error('Unexpected profile length. Test stopped.')
    const p = parseProfile(bytes, 'G7ProCE'), wire = fun.extend.stickResolution(p.funData)
    fun.extend.setStickResolution(p.funData, 0)
    return { bytes: decode(result.bytes), wire, signature: encode(serializeProfile(p)) }
  }
  async function work(label: string, fn: () => Promise<void>): Promise<void> {
    const id = session(), startIdentity = identity, startSlot = profileSlot
    if (!id || operation.current || disabled) return
    operation.current = true; setTask(label); setNote('')
    try { await fn() } catch (e) { if (alive.current) setNote((e as Error).message) }
    finally { operation.current = false; if (alive.current && session() === id && latest.current.identity === startIdentity && latest.current.profileSlot === startSlot) setTask('') }
  }
  async function apply(wire: number, restoring = false): Promise<void> {
    await work('bit-setting', async () => {
      const initialId = session()
      const before = await read()
      if (!restoring && signature && before.signature !== signature) throw new Error('Other profile settings changed. Clear captures and restart before applying the next test setting.')
      if (!alive.current || session() !== initialId || latest.current.identity !== identity || latest.current.profileSlot !== profileSlot) throw new Error('Test page or controller changed. No write started.')
      if (!restoring && original && !matches) throw new Error('A restore setting exists for another connection/profile. Restore it there first, or clear it explicitly below.')
      const b = original ?? { identity, slot: profileSlot, wire: before.wire }
      // Persist before writing, so reconnecting or quitting does not lose the original byte.
      if (!original) { localStorage.setItem(KEY, JSON.stringify(b)); setOriginal(b) }
      const p = parseProfile(before.bytes, 'G7ProCE'); fun.extend.setStickResolution(p.funData, wire)
      const result = await api().writeProfile(profileSlot, encode(serializeProfile(p)), PROFILE_LENGTH)
      if (!result.verified) throw new Error(result.rolledBack ? 'Write failed verification and was rolled back.' : 'Write was not verified. Reconnect and check the setting.')
      await reload()
      // A reboot can interrupt this read. Keep the restore record until a subsequent verified restore.
      const after = await read()
      if (after.wire !== wire) throw new Error('Controller did not retain the requested setting. No capture was labeled with it.')
      if (before.signature !== after.signature) throw new Error('Other profile bytes changed. Start the comparison again.')
      if (restoring) { localStorage.removeItem(KEY); setOriginal(null); setNote('Original bit-depth setting restored and read back.') }
      else { setSignature(after.signature); setNote('Setting written and read back. Wait for live input, then capture rest and sweep.') }
    })
  }
  async function capture(wire: number, stage: 'rest' | 'sweep'): Promise<void> {
    await work('bit-capture', async () => {
      const id = session()!, before = await read()
      if (before.wire !== wire) throw new Error('The active profile does not contain this setting. Apply it first.')
      if (signature && before.signature !== signature) throw new Error('Other profile settings changed. Clear captures and restart to make a fair comparison.')
      const result = source === 'vendor' ? await api().benchCapture(id, stage === 'rest' ? 'rest' : 'timing', seconds) : await api().benchXInput(id, Number(source), seconds)
      if (session() !== id || !alive.current) return
      const after = await read()
      if (before.wire !== after.wire || before.signature !== after.signature) throw new Error('Profile changed during capture. Result discarded.')
      if ('limited' in result && result.limited) throw new Error('Sample limit reached. Retry with a shorter duration.')
      if (!result.codes) throw new Error('Original axis-code evidence is unavailable.')
      setSignature(before.signature)
      setCaptures(rows => [...rows.filter(r => r.wire !== wire || r.stage !== stage), { wire, stage, source, date: new Date().toISOString(), codes: result.codes!,
        durationMs: result.durationMs, observations: 'reports' in result ? result.reports : result.polls, trace: 'trace' in result ? result.trace : undefined }])
      setNote(stage === 'rest' ? 'Rest captured. Now slowly sweep each axis through its full travel.' : 'Sweep captured. Complete the other setting to compare.')
    })
  }
  const pair = (wire: number): PrecisionPair | null => {
    const rest = captures.find(c => c.wire === wire && c.stage === 'rest'), sweep = captures.find(c => c.wire === wire && c.stage === 'sweep')
    return rest && sweep ? { rest: rest.codes, sweep: sweep.codes } : null
  }
  const base = pair(0), test = pair(bitsToWireRaw(bits)), comparison = base && test ? comparePrecision(base, test) : null
  function exportResults(): void {
    const blob = new Blob([JSON.stringify({ schema: 1, ...context, identity, profileSlot, requestedBits: bits, source, seconds, profileWithoutResolution: signature, captures, comparison,
      limitation: 'Reported output evidence only; does not prove sensor ADC resolution. Reconnect retention requires a new explicit read check.' }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'sticklabs-bit-depth-comparison.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <section className="card"><SectionTitle title="Bit-depth verification">Compares original 16-bit report codes at 12-bit and an experimental setting. Smaller steps, distinct positions and low-bit activity can come from interpolation or noise. The test does not establish physical sensor resolution. Keep curves, deadzones, RC, connection, profile and movement unchanged. XInput is measured separately from vendor reports; choose the correct slot by moving this controller in the normal XInput test first. Capture rest and sweep at each setting. Settings change only when you click Apply.</SectionTitle>
    {!available && <p className="note warn">Connect a G7 Pro 8K, load a profile and save or discard pending edits to enable this test.</p>}
    {original && <p className="step-status">Original setting saved for P{original.slot}: wire {original.wire}. {matches ? 'Restore is available below.' : 'Reconnect the original controller/profile to restore it.'} Leaving this page does not automatically restore settings.</p>}
    <p className="hint">P{profileSlot} must be active on the controller. Select the live profile shown in the sidebar before applying a test setting.</p>
    <fieldset className="control-fieldset" disabled={disabled || !available}><div className="control-grid">
      <label className="stack">Higher setting<select className="input" value={bits} onChange={e => setBits(Number(e.target.value))}>{EXTENDED_BITS.map(b => <option key={b} value={b}>{b}-bit · experimental</option>)}</select></label>
      <label className="stack">Input path<select className="input" value={source} onChange={e => setSource(e.target.value)}><option value="vendor">Vendor original axes</option>{slots.map(s => <option key={s} value={s}>XInput slot {s}</option>)}</select></label>
      <label className="stack">Capture length<select className="input" value={seconds} onChange={e => setSeconds(Number(e.target.value))}>{[5,10,30].map(s => <option key={s} value={s}>{s} seconds</option>)}</select></label>
    </div><button className="btn sm ghost" onClick={() => void work('bit-scan', async () => { const found = await api().listXInput(); if (alive.current) setSlots(found.map(s => s.slot)) })}>Find XInput slots</button>
    <div className="settings-grid" style={{ marginTop: 16 }}>{[12, bits].map(b => <div className="step-status" key={b}><strong>{b === 12 ? '1. Baseline' : '2. Comparison'} · {b}-bit</strong><div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
      <button className="btn" onClick={() => void apply(bitsToWireRaw(b))}>Apply {b}-bit</button>
      <button className="btn" onClick={() => void capture(bitsToWireRaw(b), 'rest')}>{captures.some(c => c.wire === bitsToWireRaw(b) && c.stage === 'rest') ? '✓ Repeat rest' : 'Capture rest'}</button>
      <button className="btn" onClick={() => void capture(bitsToWireRaw(b), 'sweep')}>{captures.some(c => c.wire === bitsToWireRaw(b) && c.stage === 'sweep') ? '✓ Repeat sweep' : 'Capture sweep'}</button>
    </div></div>)}</div>
    <p className="hint">Rest: controller flat, untouched. Sweep: slowly move each stick left/right and up/down several times. Use the same duration and motion at both settings.</p>
    <div className="row wrap" style={{ gap: 8 }}><button className="btn" disabled={!matches} onClick={() => { if (original) void apply(original.wire, true) }}>Restore original setting</button>
      <button className="btn" onClick={() => void work('bit-check', async () => { const r = await read(); setNote('Current active P' + profileSlot + ' resolution wire: ' + r.wire + '. Compare with 0 for 12-bit or ' + bitsToWireRaw(bits) + ' for the selected experiment. A match after reconnect confirms stored-setting retention, not improved resolution.') })}>Check setting / after reconnect</button>
      <button className="btn ghost" onClick={() => { setCaptures([]); setSignature(''); setNote('Captures cleared.') }}>Clear captures</button></div>
    </fieldset>
    {original && !matches && <button className="btn sm ghost" disabled={!!task} onClick={() => { if (window.confirm('Forget the saved restore setting? This does not change or restore the controller.')) { localStorage.removeItem(KEY); setOriginal(null) } }}>Forget stale restore record</button>}
    {task.startsWith('bit-') && <p role="status">{task === 'bit-capture' ? 'Capturing… follow the selected rest or sweep instruction.' : 'Checking controller…'}</p>}
    {note && <p className="note" role="status">{note}</p>}
    {comparison && <><SectionTitle title="Comparison results">Fine steps is the lower tenth percentile of gaps between sorted distinct output codes. Step grid is their greatest common divisor; a smaller grid alone can come from noise or interpolation. Rest noise is RMS variation around the mean, in signed 16-bit output-code units. Unique outputs counts reported codes, not verified physical positions. Both captures need comparable wide movement and still rest data. These are heuristic results; repeat the experiment before drawing conclusions.</SectionTitle><div className="bench-table-wrap"><table className="tbl"><thead><tr><th>Axis</th><th>Result</th><th>Fine steps · 12 / higher</th><th>Step grid · 12 / higher</th><th>Rest noise · 12 / higher</th><th>Unique outputs · 12 / higher</th></tr></thead><tbody>{comparison.map((r, i) => <tr key={i}><td>{['LX','LY','RX','RY'][i]}</td><td>{r.verdict} <Help title={['LX','LY','RX','RY'][i] + ' result'}>{r.reason}</Help></td><td>{base!.sweep[i].stepP10} / {test!.sweep[i].stepP10}</td><td>{base!.sweep[i].lattice} / {test!.sweep[i].lattice}</td><td>{base!.rest[i].rms.toFixed(2)} / {test!.rest[i].rms.toFixed(2)}</td><td>{base!.sweep[i].unique} / {test!.sweep[i].unique}</td></tr>)}</tbody></table></div><button className="btn" onClick={exportResults}>Export comparison JSON</button></>}
  </section>
}
