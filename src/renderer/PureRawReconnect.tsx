import {useEffect,useState} from 'react'
import {api} from './api'
import {Help} from './Help'
import type {PureRawStatus} from '@shared/pure-raw'
export function PureRawReconnect():JSX.Element{
 const [status,setStatus]=useState<PureRawStatus|null>(null),[saving,setSaving]=useState(false),[error,setError]=useState('')
 useEffect(()=>{let alive=true;void api().pureRawStatus().then(v=>{if(alive)setStatus(v)}).catch(e=>{if(alive)setError((e as Error).message)});const off=api().on('pure:status',v=>{if(alive)setStatus(v as PureRawStatus)});return()=>{alive=false;off()}},[])
 return <span className="pure-reconnect"><label><input type="checkbox" checked={status?.enabled??true} disabled={!status||saving||status.running} onChange={e=>{setSaving(true);setError('');void api().setPureRawReconnect(e.target.checked).then(setStatus).catch(e=>setError((e as Error).message)).finally(()=>setSaving(false))}}/> Auto reapply on reconnect</label><Help title="PureRaw reconnect recovery">Enabled by default. On connection or reconnection, the active G7 Pro 8K profile's PureRaw sticks temporarily use Square processing, then the exact original profile is restored. Both writes are verified. This performs profile writes; the app must be running. A local recovery backup protects interrupted operations. Other profiles and processed sticks are unchanged. Physical reconnect testing is still pending.</Help>{(error||status?.error)&&<span className="note bad" role="alert">{error||status?.error}</span>}</span>
}
