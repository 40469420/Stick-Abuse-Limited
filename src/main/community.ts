import type { CommunityProfile } from '../shared/community'
const root = 'https://api.github.com/repos/40469420/Stick-Abuse-Limited/contents/community/profiles?ref=main'
export async function listCommunityProfiles(): Promise<CommunityProfile[]> {
  const response = await fetch(root, { signal: AbortSignal.timeout(15000), headers: { Accept: 'application/vnd.github+json' } })
  if (!response.ok) throw new Error(`GitHub could not load profiles (${response.status}). Try Refresh.`)
  return communityEntries(await response.json())
}
export function communityEntries(value: unknown): CommunityProfile[] {
  if (!Array.isArray(value)) throw new Error('Unexpected community listing')
  return value.filter((entry) => entry?.type === 'file' && typeof entry.name === 'string' && /^[^/\\]+\.bin$/i.test(entry.name) && Number.isSafeInteger(entry.size) && entry.size === 1070)
    .map(entry => ({ name: entry.name, size: entry.size, sha: String(entry.sha) })).sort((a,b)=>a.name.localeCompare(b.name))
}
export async function downloadCommunityProfile(name: string): Promise<Uint8Array> {
  const profiles = await listCommunityProfiles()
  if (!profiles.some(p => p.name === name)) throw new Error('This profile is no longer in the community collection. Refresh the list.')
  const response = await fetch(`https://raw.githubusercontent.com/40469420/Stick-Abuse-Limited/main/community/profiles/${encodeURIComponent(name)}`, { signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`Profile download failed (${response.status})`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.length !== 1070) throw new Error('Unexpected profile size; file was not saved')
  return bytes
}
