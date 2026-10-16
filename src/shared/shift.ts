import { button, trigger, macro, type Packet, type Profile, serializeProfile, parseProfile } from './profile'
export const SHIFT_SLOT = 5
export const SHIFT_KEY = 231
export function hasShiftBinding(profile: Profile): boolean {
 return [...profile.buttons,...profile.functionKeys].some(p=>button.mapped(p)&&button.mapValues(p).includes(SHIFT_KEY)) || profile.triggers.some(p=>trigger.mapped(p)&&trigger.mapValues(p).includes(SHIFT_KEY)) || profile.functionKeys.some(p=>macro.macroEnabled(p) && Array.from({length:Math.min(32,macro.stepCount(p))},(_,i)=>macro.step(p,i).data).includes(SHIFT_KEY))
}
/** Connect 1.16.7 CE: ordinary seven-byte mapping head + toggle bit; no Fun_Data swap flag. */
export function setShiftBinding(packet: Packet, isTrigger: boolean, isFunction: boolean, toggle: boolean): void {
 if(packet.length < (isTrigger ? 32 : isFunction ? 169 : 7)) throw new Error('Unsupported Shift binding packet')
 const access=isTrigger?trigger:button
 access.setMap(packet,[SHIFT_KEY,0,0]); access.setToggle(packet,toggle)
 button.setTurbo(packet,false,0)
 if(isFunction) macro.setFlags(packet,{macro:false})
}
/** Connect clears Shift activators from its copied layer to avoid nested activation. */
export function copyToShift(source: Uint8Array): Uint8Array {
 if(source.length!==1070) throw new Error('Shift copy currently requires a G7 Pro 8K profile')
 const profile=parseProfile(source.slice(),'G7ProCE')
 for(const [packets,access] of [[profile.buttons,button],[profile.functionKeys,button],[profile.triggers,trigger]] as const) {
  for(const p of packets) if(access.mapped(p)&&access.mapValues(p).includes(SHIFT_KEY)) { access.setMap(p,[0,0,0]); access.setToggle(p,false); button.setTurbo(p,false,0) }
 }
 for(const p of profile.functionKeys) if(macro.macroEnabled(p) && Array.from({length:Math.min(32,macro.stepCount(p))},(_,i)=>macro.step(p,i).data).includes(SHIFT_KEY)) macro.setFlags(p,{macro:false})
 return serializeProfile(profile)
}
