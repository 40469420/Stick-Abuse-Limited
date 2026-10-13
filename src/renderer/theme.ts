/**
 * App themes — the UI stylesheet runs on CSS variables, so a theme is just
 * 15 color overrides applied to :root. Persisted in localStorage, applied
 * on launch and on every pick. Canvas graphs (curve plot, dials) use fixed
 * paint colors and intentionally keep theirs in every theme.
 */
import { createContext, useEffect, useState } from 'react'

export interface AppTheme {
  id: string
  label: string
  vars: Record<string, string>
}

const VARS = [
  '--bg', '--bg-1', '--bg-2', '--bg-3', '--line', '--line-2',
  '--text', '--text-2', '--text-3',
  '--accent', '--accent-2', '--on-accent',
  '--good', '--warn', '--bad', '--violet',
  '--radius', '--radius-sm'
] as const

export const THEMES: ReadonlyArray<AppTheme> = [
  {
    id: 'default',
    label: 'Default',
    vars: {
      '--bg': '#14090d', '--bg-1': '#1e1015', '--bg-2': '#2a151c', '--bg-3': '#361b24',
      '--line': '#40222c', '--line-2': '#552c38',
      '--text': '#f7ecef', '--text-2': '#c9a3ad', '--text-3': '#8f6470',
      '--accent': '#f43f52', '--accent-2': '#ff8fa0', '--on-accent': '#07101d',
      '--good': '#3ecf8e', '--warn': '#f5b544', '--bad': '#ff6b6b', '--violet': '#a78bfa'
    }
  },
  {
    id: 'cyberpunk',
    label: 'Cyberpunk 2077',
    vars: {
      '--bg': '#050508', '--bg-1': '#121218', '--bg-2': '#1a1a24', '--bg-3': '#242433',
      '--line': '#2e2e3d', '--line-2': '#4a4a5e',
      '--text': '#e8f0f2', '--text-2': '#9fb3bd', '--text-3': '#5a6b75',
      '--accent': '#fcee0a', '--accent-2': '#fff06b', '--on-accent': '#0b0b10',
      '--good': '#00e5a0', '--warn': '#ffb300', '--bad': '#ff003c', '--violet': '#ff2fb3',
      '--radius': '3px', '--radius-sm': '1px'
    }
  },
  {
    id: 'sunset-overdrive',
    label: 'Sunset Overdrive',
    vars: {
      '--bg': '#140f1e', '--bg-1': '#1e1429', '--bg-2': '#2b1d3d', '--bg-3': '#3a2651',
      '--line': '#4a3266', '--line-2': '#6b4a94',
      '--text': '#fdf0f5', '--text-2': '#d4a9d8', '--text-3': '#8f6ba0',
      '--accent': '#ff7a1a', '--accent-2': '#ffc53d', '--on-accent': '#201002',
      '--good': '#00d9a0', '--warn': '#ffd23d', '--bad': '#ff4d6d', '--violet': '#b967ff'
    }
  },
  {
    id: 'discord',
    label: 'Discord',
    vars: {
      '--bg': '#1e1f22', '--bg-1': '#2b2d31', '--bg-2': '#35373c', '--bg-3': '#404249',
      '--line': '#3f4147', '--line-2': '#4e5058',
      '--text': '#f2f3f5', '--text-2': '#b5bac1', '--text-3': '#7d818c',
      '--accent': '#5865F2', '--accent-2': '#8f9bf3', '--on-accent': '#ffffff',
      '--good': '#57F287', '--warn': '#FEE75C', '--bad': '#ED4245', '--violet': '#EB459E'
    }
  },
  {
    id: 'spotify',
    label: 'Spotify',
    vars: {
      '--bg': '#121212', '--bg-1': '#181818', '--bg-2': '#242424', '--bg-3': '#2e2e2e',
      '--line': '#2b2b2b', '--line-2': '#3e3e3e',
      '--text': '#ffffff', '--text-2': '#b3b3b3', '--text-3': '#6a6a6a',
      '--accent': '#1DB954', '--accent-2': '#1ED760', '--on-accent': '#000000',
      '--good': '#1ED760', '--warn': '#eab308', '--bad': '#E91429', '--violet': '#AFB1FF',
      '--radius': '12px', '--radius-sm': '8px'
    }
  }
]

export function themeById(id: string): AppTheme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}

export function applyTheme(id: string): void {
  const vars = themeById(id).vars
  const root = document.documentElement
  for (const key of VARS) {
    const value = vars[key]
    if (value) root.style.setProperty(key, value)
    else root.style.removeProperty(key)
  }
}

interface ThemeCtx {
  theme: string
  setTheme: (id: string) => void
}

export const ThemeContext = createContext<ThemeCtx>({ theme: 'default', setTheme: () => undefined })

export function useThemeState(): [string, (id: string) => void] {
  const [theme, setThemeState] = useState<string>(() => {
    try {
      const saved = window.localStorage.getItem('sticklabs.theme')
      if (saved && THEMES.some((t) => t.id === saved)) return saved
    } catch {
      /* ignore */
    }
    return 'default'
  })
  useEffect(() => {
    applyTheme(theme)
  }, [theme])
  const setTheme = (id: string): void => {
    if (!THEMES.some((t) => t.id === id)) return
    setThemeState(id)
    try {
      window.localStorage.setItem('sticklabs.theme', id)
    } catch {
      /* ignore */
    }
  }
  return [theme, setTheme]
}
