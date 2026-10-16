import { useEffect, useState } from 'react'
import { api } from './api'
import type { CommunityProfile } from '@shared/community'
import { Help } from './Help'

export function CommunityProfiles() {
  const [profiles, setProfiles] = useState<CommunityProfile[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const refresh = async () => {
    setLoading(true); setMessage('')
    try { setProfiles(await api().communityProfiles()) }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
    finally { setLoading(false) }
  }
  useEffect(() => { void refresh() }, [])
  return <section className="stack">
    <div className="row wrap" style={{ gap:8 }}><button className="btn" disabled={loading || !!saving} onClick={() => void refresh()}>{loading ? 'Loading…' : 'Refresh'}</button><button className="btn ghost" onClick={() => void api().openExternal('https://github.com/40469420/Stick-Abuse-Limited/tree/main/community')}>View on GitHub</button><Help title="Using community profiles">Download a profile, back up your existing settings, then use Profiles → Import to select the destination slot. Downloads do not change your controller. Match the controller model and firmware, and review settings before use. This collection contains 1070-byte profile binaries; other shared configs remain on GitHub.</Help></div>
    {message && <div className="note" role="status">{message}</div>}
    {!loading && profiles.length === 0 && !message && <div className="note">No community profiles available yet.</div>}
    <div className="community-grid">{profiles.map(profile => <article className="card stack" key={profile.name}>
      <div className="section-title"><h3>{profile.name.replace(/\.(sticklab\.)?bin$/i, '')}</h3></div>
      <span className="hint">Shared by @Machixo · {profile.size} bytes</span>
      {profile.name === 'Machis main apex.bin' && <p className="hint">Left stick: 5% deadzone · 95% anti-deadzone. Right stick: 0% deadzone · 0% anti-deadzone. Both input thresholds and output ceilings: 100%.</p>}
      {profile.name === 'Main Apex (All rounder).sticklab.bin' && <><p className="hint">All-rounder · L3 → D-pad Up · Capture → T · FL1/FR1 → A/B · FL2/FR2 → X/Y</p><span className="hint">RC neutral · macros and turbo disabled</span></>}
      <button className="btn" disabled={!!saving || loading} onClick={() => {
        setSaving(profile.name); setMessage('')
        void api().downloadCommunityProfile(profile.name).then(saved => { if(saved) setMessage(`Saved ${profile.name}. Open Profiles → Import to load it.`) }).catch(error => setMessage(String(error instanceof Error ? error.message : error))).finally(() => setSaving(null))
      }}>{saving === profile.name ? 'Downloading…' : 'Download profile'}</button>
    </article>)}</div>
  </section>
}
