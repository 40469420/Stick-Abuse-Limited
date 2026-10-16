import { useEffect, useRef, useState } from 'react'
import { api, type LiveSample } from './api'
import { LabExtras } from './LabExtras'
export function LeadJoyLabs({path,live}:{path:string;live:LiveSample|null}):JSX.Element {
 const session=useRef<string|null>(null),[active,setActive]=useState(false),[task,setTask]=useState(''),[visible,setVisible]=useState(!document.hidden),[error,setError]=useState('')
 useEffect(()=>{const changed=():void=>setVisible(!document.hidden);document.addEventListener('visibilitychange',changed);return()=>document.removeEventListener('visibilitychange',changed)},[])
 useEffect(()=>{if(!visible)return;const id=crypto.randomUUID();session.current=id;let stopped=false
 void api().benchStart(id).then(()=>{if(!stopped)setActive(true)}).catch(e=>setError(e.message))
 const timer=setInterval(()=>{void api().benchRenew(id).catch(()=>{if(!stopped){setActive(false);setError('Lab session expired. Leave and reopen Labs to continue.')}})},1000)
 return()=>{stopped=true;session.current=null;clearInterval(timer);void api().benchStop(id).catch(()=>undefined);setActive(false);setTask('')}
 },[visible,path])
 return <div>{error&&<p className="note bad">{error}</p>}<LabExtras session={()=>session.current} active={active&&visible} task={task} setTask={setTask} kernelPath={path} liveOverride={live}/></div>
}
