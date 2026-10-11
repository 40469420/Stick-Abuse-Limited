import { useEffect, useRef, useState } from 'react'
import { api } from './api'
import type { ApexGuardStatus } from '../main/apex-guard'
export function ApexWarning(): JSX.Element | null {
  const [status,setStatus]=useState<ApexGuardStatus|null>(null)
  const button=useRef<HTMLButtonElement>(null)
  useEffect(()=>{let mounted=true;void api().apexGuardStatus().then(s=>{if(mounted)setStatus(s)}).catch(()=>undefined);const off=api().on('apex:status',s=>setStatus(s as unknown as ApexGuardStatus));return()=>{mounted=false;off()}},[])
  useEffect(()=>{if(status?.alert)button.current?.focus()},[status?.alert])
  if(!status?.alert)return null
  return <div className="quit-warning-backdrop" onKeyDown={e=>{if(e.key==='Tab'){e.preventDefault();button.current?.focus()}}}><section className="rc-disclaimer quit-warning" role="alertdialog" aria-modal="true" aria-labelledby="apex-warning-title"><h2 id="apex-warning-title">RC enabled</h2><p>{status.alert}</p><p>{status.message}</p><button ref={button} className="btn rc-acknowledge" onClick={()=>{void api().dismissApexGuard().then(()=>setStatus(s=>s?{...s,alert:null}:s)).catch(()=>undefined)}}>Understood</button></section></div>
}
