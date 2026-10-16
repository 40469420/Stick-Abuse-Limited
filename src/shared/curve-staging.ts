import { stick, type Packet } from './profile'
import { resampleCurve, resampleSpline } from './sticklab'
/** Stages the hardware curve in the existing working packet; never performs I/O. */
export function stageCurve(packet:Packet,design:Array<{x:number;y:number}>,smooth:boolean):void {
 const points=smooth?resampleSpline(design):resampleCurve(design)
 stick.setCurve(packet,points);stick.markCurveIdentity(packet)
}
