import assert from 'node:assert/strict'
import { ApexGuard, parseApexProcesses, killApex } from '../src/main/apex-guard'
async function test(): Promise<void> {
  assert.deepEqual(parseApexProcesses('"r5apex.exe","123","Console","1","12 K"\n"R5APEX_DX12.EXE","456","Console"\n"other.exe","789"\n"r5apex.exe","0"'),[{image:'r5apex.exe',pid:123},{image:'r5apex_dx12.exe',pid:456}])
  await assert.rejects(killApex({image:'other.exe',pid:123}),/Invalid/)
  let rc:boolean|null=false, scans=0, kills=0, targets=[{image:'r5apex.exe',pid:123}], denied=false
  const guard=new ApexGuard({rc:async()=>rc,list:async()=>{scans++;return targets},kill:async()=>{if(denied)throw Error('Access denied');kills++},changed:()=>{}})
  await guard.tick();assert.equal(scans,0)
  guard.setEnabled(true);await guard.tick();assert.equal(scans,0);assert.equal(guard.status.armed,false)
  rc=true;await guard.tick();assert.equal(kills,1);assert.equal(guard.status.alert,'You have RCs enabled. Please close Apex.')
  guard.dismiss();assert.equal(guard.status.alert,null)
  rc=null;await guard.tick();assert.equal(kills,2);assert.match(guard.status.message,/force-closed/)
  rc=false;await guard.tick();assert.equal(kills,2);assert.equal(guard.status.armed,false)
  guard.setEnabled(false);rc=true;await guard.tick();assert.equal(kills,2)
  guard.setEnabled(true);denied=true;await guard.tick();assert.match(guard.status.message,/Access denied/);assert(guard.status.alert)
  denied=false;targets=[];await guard.tick();assert.equal(kills,2)
  let release!: (rows:typeof targets)=>void
  const racing=new ApexGuard({rc:async()=>true,list:()=>new Promise(r=>{release=r}),kill:async()=>{kills++},changed:()=>{}})
  racing.setEnabled(true);const pending=racing.tick();await Promise.resolve();await Promise.resolve();racing.setEnabled(false);release([{image:'r5apex.exe',pid:1}]);await pending;assert.equal(kills,2)
  console.log('Apex guard: exact image matching, neutral/off behavior, enabled RC, cached disconnect state, denial and disable-during-scan passed. No real process was terminated.')
}
void test().catch(e=>{console.error(e);process.exitCode=1})
