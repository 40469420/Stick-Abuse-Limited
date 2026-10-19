import { button, macro, trigger, type Packet } from './profile'

export interface BindingKey { value: number; label: string; group: string; code?: string }
const keys: BindingKey[] = []
function add(value: number, label: string, group: string, code?: string): void { keys.push({ value, label, group, code }) }
export const BUTTON_LABELS = ['D-pad Up', 'D-pad Down', 'D-pad Left', 'D-pad Right', 'LB / L1', 'RB / R1', 'LS click', 'RS click', 'A / Cross', 'B / Circle', 'X / Square', 'Y / Triangle', 'Home', 'View / Share', 'Menu / Options', 'Capture']
/** Tarantula packet order proven upstream on hardware; UI list order differs. */
export function functionLabels(modelId: string): readonly string[] {
  return modelId === 'T3CE' ? ['FL1', 'FR1', 'C1', 'C2', 'C3', 'C4', 'T1', 'T2', 'T3'] : ['FL1 / L4', 'FR1 / R4', 'FL2 / L5', 'FR2 / R5']
}
export const FUNCTION_LABELS = ['FL1', 'FR1', 'FL2', 'FR2']
BUTTON_LABELS.forEach((label, i) => add(i + 1, label, 'Controller'))
;['FL1', 'FR1', 'LT / L2', 'RT / R2', 'Left stick Up', 'Left stick Down', 'Left stick Left', 'Left stick Right', 'Right stick Up', 'Right stick Down', 'Right stick Left', 'Right stick Right'].forEach((label, i) => add(i + 17, label, 'Controller'))
add(31, 'FL2', 'Controller'); add(32, 'FR2', 'Controller')
;['D-pad Up-Left', 'D-pad Up-Right', 'D-pad Down-Left', 'D-pad Down-Right', 'Left stick Up-Left', 'Left stick Up-Right', 'Left stick Down-Left', 'Left stick Down-Right', 'Right stick Up-Left', 'Right stick Up-Right'].forEach((label, i) => add(40 + i, label, 'Controller'))
add(29, 'Right stick Down-Left', 'Controller'); add(30, 'Right stick Down-Right', 'Controller')
add(50, 'Escape', 'Keyboard', 'Escape')
for (let i = 1; i <= 12; i++) add(50 + i, `F${i}`, 'Keyboard', `F${i}`)
const keyboard: Array<[string, string]> = [
  ['`', 'Backquote'], ...'1234567890'.split('').map((k): [string, string] => [k, `Digit${k}`]), ['-', 'Minus'], ['=', 'Equal'], ['Backspace', 'Backspace'], ['Tab', 'Tab'],
  ...'QWERTYUIOP'.split('').map((k): [string, string] => [k, `Key${k}`]), ['[', 'BracketLeft'], [']', 'BracketRight'], ['\\', 'Backslash'], ['Caps Lock', 'CapsLock'],
  ...'ASDFGHJKL'.split('').map((k): [string, string] => [k, `Key${k}`]), [';', 'Semicolon'], ["'", 'Quote'], ['Enter', 'Enter'], ['Left Shift', 'ShiftLeft'],
  ...'ZXCVBNM'.split('').map((k): [string, string] => [k, `Key${k}`]), [',', 'Comma'], ['.', 'Period'], ['/', 'Slash'], ['Right Shift', 'ShiftRight'],
  ['Left Ctrl', 'ControlLeft'], ['Windows', 'MetaLeft'], ['Left Alt', 'AltLeft'], ['Space', 'Space'], ['Right Alt', 'AltRight'], ['Right Ctrl', 'ControlRight'],
  ['Insert', 'Insert'], ['Home', 'Home'], ['Page Up', 'PageUp'], ['Delete', 'Delete'], ['End', 'End'], ['Page Down', 'PageDown'], ['Arrow Up', 'ArrowUp'], ['Arrow Down', 'ArrowDown'], ['Arrow Left', 'ArrowLeft'], ['Arrow Right', 'ArrowRight']
]
keyboard.forEach(([label, code], i) => add(63 + i, label, 'Keyboard', code))
;[['Num Lock', 'NumLock'], ['Num /', 'NumpadDivide'], ['Num *', 'NumpadMultiply'], ['Num -', 'NumpadSubtract'], ['Num +', 'NumpadAdd'], ['Num .', 'NumpadDecimal'], ['Num Enter', 'NumpadEnter']].forEach(([label, code], i) => add(132 + i, label, 'Numpad', code))
for (let i = 0; i <= 9; i++) add(139 + i, `Num ${i}`, 'Numpad', `Numpad${i}`)
;['Play / Pause', 'Stop', 'Next track', 'Previous track', 'Volume up', 'Volume down', 'Mute'].forEach((label, i) => add(149 + i, label, 'Media'))
;['Left click', 'Middle click', 'Right click', 'Mouse button 5', 'Mouse button 4', 'Wheel up', 'Wheel down'].forEach((label, i) => add(200 + i, label, 'Mouse'))
add(37, 'Screenshot', 'Functions')
add(230, 'Controller mute', 'Functions'); add(231, 'Shift layer', 'Functions'); add(255, 'Unbound', 'Functions')
export const BINDING_KEYS: readonly BindingKey[] = keys
/** Same output bytes have different meanings across controller families. */
export function bindingKeys(modelId = 'G7ProCE'): readonly BindingKey[] {
  if (modelId !== 'T3CE') return BINDING_KEYS
  return [...keys.filter(k => k.value < 31 || k.value > 39), ...['C1', 'C2', 'C3', 'C4', 'T1', 'T2', 'T3', 'Touch right stick', 'Touch face buttons'].map((label, i) => ({ value: 31 + i, label, group: 'Controller' }))]
}
export const bindingLabel = (value: number, modelId = 'G7ProCE'): string => value === 0 ? 'Empty / original' : bindingKeys(modelId).find(k => k.value === value)?.label ?? `Unknown code ${value}`
export function macroTargets(modelId: string): Array<{ value: number; label: string; icon?: number; tag?: string }> {
  if (modelId === 'T3CE') return functionLabels(modelId).map((label, value) => ({ value, label, icon: value === 1 ? 18 : 17, tag: label }))
  if (modelId === 'G7ProCE') return FUNCTION_LABELS.map((label, value) => ({ value, label, icon: value % 2 ? 18 : 17, tag: ['L4', 'R4', 'L5', 'R5'][value] }))
  return []
}
export const keyboardCode = (code: string): number | undefined => keys.find((k) => k.code === code)?.value

export function setBinding(p: Packet, values: number[], isTrigger: boolean, functionKey: boolean): void {
  if (values.length !== 3 || values.some((v) => !Number.isInteger(v) || v < 0 || v > 255)) throw new Error('A binding needs three byte-sized output slots')
  ;(isTrigger ? trigger : button).setMap(p, values as [number, number, number])
  if (functionKey) macro.setFlags(p, { macro: false })
}

/** Original G7 input section, matching Connect's original-state decoder. */
export function originalButtonKeys(raw: Uint8Array, modelId = 'G7ProCE'): number[] {
  if (raw.length < 64 || raw[0] !== 0x12) return []
  const result: number[] = []
  const dpad = raw[58] & 15
  const directions: Record<number, number> = { 0: 1, 1: 41, 2: 4, 3: 43, 4: 2, 5: 42, 6: 3, 7: 40 }
  if (directions[dpad]) result.push(directions[dpad])
  for (const [byte, bit, key] of [[58, 4, 11], [58, 5, 9], [58, 6, 10], [58, 7, 12], [59, 0, 5], [59, 1, 6], [59, 2, 19], [59, 3, 20], [59, 4, 14], [59, 5, 15], [59, 6, 7], [59, 7, 8], [60, 0, 13], [60, 1, 16], [60, 3, 17], [60, 4, 18], ...(modelId === 'T3CE' ? Array.from({ length: 7 }, (_, i) => [61, i, 31 + i]) : [[63, 0, 31], [63, 1, 32]])]) {
    if (raw[byte] & (1 << bit)) result.push(key)
  }
  return result
}
