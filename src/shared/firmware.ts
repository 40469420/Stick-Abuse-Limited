export const FIRMWARE_IMAGES = [
  { version: '2.1.0', variant: 'Key', sha256: '29aa64506ad9fbb347d1e3681a79db4563b78eb93aea6298eae7d952df8e4cae' },
  { version: '2.1.0', variant: 'No_Key', sha256: '3466a5051eaa41413b6510940c575b0363e87741893ff1ee6f6f6c2b621c83df' },
  { version: '2.2.9', variant: 'Key', sha256: '4d2982df76d92f0ef7564a98005c8b01c25e0c9d1f995becbe1afe72e55882c4' },
  { version: '2.2.9', variant: 'No_Key', sha256: '5ba543ae064b1fb4ff9d37d5da75168f36fd165f57fa7ce44844277cdd25a2a7' }
] as const
export type FirmwareImage = { path: string; version: string; variant: string; sha256: string }
export type FirmwareStatus = { running: boolean; message: string; backup: string | null }
