import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import {resolve} from 'node:path'
export default defineConfig({
 root:resolve('src/web'),base:process.env.WEB_BASE??'/Stick-Abuse-Limited/',publicDir:false,
 plugins:[{name:'webhid-transport',enforce:'pre',resolveId(id,importer){if(id==='./hid'&&importer?.replaceAll('\\','/').endsWith('/src/main/controller.ts'))return resolve('src/web/transport.ts').replaceAll('\\','/')},generateBundle(){const ids=[...this.getModuleIds()].filter(id=>id.replaceAll('\\','/').endsWith('/src/web/transport.ts'));if(ids.length!==1)this.error('WebHID transport must be bundled exactly once; duplicate modules split the device registry.')}},react()],
 resolve:{alias:{'@shared':resolve('src/shared'),'@':resolve('src/renderer')}},
 build:{outDir:resolve('dist-web'),emptyOutDir:true},server:{host:'127.0.0.1',port:4193,strictPort:true}
})
