import { button, trigger, macro as hardwareMacro, type Profile } from './profile'
import { bindingKeys, BUTTON_LABELS } from './bindings'
import { validateMacro, type MacroDocument } from './macros'

export interface VirtualBinding { source: number; macro: MacroDocument }
export interface VirtualConfig { version: 1; model: 'G7ProCE' | 'T3CE'; slot: number; hz: number; bindings: VirtualBinding[] }
export interface VirtualStatus { available: boolean; active: boolean; installing: boolean; message: string; config: VirtualConfig; source: string | null; reports: number; submitUs: number }
export const emptyVirtualConfig = (): VirtualConfig => ({ version: 1, model: 'G7ProCE', slot: 0, hz: 1000, bindings: [] })
export function virtualSources(model: string): Array<{ value: number; label: string; icon?: number; tag?: string }> {
  return bindingKeys(model).filter(k => k.group === 'Controller' && (k.value <= 20 || k.value >= 31 && k.value <= 37 || k.value >= 40 && k.value <= 43)).map(k => ({ value: k.value, label: k.label, icon: k.value >= 31 && k.value <= 39 ? 17 : k.value, tag: k.value >= 31 && k.value <= 39 ? k.label : undefined }))
}
export const buttonMask: Record<number, number> = { 1: 1, 2: 2, 3: 4, 4: 8, 5: 256, 6: 512, 7: 64, 8: 128, 9: 4096, 10: 8192, 11: 16384, 12: 32768, 13: 1024, 14: 32, 15: 16 }
const diagonal: Record<number, number[]> = { 40: [1,3], 41: [1,4], 42: [2,3], 43: [2,4], 44: [21,23], 45: [21,24], 46: [22,23], 47: [22,24], 48: [25,27], 49: [25,28], 29: [26,27], 30: [26,28] }
export function expandedKeys(keys: readonly number[]): Set<number> { return new Set(keys.flatMap(k => [k, ...(diagonal[k] ?? [])])) }
export function virtualKey(code: number): number | null {
  const name = bindingKeys().find(k => k.value === code)?.code
  if (!name) return null
  if (/^Key[A-Z]$/.test(name)) return name.charCodeAt(3)
  if (/^Digit[0-9]$/.test(name)) return name.charCodeAt(5)
  if (/^F\d+$/.test(name)) return 111 + Number(name.slice(1))
  if (/^Numpad\d$/.test(name)) return 96 + Number(name.slice(-1))
  return ({ Escape:27, Backquote:192, Minus:189, Equal:187, Backspace:8, Tab:9, BracketLeft:219, BracketRight:221, Backslash:220, CapsLock:20, Semicolon:186, Quote:222, Enter:13, ShiftLeft:160, ShiftRight:161, Comma:188, Period:190, Slash:191, ControlLeft:162, ControlRight:163, MetaLeft:91, AltLeft:164, AltRight:165, Space:32, PrintScreen:44, ScrollLock:145, Pause:19, Insert:45, Home:36, PageUp:33, Delete:46, End:35, PageDown:34, ArrowUp:38, ArrowDown:40, ArrowLeft:37, ArrowRight:39, NumLock:144, NumpadDivide:111, NumpadMultiply:106, NumpadSubtract:109, NumpadAdd:107, NumpadEnter:13, NumpadDecimal:110 } as Record<string,number>)[name] ?? null
}
export function virtualOutputSupported(code: number): boolean { return !!buttonMask[code] || code >= 19 && code <= 30 || !!diagonal[code] || virtualKey(code) !== null || code >= 149 && code <= 155 || code >= 200 && code <= 206 }
export function validateVirtualConfig(value: unknown): VirtualConfig {
  const c = value as VirtualConfig
  if (!c || c.version !== 1 || !['G7ProCE','T3CE'].includes(c.model) || !Number.isInteger(c.slot) || c.slot < 0 || c.slot > 3 || ![250,1000,4000,8000].includes(c.hz) || !Array.isArray(c.bindings) || c.bindings.length > 64) throw Error('Invalid simulated-controller configuration.')
  const sources = new Set(virtualSources(c.model).map(k => k.value)), seen = new Set<number>()
  const bindings = c.bindings.map(b => {
    if (!b || !sources.has(b.source) || seen.has(b.source)) throw Error('Invalid or duplicate macro trigger.')
    seen.add(b.source)
    const macro = validateMacro(b.macro)
    if (macro.steps.some(s => !virtualOutputSupported(s.data))) throw Error('This macro contains an output the virtual Xbox controller cannot represent. Choose a normal controller button, stick direction, keyboard key or mouse action.')
    return { source: b.source, macro }
  })
  return { version:1, model:c.model, slot:c.slot, hz:c.hz, bindings }
}
interface Run { doc: MacroDocument; step: number; delay: boolean; until: number }
/** Deadlines, edge triggers and explicit releases; no OS or driver calls. */
export class VirtualMacroEngine {
  private previous: Set<number> | null = null
  private runs = new Map<number,Run>()
  private last = 0
  constructor(readonly config: VirtualConfig) {}
  reset(): void { this.previous = null; this.runs.clear(); this.last = 0 }
  input(keys: readonly number[], now: number): void {
    const held = expandedKeys(keys)
    if (this.previous) for (const b of this.config.bindings) {
      const d = b.macro
      if (!d.enabled || !d.steps.length) continue
      if (held.has(b.source) && !this.previous.has(b.source)) {
        if (d.pressToTrigger && d.cycle && this.runs.has(b.source)) this.runs.delete(b.source)
        else this.runs.set(b.source, { doc:d, step:0, delay:false, until:now + d.steps[0].hold })
      }
      if (!held.has(b.source) && !d.pressToTrigger) this.runs.delete(b.source)
    }
    this.previous = held
  }
  tick(now: number): { codes: number[]; blocked: number[] } {
    if (this.last && now - this.last > 250) this.runs.clear() // No burst after sleep/stall.
    this.last = now
    const codes = new Set<number>()
    for (const [source,r] of this.runs) {
      let transitions = 0
      while (now >= r.until && this.runs.has(source)) {
        if (++transitions > 128) { this.runs.delete(source); break }
        if (!r.delay) { r.delay = true; r.until += r.doc.steps[r.step].delay }
        else if (++r.step < r.doc.steps.length) { r.delay = false; r.until += r.doc.steps[r.step].hold }
        else if (r.doc.cycle && (r.doc.pressToTrigger || this.previous?.has(source))) { r.step = 0; r.delay = true; r.until += Math.max(1,r.doc.cycleTime); r.step = -1 }
        else this.runs.delete(source)
      }
      if (this.runs.has(source) && !r.delay && r.step >= 0) codes.add(r.doc.steps[r.step].data)
    }
    return { codes:[...codes], blocked:this.config.bindings.filter(b => b.macro.enabled).map(b => b.source) }
  }
}
export function sourceName(code: number, model: string): string { return virtualSources(model).find(s => s.value === code)?.label ?? BUTTON_LABELS[code - 1] ?? String(code) }

/** Translate physical macro triggers to the firmware outputs that must be suppressed. */
export function virtualSuppression(profile:Profile,config:VirtualConfig):Record<number,number[]> {
  const sources=new Set(config.bindings.filter(b=>b.macro.enabled).map(b=>b.source)),plan:Record<number,number[]>={}
  if(!sources.size)return plan
  const extras=config.model==='T3CE'?[17,18,31,32,33,34,35,36,37]:[17,18,31,32]
  const entries=[...profile.buttons.map((packet,i)=>({packet,source:i+1,isTrigger:false,hardware:false})),...profile.functionKeys.map((packet,i)=>({packet,source:extras[i],isTrigger:false,hardware:true})),...profile.triggers.map((packet,i)=>({packet,source:19+i,isTrigger:true,hardware:false}))]
  const outputs=(entry:typeof entries[number]):number[]=>{
    const access=entry.isTrigger?trigger:button
    return access.mapped(entry.packet)?access.mapValues(entry.packet).filter(k=>k!==0&&k!==255):[entry.source]
  }
  for(const entry of entries){
    if(entry.hardware&&hardwareMacro.macroEnabled(entry.packet))throw Error(`Disable the hardware macro on ${sourceName(entry.source,config.model)} before using PC macros. Its generated outputs cannot be separated reliably.`)
    if(outputs(entry).includes(231))throw Error(`Shift on ${sourceName(entry.source,config.model)} changes hardware mappings. Disable Shift before using PC macros.`)
  }
  for(const source of sources){
    const entry=entries.find(e=>e.source===source)
    const members=source>=40&&source<=43?[...(diagonal[source]||[])]:[source]
    const selected=entry?[entry]:entries.filter(e=>members.includes(e.source))
    const suppressed=new Set<number>()
    for(const e of selected){
      const access=e.isTrigger?trigger:button
      if(access.toggleOnPress(e.packet)||!e.isTrigger&&button.turboEnabled(e.packet))throw Error(`Turn off turbo/toggle on ${sourceName(e.source,config.model)} to use it as a PC macro trigger.`)
      for(const code of expandedKeys(outputs(e))){
        if(virtualKey(code)!==null||code>=149&&code<=155||code>=200&&code<=206)throw Error(`${sourceName(e.source,config.model)} sends keyboard/mouse input directly from firmware. Remove that binding before assigning its PC macro.`)
        if(!buttonMask[code]&&!(code>=19&&code<=28)&&!diagonal[code])continue
        suppressed.add(code)
      }
    }
    for(const other of entries){
      if(members.includes(other.source)||sources.has(other.source))continue
      if([...expandedKeys(outputs(other))].some(k=>suppressed.has(k)))throw Error(`${sourceName(source,config.model)} shares a hardware output with ${sourceName(other.source,config.model)}. Change that binding or choose another PC macro trigger; suppressing it would also block the other button.`)
    }
    plan[source]=[...suppressed]
  }
  return plan
}
