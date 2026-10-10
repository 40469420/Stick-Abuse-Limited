import { useEffect, useState } from 'react'
import { api } from './api'
import type { FirmwareImage, FirmwareStatus } from '../shared/firmware'

export function FirmwarePanel({ hasUnsavedEdits = false }: { hasUnsavedEdits?: boolean }): JSX.Element {
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
  const locked = busy || status.running
  return <div className="stack">
    <section className="rc-disclaimer" aria-labelledby="firmware-disclaimer-title">
      <h2 id="firmware-disclaimer-title">DISCLAIMER</h2>
      <p>You can destroy your controller doing this, this is at your own risk. 2.1.0 is RC Era, Current edition is 2.2.9</p>
      <p>If anything goes wrong, if your controller does not power on, do not freak out. Open connect and wait for upgrading to disappear. This will reset the controller. In downgraded versions you CANNOT open connect or it will force upgrade</p>
      <button className="btn rc-acknowledge" disabled={acknowledged} onClick={() => setAcknowledged(true)}>{acknowledged ? 'Acknowledged' : 'I understand Machi'}</button>
    </section>
    <fieldset disabled={!acknowledged} className={`rc-controls${acknowledged ? '' : ' rc-controls-locked'}`} aria-label="Firmware controls">
    <section className="card"><h2>Firmware</h2>
      <p>Only open Connect after the Stick Labs updater has finished or stopped. Connect restored our test controller, but recovery is not guaranteed on every failure or device.</p>
      <p>A failed flash may require hardware repair. GameSir’s dual-backup setting does not guarantee recovery. RC behavior and compatibility depend on the controller hardware and firmware.</p>
      <p>Controller only · G7 Pro 8K · original 2.1.0 or 2.2.9 images. GameSir Connect must be installed for its updater library, but close its window and tray process before testing. Use a direct USB connection and a stable cable.</p>
      <p>All four profiles are saved before entering update mode. This saves settings, not a full flash dump or guaranteed recovery image. Original controller 2.1.0 and 2.2.9 images are included.</p>
      <div className="row"><button className="btn" disabled={locked} onClick={() => void choose('2.1.0')}>Validate bundled 2.1.0</button><button className="btn" disabled={locked} onClick={() => void choose('2.2.9')}>Validate bundled 2.2.9</button></div>
      <button className="btn" disabled={locked} onClick={() => void choose()}>Choose and validate .ufw file</button>
      {image && <><p><strong>Target: controller {image.version} · {image.variant}</strong><br />{image.path}</p>
        <p className="hint">SHA-256: {image.sha256}</p>
        <label><input type="checkbox" checked={accepted} disabled={locked} onChange={(event) => setAccepted(event.target.checked)} /> I accept the risk of losing controller functionality. This writes firmware.</label>
        <p>Type <strong>FLASH {image.version}</strong> to enable the flash button.</p>
        <input aria-label="Firmware flash confirmation" value={confirmation} disabled={locked} onChange={(event) => setConfirmation(event.target.value)} />
        <button className="btn" disabled={locked || hasUnsavedEdits || !accepted || confirmation !== `FLASH ${image.version}`} onClick={() => void flash()}>Back up profiles and flash controller {image.version}</button>
      </>}
      <p role="status">{status.message}</p>
      {hasUnsavedEdits && <p>Save or discard your unsaved profile edits before flashing. The backup reads the settings stored on the controller.</p>}
      {locked && <p><strong>Wait for the operation to finish. Do not unplug USB or quit. Any percentage shown comes from GameSir’s updater; wait for its final result even at 100%.</strong></p>}
      {status.backup && <button className="btn ghost" disabled={locked} onClick={() => void api().openFirmwareBackup()}>Open saved profiles and flash log</button>}
      <p className="hint">After a completed update, rescan USB, reconnect, and verify the reported firmware version. The updater finishing does not prove the controller booted the target version. No profiles are restored automatically.</p>
    </section>
    </fieldset>
  </div>
}
