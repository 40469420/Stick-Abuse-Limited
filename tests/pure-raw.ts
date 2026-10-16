import assert from 'node:assert/strict'
import {parseProfile,stick} from '../src/shared/profile'
import {pureRawInterim,recoverPureRaw,applyPureRawProcessing,type PureRawJournal} from '../src/shared/pure-raw'
const original=Uint8Array.from({length:1070},(_,i)=>(i*13)%256);original[916]&=~1;original[952]|=1
const interim=pureRawInterim(original)!
assert.deepEqual([...interim].map((v,i)=>v!==original[i]?i:-1).filter(i=>i>=0),[916,917].filter(i=>interim[i]!==original[i]))
assert.deepEqual(interim.slice(952,988),original.slice(952,988))
const both=original.slice();both[952]&=~1;assert(pureRawInterim(both))
const enabled=original.slice();enabled[916]|=1;assert.equal(pureRawInterim(enabled),null)
const p=parseProfile(original,'G7ProCE').sticks[0],saved=p.bytes.slice();applyPureRawProcessing(p)
assert(stick.enabled(p)&&stick.isIdentityCurve(p))
for(let i=0;i<36;i++)if(i!==0&&(i<11||i>23))assert.equal(p.bytes[i],saved[i],`preserves field ${i}`)
function fixture(){let current=original.slice(),journal:PureRawJournal|null=null;const writes:Uint8Array[]=[];return {get current(){return current},get journal(){return journal},writes,deps:{read:async()=>current.slice(),write:async(bytes:Uint8Array)=>{writes.push(bytes.slice());current=bytes.slice();return {verified:true}},load:()=>journal,save:(value:PureRawJournal|null)=>{journal=value}}}}
const good=fixture();let settled=false;assert.equal(await recoverPureRaw(1,'pad',{...good.deps,settle:async()=>{assert.deepEqual(good.current,interim);settled=true}}),true);assert.equal(settled,true);assert.equal(good.writes.length,2);assert.deepEqual(good.current,original);assert.equal(good.journal,null)
const rollback=fixture();const rw=rollback.deps.write;let calls=0;rollback.deps.write=async bytes=>{calls++;if(calls===2)throw Error('simulated failure');return rw(bytes)}
await assert.rejects(recoverPureRaw(1,'pad',rollback.deps),/original settings restored/);assert.deepEqual(rollback.current,original);assert.equal(rollback.journal,null)
const interrupted=fixture();const iw=interrupted.deps.write;calls=0;interrupted.deps.write=async bytes=>{if(++calls>1)throw Error('disconnected');return iw(bytes)}
await assert.rejects(recoverPureRaw(1,'pad',interrupted.deps),/restoration is unconfirmed/);assert(interrupted.journal);assert.deepEqual(interrupted.current,interim)
interrupted.deps.write=iw;assert.equal(await recoverPureRaw(1,'pad',{...interrupted.deps,allowCycle:false}),true);assert.deepEqual(interrupted.current,original);assert.equal(interrupted.journal,null)
const noBackup=fixture();noBackup.deps.save=()=>{throw Error('disk full')};await assert.rejects(recoverPureRaw(1,'pad',noBackup.deps),/disk full/);assert.equal(noBackup.writes.length,0)
const wrong=fixture();wrong.deps.save({path:'other',slot:1,original:Array.from(original),interim:Array.from(interim)});await assert.rejects(recoverPureRaw(1,'pad',wrong.deps),/another device/);assert.equal(wrong.writes.length,0)
console.log('PureRaw recovery: exact preservation, isolated stick changes, two writes, rollback, interrupted recovery, no-backup refusal and wrong-device protection pass.')
