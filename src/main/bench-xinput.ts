import { spawn } from 'node:child_process'
import { join } from 'node:path'
import type { Distribution, XInputBench } from '../shared/bench'

// Dedicated process, read-only XInput. No 1 ms Sleep, which would cap an 8K test.
// Stopwatch timestamps are host observations, not USB hardware timestamps.
export const benchNativeCode = String.raw`
using System;
using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Threading;
public static class StickBench {
  [StructLayout(LayoutKind.Sequential)] public struct Pad { public ushort buttons; public byte lt,rt; public short lx,ly,rx,ry; }
  [StructLayout(LayoutKind.Sequential)] public struct State { public uint packet; public Pad pad; }
  [DllImport("xinput1_4.dll", EntryPoint="XInputGetState")] static extern uint Read(uint index,out State state);
  static string N(double v) { return v.ToString("R",CultureInfo.InvariantCulture); }
  static double Q(double[] v,int n,double q) { double p=(n-1)*q; int lo=(int)p,hi=(int)Math.Ceiling(p); return v[lo]+(v[hi]-v[lo])*(p-lo); }
  public static string Stats(double[] v,int n) {
    if(n==0) return "null";
    double sum=0; for(int i=0;i<n;i++) sum+=v[i]; double mean=sum/n,variance=0;
    int[] bins=new int[9]; double[] limits={.125,.25,.5,1,2,4,8,16};
    for(int i=0;i<n;i++) { variance+=(v[i]-mean)*(v[i]-mean); int b=0; while(b<8 && v[i]>limits[b])b++; bins[b]++; }
    Array.Sort(v,0,n);
    return "{\"count\":"+n+",\"min\":"+N(v[0])+",\"median\":"+N(Q(v,n,.5))+",\"p95\":"+N(Q(v,n,.95))+",\"p99\":"+N(Q(v,n,.99))+
      ",\"max\":"+N(v[n-1])+",\"mean\":"+N(mean)+",\"stdDev\":"+N(Math.Sqrt(variance/n))+",\"histogram\":["+string.Join(",",bins)+"]}";
  }
  public static string Run(uint index,int seconds) {
    State state; if(Read(index,out state)!=0) throw new Exception("Selected XInput slot is disconnected.");
    Console.WriteLine("READY"); Console.Out.Flush();
    if(Console.ReadLine()!="GO") throw new Exception("Test cancelled before start.");
    int capacity=seconds*40000+10000;
    double[] calls=new double[capacity],intervals=new double[capacity],polls=new double[capacity];
    State previous=state; int count=0,changes=0,left=0,right=0;
    double lastPoll=0,lastChange=0,next=0;
    var clock=Stopwatch.StartNew();
    while(clock.Elapsed.TotalSeconds<seconds && count<capacity) {
      double before=clock.Elapsed.TotalMilliseconds;
      if(Read(index,out state)!=0) throw new Exception("Selected XInput slot disconnected during test.");
      double after=clock.Elapsed.TotalMilliseconds;
      calls[count]=after-before;
      if(count>0) polls[count-1]=after-lastPoll;
      lastPoll=after;
      if(state.packet!=previous.packet) {
        if(changes>0) intervals[changes-1]=after-lastChange;
        lastChange=after;changes++;
      }
      if(state.pad.lx!=previous.pad.lx || state.pad.ly!=previous.pad.ly)left++;
      if(state.pad.rx!=previous.pad.rx || state.pad.ry!=previous.pad.ry)right++;
      previous=state;count++;
      next=Math.Max(next+.025,after);
      while(clock.Elapsed.TotalMilliseconds<next) Thread.SpinWait(8);
    }
    double duration=clock.Elapsed.TotalMilliseconds;
    return "{\"slot\":"+index+",\"durationMs\":"+N(duration)+",\"polls\":"+count+",\"packetChanges\":"+changes+
      ",\"stickChanges\":["+left+","+right+"],\"pollHz\":"+N(count*1000/duration)+",\"changeHz\":"+N(changes*1000/duration)+
      ",\"intervals\":"+Stats(intervals,Math.Max(0,changes-1))+",\"calls\":"+Stats(calls,count)+",\"pollIntervals\":"+Stats(polls,Math.Max(0,count-1))+"}";
  }
}`

export function validateXInputBench(data: unknown): XInputBench {
  const d = data as XInputBench
  const positive = (v: number): boolean => Number.isFinite(v) && v >= 0
  const integer = (v: number): boolean => Number.isInteger(v) && v >= 0
  function stats(s: Distribution | null, count: number): boolean {
    if (!count) return s === null
    return !!s && s.count === count && [s.min, s.median, s.p95, s.p99, s.max, s.mean, s.stdDev].every(positive) &&
      s.min <= s.median && s.median <= s.p95 && s.p95 <= s.p99 && s.p99 <= s.max && s.mean >= s.min - 1e-9 && s.mean <= s.max + 1e-9 &&
      Array.isArray(s.histogram) && s.histogram.length === 9 && s.histogram.every(integer) && s.histogram.reduce((a, b) => a + b, 0) === count
  }
  if (!d || !integer(d.slot) || d.slot > 3 || !integer(d.polls) || d.polls < 2 || d.polls > 1300000 ||
    !positive(d.durationMs) || d.durationMs < 100 || d.durationMs > 60000 || !integer(d.packetChanges) || d.packetChanges > d.polls ||
    !Array.isArray(d.stickChanges) || d.stickChanges.length !== 2 || !d.stickChanges.every(v => integer(v) && v <= d.polls) ||
    !positive(d.pollHz) || !positive(d.changeHz) || Math.abs(d.pollHz - d.polls * 1000 / d.durationMs) > .01 ||
    Math.abs(d.changeHz - d.packetChanges * 1000 / d.durationMs) > .01 || !stats(d.calls, d.polls) ||
    !stats(d.pollIntervals, d.polls - 1) || !stats(d.intervals, Math.max(0, d.packetChanges - 1))) throw new Error('Invalid native timing result.')
  return d
}

export function runXInputBench(slot: number, seconds: number, onReady: () => void): { promise: Promise<XInputBench>; cancel: () => void } {
  if (process.platform !== 'win32' || !Number.isInteger(slot) || slot < 0 || slot > 3 || ![5, 10, 30].includes(seconds)) throw new Error('Select a Windows XInput slot and test duration.')
  const script = `$ErrorActionPreference='Stop'\nAdd-Type -TypeDefinition @'\n${benchNativeCode}\n'@\n[StickBench]::Run(${slot},${seconds})`
  const exe = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const child = spawn(exe, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
  let cancel: () => void = () => undefined
  const promise = new Promise<XInputBench>((resolve, reject) => {
    let output = '', errors = '', ready = false, settled = false
    const finish = (error?: Error, result?: XInputBench): void => {
      if (settled) return
      settled = true; clearTimeout(timeout)
      if (error) { child.kill(); reject(error) } else resolve(result!)
    }
    const timeout = setTimeout(() => finish(new Error('XInput benchmark timed out.')), (seconds + 25) * 1000)
    cancel = () => finish(new Error('XInput benchmark cancelled.'))
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8')
    child.stdin.on('error', e => finish(e))
    child.stdout.on('data', (chunk: string) => {
      output += chunk
      if (!ready && /^READY\r?\n/.test(output)) {
        ready = true; output = output.replace(/^READY\r?\n/, '')
        try { onReady(); child.stdin.end('GO\n') } catch (e) { finish(e as Error) }
      }
      if (output.length > 100000) finish(new Error('Native timing output exceeded its limit.'))
    })
    child.stderr.on('data', (chunk: string) => { if (errors.length < 4000) errors += chunk })
    child.on('error', e => finish(e))
    child.on('close', code => {
      if (code !== 0) { finish(new Error('XInput test failed. ' + errors.slice(0, 500))); return }
      try { finish(undefined, validateXInputBench(JSON.parse(output.trim()))) } catch (e) { finish(e as Error) }
    })
  })
  return { promise, cancel: () => cancel() }
}
