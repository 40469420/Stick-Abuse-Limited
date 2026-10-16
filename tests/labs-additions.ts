import assert from 'node:assert/strict'
import { Packet, stick } from '../src/shared/profile'
import { stageCurve } from '../src/shared/curve-staging'
import { validateLeadJoyRequest } from '../src/shared/leadjoy-api'
const p=new Packet(new Uint8Array(36).fill(0xa0)), before=p.bytes.slice()
const design=[{x:0,y:0},{x:64,y:38},{x:128,y:100},{x:191,y:185},{x:255,y:255}]
const saved=structuredClone(design)
stageCurve(p,design,false)
assert.deepEqual(stick.curve(p),design,'on-grid edits immediately stage exact curve bytes')
assert.deepEqual(design,saved,'designer input remains unchanged')
for(let i=0;i<36;i++)if(i<11||i>23)assert.equal(p.u8(i),before[i],`preserved byte ${i}`)
assert.equal(stick.enabled(p),false,'staging preserves the chosen bypass state')
const linear=p.bytes.slice();stageCurve(p,design,true);stageCurve(p,design,false);assert.deepEqual(p.bytes,linear,'spline toggling does not compound the curve')
const req={path:'test-controller',slot:0,edits:[{kind:'button',id:24,target:{t:2,code:4}}]}
assert.equal(validateLeadJoyRequest(req),req)
for(const edit of [{kind:'stick',side:2,patch:{}},{kind:'stick',side:0,patch:{ci:9}},{kind:'stick',side:0,patch:{unknown:1}},{kind:'stick',side:0,patch:{mse:101}},{kind:'button',id:999,target:{t:2,code:4}},{kind:'trigger',zones:{leftInner:-1,leftOuter:100,rightInner:0,rightOuter:100}}])assert.throws(()=>validateLeadJoyRequest({...req,edits:[edit]}))
assert.throws(()=>validateLeadJoyRequest({...req,slot:4}))
assert.throws(()=>validateLeadJoyRequest({...req,edits:Array(26).fill(req.edits[0])}))
console.log('Immediate staging: exact curve bytes, reserved fields and spline roundtrip; LeadJoy request validation passed.')
