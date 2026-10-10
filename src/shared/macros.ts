import { macro, button, type Packet } from './profile'
export interface MacroStep { data: number; hold: number; delay: number }
export interface MacroDocument { version: 1; enabled: boolean; pressToTrigger: boolean; cycle: boolean; cycleTime: number; steps: MacroStep[] }
function uint(value: unknown, max: number, name: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > max) throw new Error(`${name} must be a whole number from 0 to ${max}`)
}
export function validateMacro(value: unknown): MacroDocument {
  if (!value || typeof value !== 'object') throw new Error('Invalid macro file')
  const doc = value as MacroDocument
  if (doc.version !== 1 || ['enabled', 'pressToTrigger', 'cycle'].some((k) => typeof doc[k as keyof MacroDocument] !== 'boolean')) throw new Error('Unsupported macro format')
  uint(doc.cycleTime, 65535, 'Loop delay')
  if (!Array.isArray(doc.steps) || doc.steps.length > 32) throw new Error('Controller macros hold at most 32 steps')
  const steps = doc.steps.map((s, i) => {
    if (!s || typeof s !== 'object') throw new Error(`Invalid step ${i + 1}`)
    uint(s.data, 255, 'Key code'); uint(s.hold, 65535, 'Hold time'); uint(s.delay, 65535, 'Delay')
    if (!s.data) throw new Error(`Step ${i + 1} needs an output key`)
    if (i === 31 && s.delay !== 0) throw new Error('Step 32 has no delay field on this controller. Use the loop delay instead.')
    return { data: s.data, hold: s.hold, delay: s.delay }
  })
  if (doc.enabled && !steps.length) throw new Error('Add at least one step before enabling a macro')
  return { version: 1, enabled: doc.enabled, pressToTrigger: doc.pressToTrigger, cycle: doc.cycle, cycleTime: doc.cycleTime, steps }
}
export function readMacro(p: Packet): MacroDocument {
  if (p.length !== 169 || macro.stepCount(p) > 32) throw new Error('Unsupported macro packet or step count')
  return { version: 1, enabled: macro.macroEnabled(p), pressToTrigger: macro.keyOpenEnabled(p), cycle: macro.cycleEnabled(p), cycleTime: macro.cycleTime(p), steps: Array.from({ length: macro.stepCount(p) }, (_, i) => macro.step(p, i)) }
}
export function writeMacro(p: Packet, value: unknown): void {
  if (p.length !== 169) throw new Error('Unsupported macro packet')
  const doc = validateMacro(value) // Validate atomically, before touching profile bytes.
  macro.setFlags(p, { macro: doc.enabled, keyOpen: doc.pressToTrigger, cycle: doc.cycle })
  macro.setCycleTime(p, doc.cycleTime)
  macro.setStepCount(p, doc.steps.length)
  for (let i = 0; i < 32; i++) {
    const s = doc.steps[i] ?? { data: 0, hold: 0, delay: 0 }
    macro.setStep(p, i, s.data, s.hold, s.delay)
  }
  if (doc.enabled) { button.setMap(p, [0, 0, 0]); button.setTurbo(p, false, 0); button.setToggle(p, false) }
}

/** Sequential recorder: overlapping holds are rejected rather than silently flattened. */
export class SequenceRecorder {
  readonly steps: MacroStep[] = []
  private held: { data: number; at: number } | null = null
  private releasedAt: number | null = null
  private lastAt = -Infinity
  push(keys: readonly number[], at: number): void {
    if (!Number.isFinite(at) || at < this.lastAt) throw new Error('Invalid recording clock')
    this.lastAt = at
    if (keys.length > 1) throw new Error('Overlapping keys cannot be stored in this sequential macro format. Record one key at a time; use a binding for a simultaneous combination.')
    const key = keys[0]
    if (this.held?.data === key) return
    if (this.held) {
      const hold = Math.round(at - this.held.at)
      uint(hold, 65535, 'Recorded hold time')
      this.steps.push({ data: this.held.data, hold, delay: 0 })
      this.held = null
      this.releasedAt = at
    }
    if (key !== undefined) {
      uint(key, 255, 'Recorded key')
      if (!key) throw new Error('Invalid recorded key')
      if (this.steps.length >= 32) throw new Error('Recording exceeds the controller’s 32-step limit')
      if (this.releasedAt !== null && this.steps.length) {
        const delay = Math.round(at - this.releasedAt)
        uint(delay, 65535, 'Recorded delay')
        this.steps[this.steps.length - 1].delay = delay
      }
      this.held = { data: key, at }
    }
  }
  finish(at: number): MacroStep[] { this.push([], at); return this.steps.map((s) => ({ ...s })) }
}
