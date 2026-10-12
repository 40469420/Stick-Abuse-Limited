/**
 * Client for scripts/flybridge.py — Flydigi Apex 5 over hidapi (stdio JSON).
 *
 * WebHID/node-hid cannot reliably do this pad's interrupt-OUT reports, so a
 * tiny Python bridge owns the handle. Same framing as renderer/flydigiUsb
 * used to speak; only the last mile changed.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { FLY_PID_APEX5, FLY_USAGE_CMD, FLY_VID } from '../shared/flydigi'

interface BridgeReply {
  id: number
  ok: boolean
  error?: string
  frame?: number[]
  frames?: number[][]
  path?: string
}

function pythonCandidates(): string[] {
  const out: string[] = []
  const env = process.env.STICKLABS_PYTHON
  if (env) out.push(env)
  try {
    const appData = app.getPath('appData')
    const base = join(process.env.LOCALAPPDATA ?? join(appData, '..', 'Local'), 'Programs', 'Python')
    for (const dir of readdirSync(base)) {
      const exe = join(base, dir, 'python.exe')
      if (/^Python\d/i.test(dir) && existsSync(exe)) out.push(exe)
    }
  } catch {
    /* no local pythons */
  }
  out.push('python', 'python3')
  return out
}

export class FlyBridge {
  private proc: ChildProcess | null = null
  private seq = 0
  private pending = new Map<number, { resolve: (r: BridgeReply) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>()
  private buf = ''

  get running(): boolean {
    return !!this.proc && !this.proc.killed
  }

  private onData = (chunk: Buffer): void => {
    this.buf += chunk.toString('utf8')
    let nl: number
    while ((nl = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, nl).trim()
      this.buf = this.buf.slice(nl + 1)
      if (!line) continue
      let msg: BridgeReply
      try {
        msg = JSON.parse(line) as BridgeReply
      } catch {
        continue
      }
      const entry = this.pending.get(msg.id)
      if (!entry) continue
      this.pending.delete(msg.id)
      clearTimeout(entry.timer)
      entry.resolve(msg)
    }
  }

  async start(python?: string): Promise<void> {
    if (this.running) return
    const script = join(app.getAppPath(), 'scripts', 'flybridge.py')
    if (!existsSync(script)) throw new Error(`flybridge.py missing at ${script}`)
    const cands = python ? [python] : pythonCandidates()
    let lastError = 'no python interpreter found (need python3 + pip install hidapi)'
    for (const exe of cands) {
      try {
        await this.tryStart(exe, script)
        return
      } catch (err) {
        lastError = (err as Error).message
      }
    }
    throw new Error(lastError)
  }

  private tryStart(exe: string, script: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const proc = spawn(exe, [script], { stdio: ['pipe', 'pipe', 'pipe'] })
      const fail = (err: Error): void => {
        try {
          proc.kill()
        } catch {
          /* ignore */
        }
        reject(err)
      }
      proc.on('error', (e) => fail(e instanceof Error ? e : new Error(String(e))))
      let ready = ''
      const timer = setTimeout(() => fail(new Error(`${exe}: bridge handshake timeout`)), 15000)
      proc.stdout?.on('data', (chunk: Buffer) => {
        if (!this.proc) {
          // Still handshaking — look for the ready line.
          ready += chunk.toString('utf8')
          const nl = ready.indexOf('\n')
          if (nl >= 0) {
            clearTimeout(timer)
            try {
              const msg = JSON.parse(ready.slice(0, nl)) as { ready: boolean; error?: string }
              if (msg.ready) {
                this.proc = proc
                proc.stdout?.on('data', this.onData)
                proc.on('exit', () => this.dropAll(new Error('flybridge exited')))
                resolve()
              } else {
                fail(new Error(`${exe}: ${msg.error ?? 'bridge refused'}`))
              }
            } catch (e) {
              fail(e instanceof Error ? e : new Error(String(e)))
            }
          }
          return
        }
        this.onData(chunk)
      })
      proc.stderr?.on('data', () => undefined)
    })
  }

  private dropAll(err: Error): void {
    this.proc = null
    for (const entry of [...this.pending.values()]) {
      clearTimeout(entry.timer)
      entry.reject(err)
    }
    this.pending.clear()
  }

  stop(): void {
    const proc = this.proc
    this.proc = null
    this.dropAll(new Error('bridge stopped'))
    try {
      proc?.kill()
    } catch {
      /* ignore */
    }
  }

  call(op: string, params: Record<string, unknown> = {}, timeoutMs = 20000): Promise<BridgeReply> {
    if (!this.running) return Promise.reject(new Error('flybridge not running'))
    const id = ++this.seq
    return new Promise<BridgeReply>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`flybridge ${op} timed out`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      try {
        this.proc?.stdin?.write(JSON.stringify({ id, op, ...params }) + '\n')
      } catch (err) {
        this.pending.delete(id)
        clearTimeout(timer)
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })
  }

  async open(): Promise<void> {
    await this.start()
    const res = await this.call('open', { vid: FLY_VID, pid: FLY_PID_APEX5, usagePage: FLY_USAGE_CMD }, 10000)
    if (!res.ok) throw new Error(res.error ?? 'flybridge open failed')
  }

  close(): void {
    if (this.running) void this.call('close', {}, 3000).catch(() => undefined)
  }
}

export const flyBridge = new FlyBridge()
