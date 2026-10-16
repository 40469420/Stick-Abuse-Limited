import {build} from 'esbuild'
import {resolve} from 'node:path'
import {mkdirSync,rmSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
const folder=resolve('.web-test-tmp');mkdirSync(folder,{recursive:true})
try {
 await build({entryPoints:['tests/webhid.ts'],outfile:resolve(folder,'test.mjs'),bundle:true,platform:'node',format:'esm',plugins:[{name:'webhid',setup(b){b.onResolve({filter:/^\.\/hid$/},args=>args.importer.replaceAll('\\','/').endsWith('/src/main/controller.ts')?{path:resolve('src/web/transport.ts')}:undefined)}}]})
 const result=spawnSync(process.execPath,[resolve(folder,'test.mjs')],{stdio:'inherit',timeout:30000});if(result.status!==0)process.exitCode=1
}finally{rmSync(folder,{recursive:true,force:true})}
