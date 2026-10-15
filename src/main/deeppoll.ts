/**
 * Kernel USB poll check — elevated ETW trace (logman) + tracerpt convert,
 * parsed in Node. Method follows the proven DeepPoll approach (MIT —
 * original implementation written from the method description, credited
 * in the Lab UI hint): UCX transfer Start/Stop paired by URB pointer,
 * device handles mapped via USBHUB3 interface paths, host stalls excluded.
 *
 * Needs Windows admin (UAC prompts once per run). No electron imports —
 * node builtins only, so renderer tests can exercise the pure parts
 * (those live in shared/deeppoll.ts).
 */
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as readline from 'node:readline'
import { dpComputeRate, dpPairIntervals, dpBin, dpPercentile, dpPickDevice, type DeepPollResult } from '../shared/deeppoll'

const SESSION = 'sticklabs-poll'
const CAPTURE_SECS = 8

function psScript(secs: number, etl: string, xml: string, done: string): string {
  return [
    "$ErrorActionPreference = 'Stop'",
    `$etl = '${etl}'`,
    `$xml = '${xml}'`,
    `$done = '${done}'`,
    'Remove-Item $etl,$xml,$done -ErrorAction SilentlyContinue',
    'logman stop sticklabs-poll -ets 2>$null | Out-Null',
    'logman start sticklabs-poll -p Microsoft-Windows-USB-UCX -o $etl -nb 64 256 -bs 512 -ct perf -ets | Out-Null',
    'logman update sticklabs-poll -p Microsoft-Windows-USB-USBHUB3 -ets | Out-Null',
    `Start-Sleep -Seconds ${secs}`,
    'logman stop sticklabs-poll -ets | Out-Null',
    'tracerpt $etl -o $xml -of XML -y | Out-Null',
    "'done' | Out-File -FilePath $done -Encoding ascii"
  ].join('\r\n')
}

/** XML entity decode for Data payloads (interface paths carry &amp;). */
function xmlText(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
}

interface Rec {
  urb: string
  dev: string
  t: number
  kind: 'start' | 'stop'
}

/** Streaming tracerpt-XML parse → dispatch/completion records + dev map. */
export async function parseTraceXml(
  xmlPath: string,
  onEvent?: (n: number) => void
): Promise<{ records: Rec[]; devmap: Map<string, string> }> {
  const records: Rec[] = []
  const devmap = new Map<string, string>()
  let inEvent = false
  let provider = ''
  let opcode = ''
  let bulkSeen = false
  let timeMs = NaN
  let data: Record<string, string> = {}
  let count = 0
  const rl = readline.createInterface({ input: fs.createReadStream(xmlPath), crlfDelay: Infinity })
  const flush = (): void => {
    if (!inEvent) return
    inEvent = false
    if (!Number.isFinite(timeMs)) {
      data = {}
      return
    }
    if (provider.includes('USBHUB3')) {
      // Device-enumeration rundown: fid_UsbDevice plus VID/PID, either as
      // nested idVendor/idProduct or inside the interface path.
      const dev = (data['fid_UsbDevice'] ?? '').trim().toUpperCase()
      const nestedVid = (data['fid_idVendor'] ?? '').trim()
      const nestedPid = (data['fid_idProduct'] ?? '').trim()
      let vp = ''
      if (/^0x/i.test(nestedVid) && /^0x/i.test(nestedPid)) {
        vp = `${nestedVid.slice(2).toUpperCase().padStart(4, '0')}:${nestedPid.slice(2).toUpperCase().padStart(4, '0')}`
      } else {
        const p = xmlText(data['fid_DeviceInterfacePath'] ?? '')
        const m = /VID_([0-9A-Fa-f]{4})&PID_([0-9A-Fa-f]{4})/.exec(p)
        if (m) vp = `${m[1].toUpperCase()}:${m[2].toUpperCase()}`
      }
      if (dev && vp && vp !== '0000:0000') devmap.set(dev.replace(/^0X/, ''), vp)
    } else if (provider.includes('USB-UCX')) {
      // Pointers are 64-bit: keep raw strings, never Number() them.
      const urb = (data['fid_URB_Ptr'] ?? '').trim().toUpperCase().replace(/^0X/, '')
      if (!urb) return
      const hasStatus = (data['fid_IRP_NtStatus'] ?? '') !== ''
      const hasDev = (data['fid_UsbDevice'] ?? '') !== ''
      if (opcode === '1' || (opcode === '' && !hasStatus && hasDev)) {
        if (!bulkSeen) return
        const dev = (data['fid_UsbDevice'] ?? '').trim().toUpperCase().replace(/^0X/, '')
        if (!dev) return
        records.push({ urb, dev, t: timeMs * 1000, kind: 'start' })
      } else if (opcode === '2' || hasStatus) {
        records.push({ urb, dev: '', t: timeMs * 1000, kind: 'stop' })
      }
    }
    data = {}
  }
  for await (const line of rl) {
    const l = line.trim()
    if (/^<Event[\s>]/.test(l)) {
      flush()
      inEvent = true
      provider = ''
      opcode = ''
      bulkSeen = false
      timeMs = NaN
      data = {}
      count++
      if (onEvent && count % 200000 === 0) onEvent(count)
      continue
    }
    if (!inEvent) continue
    // tracerpt omits Provider Name here — map the well-known GUIDs.
    let m = /<Provider (?:Name="([^"]+)" )?Guid="\{?([^"}\s]+)\}?" ?\/>/.exec(l)
    if (m) {
      if (m[1]) provider = m[1]
      else {
        const g = m[2].toLowerCase()
        if (g.startsWith('36da592d')) provider = 'Microsoft-Windows-USB-UCX'
        else if (g.startsWith('ac52ad17')) provider = 'Microsoft-Windows-USB-USBHUB3'
      }
      continue
    }
    // Zone suffix varies by machine; only deltas matter, so drop it.
    m = /<TimeCreated SystemTime="(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?/.exec(l)
    if (m) {
      const base = Date.parse(`${m[1]}Z`)
      const frac = m[2] ? Number(`0.${m[2]}`) : 0
      timeMs = base + frac * 1000
      continue
    }
    m = /<Opcode>([^<]*)<\/Opcode>/.exec(l)
    if (m) {
      opcode = m[1].trim()
      continue
    }
    if (l.includes('BULK_OR_INTERRUPT')) bulkSeen = true
    m = /<Data Name="([^"]+)">([^<]*)<\/Data>/.exec(l)
    if (m) {
      data[m[1]] = m[2]
      continue
    }
    m = /<Data Name="([^"]+)"\s*\/>/.exec(l)
    if (m) data[m[1]] = ''
    if (l.startsWith('</Event')) flush()
  }
  flush()
  return { records, devmap }
}

export interface DeepPollRun {
  vid: number
  pid: number
  seconds?: number
}

function hex4(n: number): string {
  return n.toString(16).toUpperCase().padStart(4, '0')
}

/**
 * Run the elevated kernel trace and return the measured poll rate for the
 * target VID:PID (falls back to the busiest interrupt device). Never throws
 * for expected failures — they come back as ok:false results.
 */
export async function runDeepPoll(run: DeepPollRun): Promise<DeepPollResult> {
  const fail = (error: string): DeepPollResult => ({
    ok: false, vidPid: '', rateHz: 0, samples: 0, stalls: 0, stallMs: 0, p50: 0, p95: 0, bins: [], devices: [], error
  })
  const secs = Math.min(30, Math.max(4, Math.round(run.seconds ?? CAPTURE_SECS)))
  const tag = `${Date.now().toString(36)}`
  const tmp = os.tmpdir()
  const ps1 = path.join(tmp, `sticklabs-poll-${tag}.ps1`)
  const etl = path.join(tmp, `sticklabs-poll-${tag}.etl`)
  const xml = path.join(tmp, `sticklabs-poll-${tag}.xml`)
  const done = path.join(tmp, `sticklabs-poll-${tag}.done`)
  const cleanup = (): void => {
    for (const f of [ps1, etl, xml, done]) {
      try {
        fs.unlinkSync(f)
      } catch {
        /* best effort */
      }
    }
  }
  try {
    fs.writeFileSync(ps1, psScript(secs, etl, xml, done), 'utf8')
  } catch (e) {
    return fail(`cannot stage tracer: ${(e as Error).message}`)
  }
  try {
    const inner = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1]
    const outer = [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
      `Start-Process -FilePath 'powershell.exe' -ArgumentList '${inner.join("','")}' -Verb RunAs -Wait`
    ]
    const r = spawnSync('powershell.exe', outer, { timeout: (secs + 300) * 1000, windowsHide: true })
    if (r.error) {
      const msg = String((r.error as Error).message ?? r.error)
      if (/cancel/i.test(msg)) return fail('admin was declined — no trace ran')
      return fail(`elevation failed: ${msg.slice(0, 160)}`)
    }
    const stderr = r.stderr?.toString() ?? ''
    if (/cancel/i.test(stderr)) return fail('admin was declined — no trace ran')
    if (r.status !== 0 && !fs.existsSync(xml)) {
      return fail(`tracer exited ${r.status ?? '?'}: ${stderr.slice(0, 200)}`)
    }
    if (!fs.existsSync(xml)) return fail('no trace data — the elevated step produced nothing')
    const { records, devmap } = await parseTraceXml(xml)
    const perDev = dpPairIntervals(records)
    if (perDev.size === 0) return fail('no USB transfers captured — replug the pad and retry')
    const picked = dpPickDevice(perDev, devmap, hex4(run.vid))
    const pick = picked ? { dev: picked.dev, iv: picked.iv } : null
    if (!pick) return fail('no intervals measured')
    const vidPid = devmap.get(pick.dev) ?? 'unknown'
    const calc = dpComputeRate(pick.iv)
    const sorted = [...pick.iv].sort((a, b) => a - b)
    const devices = [...perDev]
      .map(([dev, iv]) => {
        const c = dpComputeRate(iv)
        return {
          vidPid: devmap.get(dev) ?? 'unknown',
          rateHz: c.rateHz,
          samples: iv.length,
          stalls: c.stalls,
          stallMs: c.stallMs
        }
      })
      .sort((a, b) => b.samples - a.samples)
      .slice(0, 12)
    return {
      ok: true,
      vidPid,
      rateHz: calc.rateHz,
      samples: pick.iv.length,
      stalls: calc.stalls,
      stallMs: calc.stallMs,
      p50: dpPercentile(sorted, 50),
      p95: dpPercentile(sorted, 95),
      bins: dpBin(pick.iv),
      devices
    }
  } catch (e) {
    return fail(`trace failed: ${(e as Error).message.slice(0, 200)}`)
  } finally {
    cleanup()
  }
}
