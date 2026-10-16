export type WindowRange = { begin: number; end: number; beginAnti: number; endAnti: number }
export const clamp01 = (n: number): number => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0))
/** Illustrates only the range stage; never estimates sensor data or firmware curves. */
export function previewRange(input: number, w: WindowRange): number {
 const n=clamp01(input), start=clamp01(w.begin/1000), end=clamp01(w.end/1000)
 if(n<=start||end<=start)return 0
 return clamp01(w.beginAnti/1000 + clamp01((n-start)/(end-start))*(w.endAnti-w.beginAnti)/1000)
}
export function previewStick(x:number,y:number,w:WindowRange):[number,number]{
 const radius=Math.hypot(x,y);if(!radius)return [0,0]
 const out=previewRange(radius,w);return [x/radius*out,y/radius*out]
}
export function signedAxis(n:number):number{return (n-128)/(n>=128?127:128)}
export function sensorWords(bytes:number[],little=false):number[]{
 if(bytes.length!==12)return []
 return Array.from({length:6},(_,i)=>{const a=bytes[i*2],b=bytes[i*2+1];const v=little?(b<<8)|a:(a<<8)|b;return v>=32768?v-65536:v})
}

export function extractImuBytes(raw:Uint8Array):number[]|undefined {return raw.length>=26&&raw[0]===0x12?Array.from(raw.slice(14,26)):undefined}
