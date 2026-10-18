import assert from 'node:assert/strict'
import {build} from 'esbuild'
const result=await build({stdin:{contents:`export {Macros} from './src/renderer/Macros'; export {parseProfile,serializeProfile} from './src/shared/profile'; export {writeMacro,readMacro} from './src/shared/macros'`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'cjs',write:false,jsx:'automatic',plugins:[{name:'hooks',setup(b){b.onResolve({filter:/^react-dom$/},()=>({path:'react-dom',namespace:'portal'}));b.onLoad({filter:/.*/,namespace:'portal'},()=>({contents:'export const createPortal=n=>n;',loader:'js'}));b.onResolve({filter:/^react(?:\/jsx-runtime)?$/},a=>({path:a.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:a.path==='react'?`export const useState=v=>globalThis.__macro.state(v);export const useRef=v=>globalThis.__macro.ref(v);export const useEffect=()=>{};export const useLayoutEffect=()=>{};export const useId=()=>"test-id";`:`export const Fragment='fragment';export const jsx=(type,props)=>({type,props});export const jsxs=jsx;`,loader:'js'}))}}]})
const m={exports:{}};new Function('module','exports',result.outputFiles[0].text)(m,m.exports)
const {Macros,parseProfile,serializeProfile,writeMacro,readMacro}=m.exports
let slots=[],index=0,stored=null
const oldStorage=globalThis.localStorage
let edits=0
const profile=parseProfile(new Uint8Array(1070))
writeMacro(profile.functionKeys[0],{version:1,enabled:true,pressToTrigger:false,cycle:false,cycleTime:0,steps:[{data:9,hold:80,delay:120},{data:10,hold:50,delay:0}]})
globalThis.localStorage={getItem:()=>stored,setItem:(key,value)=>{stored=value}}
globalThis.__macro={state(initial){const i=index++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v}]},ref(value){const i=index++;return slots[i]??(slots[i]={current:value})}}
const render=(busy=false)=>{index=0;return Macros({profile,busy,edit:fn=>{edits++;fn()}})}
function nodes(n){return n&&typeof n==='object'?[n,...[n.props?.children].flat(Infinity).flatMap(nodes)]:[]}
function button(tree,text){return nodes(tree).find(n=>n.type==='button'&&n.props.children===text)}
try{
const before=serializeProfile(profile).slice()
let tree=render();assert(button(tree,'Studio').props['aria-pressed'])
button(tree,'Classic').props.onClick();tree=render();assert(button(tree,'Classic').props['aria-pressed']);assert.equal(stored,'classic');assert.deepEqual(serializeProfile(profile),before);assert.equal(edits,0)
button(tree,'Studio').props.onClick();tree=render();const hold=nodes(tree).find(n=>n.type==='input'&&n.props['aria-label']==='Step 1 hold');hold.props.onChange({target:{value:'125'}})
tree=render();button(tree,'Classic').props.onClick();tree=render();assert.equal(nodes(tree).find(n=>n.props?.['aria-label']==='Step 1 hold').props.value,125);assert.equal(readMacro(profile.functionKeys[0]).steps[0].hold,125)
button(tree,'Studio').props.onClick();tree=render();button(tree,'Duplicate').props.onClick();assert.equal(readMacro(profile.functionKeys[0]).steps.length,3)
assert(nodes(render(true)).some(n=>n.type==='fieldset'&&n.props.disabled))
slots=[];stored='classic';assert(button(render(),'Classic').props['aria-pressed'])
console.log('Macro layouts: switching preserves bytes, editing shares data, duplication, busy lock and saved preference passed.')
}finally{globalThis.localStorage=oldStorage;delete globalThis.__macro}
