import { Help } from './Help'
import { useEffect, useState } from 'react'
import { api } from './api'
import { firmwareConfirmation, firmwareTarget, type FirmwareImage, type FirmwareStatus } from '../shared/firmware'

export function FirmwarePanel({ hasUnsavedEdits = false, connectedModel = null, connectedProductId = null, readOnlyPreview = false }: { hasUnsavedEdits?: boolean; connectedModel?: string | null; connectedProductId?: number | null; readOnlyPreview?: boolean }): JSX.Element {
  const [image, setImage] = useState<FirmwareImage | null>(null)
  const [status, setStatus] = useState<FirmwareStatus>({ running: false, message: 'Choose an original firmware file. Nothing has been flashed.', backup: null })
  const [busy, setBusy] = useState(false), [confirmation, setConfirmation] = useState(''), [accepted, setAccepted] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  useEffect(() => {
    void api().firmwareStatus().then(setStatus).catch((error) => setStatus((s) => ({ ...s, message: error.message })))
    return api().on('firmware:status', setStatus)
  }, [])
  async function choose(version?: string): Promise<void> {
    if (!acknowledged) return
    setBusy(true); setImage(null); setConfirmation(''); setAccepted(false)
    try { const result = await api().chooseFirmware(version); setImage(result); setStatus(await api().firmwareStatus()) }
    catch (error) { setStatus((s) => ({ ...s, message: (error as Error).message })) }
    finally { setBusy(false) }
  }
  async function flash(): Promise<void> {
    if (!acknowledged) return
    setBusy(true)
    try { setStatus(await api().flashFirmware(confirmation)) }
    catch (error) { const latest = await api().firmwareStatus(); setStatus({ ...latest, message: (error as Error).message }) }
    finally { setBusy(false); setConfirmation(''); setAccepted(false) }
  }
  useEffect(() => { setAcknowledged(false); setAccepted(false); setConfirmation(''); setImage(null) }, [connectedModel, connectedProductId])
  const locked = busy || status.running
  const tarantula = connectedModel === 'T3CE' || image?.modelId === 'T3CE'
  let directUsb = false
  try { firmwareTarget(connectedModel ?? undefined, connectedProductId ?? -1); directUsb = true } catch { /* Model or connection is not flashable. */ }
  const requiredConfirmation = image ? firmwareConfirmation(image) : ''
  return <div className="stack">
    <section className="rc-disclaimer" aria-labelledby="firmware-disclaimer-title">
      <h2 id="firmware-disclaimer-title">DISCLAIMER</h2>
      {tarantula && <><h3>EXTREMELY EXPERIMENTAL — TARANTULA 8K</h3><p><strong>Flashing or downgrading Tarantula firmware could brick your device permanently. This path has not been tested on a physical Tarantula. Recovery is not guaranteed. Proceed entirely at your own risk.</strong></p><p>2.1.2 is the older bundled image; 2.4.3 is the newer bundled image. The 2.1.2 Key file differs from Connect’s recorded MD5. The original updater accepts its container and header, but the source discrepancy and downgrade compatibility remain unresolved.</p></>}
      {!tarantula && <p>You can destroy your controller doing this, this is at your own risk. 2.1.0 is RC Era, Current edition is 2.2.9</p>}
      <p>If anything goes wrong, if your controller does not power on, do not freak out. Open connect and wait for upgrading to disappear. This will reset the controller. In downgraded versions you CANNOT open connect or it will force upgrade</p>
      <button className="btn rc-acknowledge" disabled={acknowledged} onClick={() => setAcknowledged(true)}>{acknowledged ? 'Acknowledged' : 'I understand Machi'}</button>
    </section>
    <fieldset disabled={!acknowledged} className={`rc-controls${acknowledged ? '' : ' rc-controls-locked'}`} aria-label="Firmware controls">
    <section className="card"><div className="section-title"><h2>Firmware</h2><Help title="Firmware preparation and recovery">Only open Connect after the Stick-Abuse-Limited updater has finished or stopped. Connect restored our test controller, but recovery is not guaranteed on every failure or device. A failed flash may require hardware repair. GameSir’s dual-backup setting does not guarantee recovery. RC behavior and compatibility depend on the controller hardware and firmware. Controller only: G7 Pro 8K 2.1.0/2.2.9 or extremely experimental Tarantula 8K 2.1.2/2.4.3. Native header validation is not a guarantee of hardware compatibility. GameSir Connect must be installed for its updater library, but close its window and tray process before testing. Use a direct USB connection and a stable cable.</Help></div><p className="hint">Close GameSir Connect before flashing. Use a stable cable and direct USB connection.</p>
      <p className="hint">{connectedModel === 'T3CE' ? 'Tarantula 8K · extremely experimental' : 'G7 Pro 8K'} · {directUsb ? 'Direct USB target identified' : 'Connect a supported controller directly by USB to flash'}</p>
      <div className="row wrap">{(connectedModel === 'T3CE' ? ['2.1.2','2.4.3'] : ['2.1.0','2.2.9']).map(version => <button key={version} className="btn" disabled={locked} onClick={() => void choose(`${connectedModel === 'T3CE' ? 'T3CE' : 'G7ProCE'}:${version}`)}>Validate bundled {version}</button>)}</div>
      <button className="btn" disabled={locked} onClick={() => void choose()}>Choose and validate .ufw file</button>
      {image && <><p><strong>Target: {image.modelId === 'T3CE' ? 'Tarantula 8K' : 'G7 Pro 8K'} {image.version} · {image.variant}</strong></p>
        {image.experimental && <p className="note bad">EXTREMELY EXPERIMENTAL — could brick the device. {image.sourceWarning}</p>}
        <Help title="Validated firmware details">File: {image.path}<br />SHA-256: {image.sha256}</Help>
        <label><input type="checkbox" checked={accepted} disabled={locked} onChange={(event) => setAccepted(event.target.checked)} /> I accept the risk of losing controller functionality. This writes firmware.</label>
        <p>Type <strong>{requiredConfirmation}</strong> to enable the flash button.</p>
        <input aria-label="Firmware flash confirmation" value={confirmation} disabled={locked} onChange={(event) => setConfirmation(event.target.value)} />
        <button className="btn" disabled={readOnlyPreview || locked || hasUnsavedEdits || !accepted || confirmation !== requiredConfirmation || !directUsb || image.modelId !== connectedModel} onClick={() => void flash()}>Back up profiles and flash controller {image.version}</button>
      </>}
      <p role="status">{status.message}</p>
      {hasUnsavedEdits && <p>Save or discard your unsaved profile edits before flashing. The backup reads the settings stored on the controller.</p>}
      {locked && <p><strong>Wait for the operation to finish. Do not unplug USB or quit. Any percentage shown comes from GameSir’s updater; wait for its final result even at 100%.</strong></p>}
      {status.backup && <button className="btn ghost" disabled={locked} onClick={() => void api().openFirmwareBackup()}>Open saved profiles and flash log</button>}
      <div className="context-help"><Help title="How this works">After a completed update, rescan USB, reconnect, and verify the reported firmware version. The updater finishing does not prove the controller booted the target version. All four profiles are saved before entering update mode, using the model’s full profile size. This saves settings, not a full flash dump or guaranteed recovery image. G7 2.1.0/2.2.9 and Tarantula 2.1.2/2.4.3 images are included. Tarantula hardware flashing and recovery are untested. No profiles are restored automatically.</Help></div>
    </section>
    </fieldset>
  </div>
}
