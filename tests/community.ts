import assert from 'node:assert/strict'
import { communityEntries, listCommunityProfiles, downloadCommunityProfile } from '../src/main/community'
const listing = [{type:'file',name:'sample.bin',size:1070,sha:'abc'}, {type:'file',name:'../bad.bin',size:1070}, {type:'dir',name:'dir.bin',size:1070}, {type:'file',name:'large.bin',size:1000000}, {type:'file',name:'README.md',size:1070}]
assert.deepEqual(communityEntries(listing), [{name:'sample.bin',size:1070,sha:'abc'}])
assert.throws(()=>communityEntries(null), /listing/)
const previous=globalThis.fetch
try {
  const urls:string[]=[]
  globalThis.fetch=(async (url:any)=>{urls.push(String(url));return String(url).includes('api.github.com')?new Response(JSON.stringify(listing)):new Response(new Uint8Array(1070))}) as typeof fetch
  assert.equal((await listCommunityProfiles()).length,1)
  assert.equal((await downloadCommunityProfile('sample.bin')).length,1070)
  await assert.rejects(downloadCommunityProfile('../bad.bin'), /no longer/)
  assert(!urls.some(url=>url.includes('../')))
  globalThis.fetch=(async (url:any)=>String(url).includes('api.github.com')?new Response(JSON.stringify(listing)):new Response(new Uint8Array(4))) as typeof fetch
  await assert.rejects(downloadCommunityProfile('sample.bin'), /size/)
  globalThis.fetch=(async()=>new Response('',{status:403})) as typeof fetch
  await assert.rejects(listCommunityProfiles(), /403/)
} finally {globalThis.fetch=previous}
console.log('Community listing, safe download paths, size checks and network errors passed')
