import assert from 'node:assert/strict'
import { build } from 'esbuild'
const result = await build({entryPoints:['src/renderer/TermsGate.tsx'],bundle:true,platform:'node',format:'cjs',write:false,jsx:'automatic',plugins:[{name:'terms-test-hooks',setup(b){b.onResolve({filter:/^react(?:\/jsx-runtime)?$/},args=>({path:args.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:args.path==='react'?`export const useState=v=>globalThis.__terms.state(v); export const useRef=v=>globalThis.__terms.ref(v); export const useEffect=()=>{};`:`export const Fragment='fragment';export const jsx=(type,props)=>({type,props});export const jsxs=jsx;`,loader:'js'}))}}]})
const module={exports:{}};new Function('module','exports',result.outputFiles[0].text)(module,module.exports)
const {TermsGate}=module.exports
const realPerformance=globalThis.performance, realStorage=globalThis.localStorage
let clock=0, stored=null, fail=false, slots=[],index=0
Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>clock}})
globalThis.localStorage={getItem:()=>stored,setItem:(key,value)=>{if(fail)throw Error('blocked');stored=value}}
globalThis.__terms={state(initial){const i=index++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],v=>{slots[i]=v}]},ref(value){const i=index++;return slots[i]??(slots[i]={current:value})}}
function render(){index=0;return TermsGate({children:'APP CONTROLS'})}
function nodes(n){if(!n||typeof n!=='object')return [];return [n,...[n.props?.children].flat(Infinity).flatMap(nodes)]}
function button(tree){return nodes(tree).find(n=>n.type==='button'&&String(n.props.children).includes('Read and review'))??nodes(tree).find(n=>n.type==='button'&&n.props.children==='I understand and accept')}
try{
let tree=render();assert(!nodes(tree).some(n=>n.props?.children==='APP CONTROLS'));assert.equal(button(tree).props.disabled,true)
button(tree).props.onClick();assert.equal(stored,null)
nodes(tree).find(n=>n.type==='input').props.onChange({target:{checked:true}});tree=render();clock=59999;button(tree).props.onClick();assert.equal(stored,null)
clock=60000;fail=true;button(tree).props.onClick();tree=render();assert.equal(stored,null);assert(nodes(tree).some(n=>n.props?.role==='alert'))
fail=false;button(tree).props.onClick();assert.equal(stored,'accepted');assert.equal(render().props.children,'APP CONTROLS')
slots=[];clock=0;assert.equal(render().props.children,'APP CONTROLS')
stored='invalid';slots=[];tree=render();assert.equal(tree.props.className,'terms-backdrop')
console.log('First-run terms: controls blocked, checkbox required, 60-second boundary, storage failure and persisted acceptance passed.')
}finally{Object.defineProperty(globalThis,'performance',{configurable:true,value:realPerformance});globalThis.localStorage=realStorage;delete globalThis.__terms}
