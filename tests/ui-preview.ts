import assert from 'node:assert/strict'
import {previewRange,previewStick,sensorWords,extractImuBytes,signedAxis} from '../src/shared/ui-preview'
import {sanitizeTheme,DEFAULT_THEME,themeVariables} from '../src/shared/theme'
const neutral={begin:0,end:1000,beginAnti:0,endAnti:1000}
assert.equal(previewRange(.5,neutral),.5)
const custom={begin:100,end:800,beginAnti:200,endAnti:900}
assert.equal(previewRange(.1,custom),0)
assert(Math.abs(previewRange(.45,custom)-.55)<1e-9)
assert(Math.abs(previewRange(1,custom)-.9)<1e-9)
assert.deepEqual(previewStick(0,0,custom),[0,0])
assert.deepEqual(previewStick(.05,0,custom),[0,0])
assert.equal(previewRange(.7,{...neutral,end:0}),0)
assert.equal(signedAxis(0),-1);assert.equal(signedAxis(255),1);assert.equal(signedAxis(128),0)
const report=new Uint8Array(64);report[0]=0x12;report.set([0,1,255,255,128,0,127,255,0,0,1,0],14)
const before=report.slice();const bytes=extractImuBytes(report)!
assert.deepEqual(sensorWords(bytes),[1,-1,-32768,32767,0,256])
assert.deepEqual(sensorWords(bytes,true),[256,-1,128,-129,0,1])
assert.deepEqual(report,before,'raw sensor extraction cannot mutate a report')
assert.equal(extractImuBytes(new Uint8Array(25)),undefined)
assert.equal(extractImuBytes(new Uint8Array(64)),undefined)
assert.deepEqual(sensorWords([]),[])
assert.deepEqual(sanitizeTheme({accent:'url(unsafe)',background:'#ffffff',unknown:'#000000'}),{...DEFAULT_THEME,background:'#ffffff'})
assert.equal(themeVariables({...DEFAULT_THEME,accent:'#ffffff'})['--on-accent'],'#111111')
assert.equal(themeVariables({...DEFAULT_THEME,accent:'#000000'})['--on-accent'],'#ffffff')
console.log('UI previews: range boundaries, radial response, sensor signedness/byte order, raw preservation and theme validation pass.')
