import type { ReactNode } from 'react'
import { CommunityProfiles } from './CommunityProfiles'

export function ProfilesPage({ children }: { children: ReactNode }): JSX.Element {
  return <div className="stack" style={{ gap: 24 }}>
    <section aria-label="Controller profiles">{children}</section>
    <section className="stack" aria-labelledby="community-profiles-title">
      <div className="section-title"><h3 id="community-profiles-title">Community Profiles</h3></div>
      <CommunityProfiles />
    </section>
  </div>
}
