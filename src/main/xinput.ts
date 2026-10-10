import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { measureRcRest } from '../shared/rc'

export interface XInputSlot { slot: number; lx: number; ly: number; rx: number; ry: number }
export interface XInputCaptureResult {
  slot: number
  left: NonNullable<ReturnType<typeof measureRcRest>>
  right: NonNullable<ReturnType<typeof measureRcRest>>
  durationMs: number
  polls: number
  packetChanges: number
}

// Windows' own XInput API. No settings, rumble or firmware commands are sent.
const nativeCode = String.raw`
using System;
using System.Runtime.InteropServices;
using System.Diagnostics;
using System.Threading;
using System.Text;
using System.Globalization;
public static class RcXInput {
  [StructLayout(LayoutKind.Sequential)] public struct Pad {
    public ushort buttons; public byte lt, rt; public short lx, ly, rx, ry;
  }
  [StructLayout(LayoutKind.Sequential)] public struct State { public uint packet; public Pad pad; }
  [DllImport("xinput1_4.dll", EntryPoint="XInputGetState")]
  public static extern uint Read(uint index, out State state);
  public static string List() {
    var b = new StringBuilder("["); bool first = true;
    for(uint i=0; i<4; i++) { State s; if(Read(i,out s)!=0) continue;
      if(!first) b.Append(','); first=false;
      b.Append("{\"slot\":").Append(i).Append(",\"lx\":").Append(s.pad.lx)
       .Append(",\"ly\":").Append(s.pad.ly).Append(",\"rx\":").Append(s.pad.rx)
       .Append(",\"ry\":").Append(s.pad.ry).Append('}');
    } return b.Append(']').ToString();
  }
  public static string Capture(uint index) {
    State s; if(Read(index,out s)!=0) throw new Exception("Selected XInput slot is disconnected.");
    Console.WriteLine("READY"); Console.Out.Flush();
    if(Console.ReadLine()!="GO") throw new Exception("Capture cancelled before start.");
    var b=new StringBuilder(); var clock=Stopwatch.StartNew();
    uint previous=0; int count=0,changes=0;
    while(clock.Elapsed.TotalMilliseconds<3000) {
      if(Read(index,out s)!=0) throw new Exception("XInput controller disconnected during capture.");
      if(count>0) b.Append(',');
      if(count>0 && s.packet!=previous) changes++;
      previous=s.packet; count++;
      b.Append('[').Append(s.pad.lx).Append(',').Append(s.pad.ly).Append(',')
       .Append(s.pad.rx).Append(',').Append(s.pad.ry).Append(']');
      Thread.Sleep(1);
    }
    return "{\"durationMs\":"+clock.Elapsed.TotalMilliseconds.ToString(CultureInfo.InvariantCulture)
      +",\"packetChanges\":"+changes+",\"samples\":["+b.ToString()+"]}";
  }
}
`

function runXInput(slot: number | null, onReady?: () => void): { promise: Promise<unknown>; cancel: () => void } {
  if (slot !== null && (!Number.isInteger(slot) || slot < 0 || slot > 3)) throw new Error('Select XInput slot 0–3')
  if (process.platform !== 'win32') throw new Error('XInput comparison requires Windows')
  const script = `$ErrorActionPreference='Stop'\nAdd-Type -TypeDefinition @'\n${nativeCode}\n'@\n` +
    (slot === null ? '[RcXInput]::List()' : `[RcXInput]::Capture(${slot})`)
  const executable = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const child = spawn(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
  let rejectPending: (reason: Error) => void = () => undefined
  const promise = new Promise<unknown>((resolve, reject) => {
    rejectPending = reject
    let output = '', errors = '', ready = false
    const timeout = setTimeout(() => { child.kill(); reject(new Error('XInput helper timed out.')) }, 20000)
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8')
    child.stdin.on('error', (e) => { child.kill(); reject(e) })
    child.stdout.on('data', (chunk: string) => {
      output += chunk
      if (!ready && /^READY\r?\n/.test(output)) {
        ready = true; output = output.replace(/^READY\r?\n/, '')
        try { onReady?.(); child.stdin.end('GO\n') } catch (e) { child.kill(); reject(e) }
      }
      if (output.length > 2000000) { child.kill(); reject(new Error('XInput output exceeded its limit.')) }
    })
    child.stderr.on('data', (chunk: string) => { if (errors.length < 4000) errors += chunk })
    child.on('error', (e) => { clearTimeout(timeout); reject(e) })
    child.on('close', (code) => {
      clearTimeout(timeout)
      if (code !== 0) { reject(new Error(errors.includes('disconnected') ? 'Selected XInput slot is disconnected. Rescan and identify your controller.' : 'Windows XInput reader failed. ' + errors.slice(0, 250))); return }
      try { resolve(JSON.parse(output.trim())) } catch { reject(new Error('Invalid XInput response.')) }
    })
  })
  return { promise, cancel: () => { child.kill(); rejectPending(new Error('Capture cancelled.')) } }
}

export async function listXInput(): Promise<XInputSlot[]> {
  return await runXInput(null).promise as XInputSlot[]
}

export function captureXInput(slot: number, onReady: () => void): { promise: Promise<XInputCaptureResult>; cancel: () => void } {
  const helper = runXInput(slot, onReady)
  return { cancel: helper.cancel, promise: helper.promise.then((data) => summarizeXInput(slot, data)) }
}

export function summarizeXInput(slot: number, data: unknown): XInputCaptureResult {
    const raw = data as { samples: number[][]; durationMs: number; packetChanges: number } | null
    if (!raw || !Array.isArray(raw.samples) || raw.samples.length < 30 || raw.samples.length > 100000 ||
      !Number.isFinite(raw.durationMs) || raw.durationMs <= 0 ||
      !Number.isInteger(raw.packetChanges) || raw.packetChanges < 0 || raw.packetChanges >= raw.samples.length ||
      !raw.samples.every((s) => Array.isArray(s) && s.length === 4 && s.every((v) => Number.isInteger(v) && v >= -32768 && v <= 32767))) {
      throw new Error('Invalid or insufficient XInput samples.')
    }
    // Common display units: 256 signed XInput units = one vendor axis count.
    // No deadzone is applied. Y inversion preserves the vendor's down-positive orientation.
    const left = measureRcRest(raw.samples.map((s) => ({ x: 128 + s[0] / 256, y: 128 - s[1] / 256 })))!
    const right = measureRcRest(raw.samples.map((s) => ({ x: 128 + s[2] / 256, y: 128 - s[3] / 256 })))!
    return { slot, left, right, durationMs: raw.durationMs, packetChanges: raw.packetChanges, polls: raw.samples.length }
}
