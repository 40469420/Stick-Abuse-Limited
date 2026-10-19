import { useEffect, useRef, useState, type ReactNode } from 'react'
import { api } from './api'

const ACCEPTANCE_KEY = 'sticklabs.unlimited.terms.v1'
const WAIT_MS = 60_000
function accepted(): boolean {
  try { return localStorage.getItem(ACCEPTANCE_KEY) === 'accepted' } catch { return false }
}

/** Mount controller controls only after explicit, locally remembered acceptance. */
export function TermsGate({ children }: { children: ReactNode }): JSX.Element {
  const [allowed, setAllowed] = useState(accepted)
  const [checked, setChecked] = useState(false)
  const [remaining, setRemaining] = useState(60)
  const [error, setError] = useState('')
  const started = useRef(performance.now())
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (allowed) return
    heading.current?.focus()
    const tick = (): void => setRemaining(Math.max(0, Math.ceil((WAIT_MS - (performance.now() - started.current)) / 1000)))
    tick()
    const timer = window.setInterval(tick, 250)
    return () => window.clearInterval(timer)
  }, [allowed])
  function accept(): void {
    if (!checked || performance.now() - started.current < WAIT_MS) return
    try { localStorage.setItem(ACCEPTANCE_KEY, 'accepted'); setAllowed(true) }
    catch { setError('Acceptance could not be saved. Check that local app storage is available, then try again.') }
  }
  if (allowed) return <>{children}</>
  return <div className="terms-backdrop">
    <section className="terms-dialog" role="dialog" aria-modal="true" aria-labelledby="terms-title" aria-describedby="terms-intro">
      <div className="terms-main">
        <header><span className="terms-eyebrow">Stick Abuse</span><h1 id="terms-title" tabIndex={-1} ref={heading}>Terms of use & risk acknowledgment</h1><p id="terms-intro">Read before using Stick Abuse. This is an independent, unofficial fork with experimental controller features.</p></header>
        <div className="terms-copy" tabIndex={0} aria-label="Terms and risks">
          <h2>Game rules and account penalties</h2>
          <p>RC filters, recoil reduction or jitter-style behavior, macros, recorded sequences and playback, turbo, automated inputs, keyboard/mouse output, remapping and other modified controller behavior may violate a game's terms, anti-cheat policies, platform rules or tournament restrictions. Possible consequences include warnings, disqualification, temporary or permanent bans, loss of accounts, progress, purchases or access. Detection and enforcement can change. Availability in this app or GameSir Connect does not mean a feature is allowed or undetectable.</p>
          <p>There is no ban-safe guarantee for any game, including Apex Legends or Call of Duty. You are responsible for checking the applicable rules before using modified inputs. This notice lists possible risks, not every prohibited use or every game's policy.</p>
          <h2>Experimental settings and measurements</h2>
          <p>Higher bit-depth requests, RC behavior, polling-rate settings, gyro mappings, trigger tuning, response curves, center offsets and calibration may behave differently across firmware, hardware and connection modes. Settings may be ignored, clamped, persist unexpectedly or change after reconnecting. Measurements do not prove sensor resolution, true USB polling rate, physical input latency or a competitive advantage. Lab bit-depth Apply writes settings; leaving the page does not automatically restore them.</p>
          <h2>Firmware, hardware and saved settings</h2>
          <p>Flashing or downgrading firmware can permanently disable or damage your controller, require hardware repair, affect warranty eligibility or make recovery impossible. Dual-backup firmware and GameSir Connect do not guarantee recovery. Disconnects, power loss, incompatible firmware or software errors can cause failure. Calibration, offsets, profile writes and other changes can alter controller behavior across profiles or persist after this app closes. Backups may fail and do not guarantee full recovery. Exporting settings may change Steam configuration files.</p>
          <h2>Your responsibility and limitation of liability</h2>
          <p>This software is provided as is and as available, without warranties, including warranties of fitness, accuracy, compatibility or freedom from errors. You voluntarily assume the risks of installing, running and modifying settings with it, including account penalties, hardware damage, lost settings or data, repair costs, interruption and other loss.</p>
          <p>To the maximum extent permitted by applicable law, the fork maintainer @Machixo, original authors and contributors disclaim responsibility and liability for claims, damages, bans, loss or other consequences arising from your use, misuse, configuration changes or firmware modifications.</p>
          <h2>Acceptance</h2>
          <p>By accepting and then using or modifying anything in Stick Abuse, you confirm that you have read and understand these risks, choose to proceed voluntarily and accept responsibility for your choices. Existing RC and firmware acknowledgments still apply. If you do not accept, do not use Stick Abuse.</p>
        </div>
        <footer><label className="terms-check"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} /> I have read and understand the risks and agree to these terms before using or modifying anything.</label>
          <div className="row wrap"><button className="btn primary" disabled={!checked || remaining > 0} onClick={accept}>{remaining > 0 ? `Read and review · ${remaining}s` : 'I understand and accept'}</button><span className="hint">Remembered on this Windows user profile. Clearing app data shows this again.</span></div>
          {error && <p className="note bad" role="alert">{error}</p>}
        </footer>
      </div>
      <aside className="terms-official"><h2>Prefer the official version?</h2><p>If this is to much for you get the official version here</p><button className="btn ghost" onClick={() => { void api().openExternal('https://github.com/Realkiyoshii/stick-labs').catch(() => setError('Could not open the official version. Visit https://github.com/Realkiyoshii/stick-labs in your browser.')) }}>Official Stick Labs ↗</button><span>github.com/Realkiyoshii/stick-labs</span></aside>
    </section>
  </div>
}
