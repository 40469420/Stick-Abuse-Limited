import { useEffect, useRef, useState } from 'react'
import { api, type LiveSample } from './api'
import { Help, SectionTitle } from './Help'
import { LinearityBench } from './LinearityBench'
import type { DeepPollResult } from '@shared/deeppoll'
export function LabExtras({session,active,task,setTask,kernelPath,liveOverride}:{session:()=>string|null;active:boolean;task:string;setTask:(v:string)=>void;kernelPath?:string;liveOverride?:LiveSample|null}):JSX.Element {
 const [view,setView]=useState<'linearity'|'kernel'>('linearity')
 const [live,setLive]=useState<LiveSample|null>(null),[result,setResult]=useState<DeepPollResult|null>(null),[error,setError]=useState('')
 const alive=useRef(true)
 useEffect(()=>{alive.current=true;const off=api().on('input:sample',v=>setLive(v as LiveSample));return()=>{alive.current=false;off()}},[])
 async function run():Promise<void>{const id=session();if(!id||task)return;setTask('kernel');setError('');setResult(null);try{const value=await api().benchKernel(id,kernelPath);if(alive.current&&session()===id)setResult(value)}catch(e){if(alive.current)setError((e as Error).message)}finally{if(alive.current)setTask('')}}
 return <section className="stack"><div className="row wrap" style={{gap:8}}><button className="btn" onClick={()=>setView('linearity')} disabled={!!task}>Guided linearity</button><button className="btn" onClick={()=>setView('kernel')} disabled={!!task}>Kernel USB polling</button></div>
 {view==='linearity'?<LinearityBench live={liveOverride===undefined?live:liveOverride} connected={active&&!task}/>:<div className="card"><SectionTitle title="Kernel USB polling">Captures Windows USB completion events for eight seconds. Windows asks for administrator approval for this run. Only the connected controller VID:PID is used for the headline; identical devices may be ambiguous. Uses the upstream DeepPoll method. Completion spacing is host USB activity, not input-to-screen latency. No controller settings are changed. Closing or pausing Labs cancels collection.</SectionTitle><button className="btn primary" disabled={!active||!!task} onClick={()=>void run()}>{task==='kernel'?'Tracing USB…':'Run 8-second USB trace'}</button>{task==='kernel'&&<button className="btn" onClick={()=>{const id=session();if(id)void api().benchCancel(id)}}>Cancel trace</button>}
 {error&&<p role="alert" className="note bad">{error}</p>}{result&&!result.ok&&<p role="alert" className="note bad">{result.error}</p>}{result?.ok&&<div><h3>{result.rateHz.toFixed(1)} USB completions/s</h3><p>{result.vidPid} · {result.samples} intervals · p50 {result.p50.toFixed(2)} µs · p95 {result.p95.toFixed(2)} µs</p><Help title="Trace exclusions">{result.stalls} host stalls excluded ({result.stallMs.toFixed(2)} ms). A matching VID:PID does not distinguish two identical controllers or automatically prove every completion carried new input.</Help><table className="tbl"><thead><tr><th>Rate band</th><th>Share</th></tr></thead><tbody>{result.bins.map((b,i)=><tr key={i}><td>{b.label}</td><td>{b.pct.toFixed(1)}%</td></tr>)}</tbody></table></div>}</div>}
 </section>
}
