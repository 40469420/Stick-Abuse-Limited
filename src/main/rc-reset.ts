/** Reset only proven G7-family RC bytes, retaining every other stored byte. */
export function neutralRcProfile(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length !== 1070) throw new Error('Unsupported RC reset profile layout')
  // Wire 0 is already factory-neutral; do not write EEPROM unnecessarily.
  if ([0, 11].includes(bytes[49]) && [0, 11].includes(bytes[50])) return null
  const next = bytes.slice()
  next[49] = 11
  next[50] = 11
  return next
}

export interface RcResetStatus {
  enabled: boolean
  running: boolean
  message: string
}
