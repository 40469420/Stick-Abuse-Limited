export const FIRMWARE_IMAGES = [
  { modelId: 'G7ProCE', product: 'GS_G7_Pro_CE_DV', filename: 'GS_G7_Pro_CE_DV_V210_Key.ufw', experimental: false, sourceWarning: '', version: '2.1.0', variant: 'Key', sha256: '29aa64506ad9fbb347d1e3681a79db4563b78eb93aea6298eae7d952df8e4cae' },
  { modelId: 'G7ProCE', product: 'GS_G7_Pro_CE_DV', filename: '', experimental: false, sourceWarning: '', version: '2.1.0', variant: 'No_Key', sha256: '3466a5051eaa41413b6510940c575b0363e87741893ff1ee6f6f6c2b621c83df' },
  { modelId: 'G7ProCE', product: 'GS_G7_Pro_CE_DV', filename: 'GS_G7_Pro_CE_DV_V229_Key.ufw', experimental: false, sourceWarning: '', version: '2.2.9', variant: 'Key', sha256: '4d2982df76d92f0ef7564a98005c8b01c25e0c9d1f995becbe1afe72e55882c4' },
  { modelId: 'G7ProCE', product: 'GS_G7_Pro_CE_DV', filename: '', experimental: false, sourceWarning: '', version: '2.2.9', variant: 'No_Key', sha256: '5ba543ae064b1fb4ff9d37d5da75168f36fd165f57fa7ce44844277cdd25a2a7' },
  { modelId: 'T3CE', product: 'GS_T3CE', filename: 'GS_T3CE_V212_Key.ufw', experimental: true, sourceWarning: 'Older 2.1.2 package: its Key file MD5 differs from Connect metadata. Source discrepancy unresolved; downgrade compatibility is unverified.', version: '2.1.2', variant: 'Key', sha256: 'd2b31a437986468bf6a019a2832869c7d9474dcbb0d6fe5ff3c4db3c6bf1fb61' },
  { modelId: 'T3CE', product: 'GS_T3CE', filename: 'GS_T3CE_V212_No_Key.ufw', experimental: true, sourceWarning: 'Older 2.1.2 package: its Key file MD5 differs from Connect metadata. Source discrepancy unresolved; downgrade compatibility is unverified.', version: '2.1.2', variant: 'No_Key', sha256: '2a02ca2f3dadd0ae801be8a521b000b6ff1db22af98fc72112165a2659daca1c' },
  { modelId: 'T3CE', product: 'GS_T3CE', filename: 'GS_T3CE_V243_Key.ufw', experimental: true, sourceWarning: 'Native image validation does not prove hardware compatibility or safe recovery.', version: '2.4.3', variant: 'Key', sha256: '46108d2be237b1b7173435b0e2b5a7191ca655b7b93f6560fcd7a25e65e739aa' },
  { modelId: 'T3CE', product: 'GS_T3CE', filename: 'GS_T3CE_V243_No_Key.ufw', experimental: true, sourceWarning: 'Native image validation does not prove hardware compatibility or safe recovery.', version: '2.4.3', variant: 'No_Key', sha256: '224c561abfc80a6c28d80547bf38dca6d7127cb8ef30ef3d4edb31bafcadb9ae' }
] as const
export type FirmwareModel = 'G7ProCE' | 'T3CE'
export type FirmwareImage = { path: string; version: string; variant: string; sha256: string; modelId: FirmwareModel; product: string; experimental: boolean; sourceWarning: string }
export function firmwareConfirmation(image: FirmwareImage): string { return image.modelId === 'T3CE' ? `FLASH TARANTULA ${image.version}` : `FLASH ${image.version}` }
export function firmwareTarget(modelId: string | undefined, productId: number): { modelId: FirmwareModel; product: string; profileLength: number; recoveryFile: string } {
 if(modelId === 'G7ProCE' && [0x10c5,0x10c6].includes(productId)) return {modelId,product:'GS_G7_Pro_CE_DV',profileLength:1070,recoveryFile:'GS_G7_Pro_CE_DV_V229_Key.ufw'}
 if(modelId === 'T3CE' && [0x103d,0x10ff,0x090d].includes(productId)) return {modelId,product:'GS_T3CE',profileLength:1935,recoveryFile:'GS_T3CE_V243_Key.ufw'}
 throw new Error('Connect a supported G7 Pro 8K or Tarantula 8K directly by USB. Receivers and other models are not supported for flashing.')
}
export type FirmwareStatus = { running: boolean; message: string; backup: string | null }
