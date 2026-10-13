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
  '--accent', '--accent-2', '--good', '--warn', '--bad', '--violet'
] as const

export const THEMES: ReadonlyArray<AppTheme> = [
  {
    id: 'default',
    label: 'Default',
    vars: {
      '--bg': '#14090d', '--bg-1': '#1e1015', '--bg-2': '#2a151c', '--bg-3': '#361b24',
      '--line': '#40222c', '--line-2': '#552c38',
      '--text': '#f7ecef', '--text-2': '#c9a3ad', '--text-3': '#8f6470',
      '--accent': '#f43f52', '--accent-2': '#ff8fa0',
      '--good': '#3ecf8e', '--warn': '#f5b544', '--bad': '#ff6b6b', '--violet': '#a78bfa'
    }
  },
  {
    id: 'midnight',
    label: 'Midnight',
    vars: {
      '--bg': '#0a0f1c', '--bg-1': '#101828', '--bg-2': '#16203a', '--bg-3': '#1f2c4d',
      '--line': '#26355a', '--line-2': '#35497a',
      '--text': '#eef3fc', '--text-2': '#a9bcd8', '--text-3': '#64779a',
      '--accent': '#3f8cff', '--accent-2': '#9cc2ff',
      '--good': '#3ecf8e', '--warn': '#f5b544', '--bad': '#ff6b6b', '--violet': '#a78bfa'
    }
  },
  {
    id: 'venom',
    label: 'Venom',
    vars: {
      '--bg': '#0a120c', '--bg-1': '#0f1a12', '--bg-2': '#152619', '--bg-3': '#1d3524',
      '--line': '#27452f', '--line-2': '#38643f',
      '--text': '#ecf7ee', '--text-2': '#a9d4b2', '--text-3': '#5f8a68',
      '--accent': '#34d17b', '--accent-2': '#9df0c0',
      '--good': '#3ecf8e', '--warn': '#f5b544', '--bad': '#ff6b6b', '--violet': '#a78bfa'
    }
  },
  {
    id: 'sunset',
    label: 'Sunset',
    vars: {
      '--bg': '#150f1e', '--bg-1': '#1e1428', '--bg-2': '#2a1c38', '--bg-3': '#38254c',
      '--line': '#452e5e', '--line-2': '#5f407e',
      '--text': '#f7ecf5', '--text-2': '#cfa9d4', '--text-3': '#8a6490',
      '--accent': '#f2762e', '--accent-2': '#ffc46b',
      '--good': '#3ecf8e', '--warn': '#ffd166', '--bad': '#ff6b6b', '--violet': '#c49bfa'
    }
  },
  {
    id: 'ghost',
    label: 'Ghost',
    vars: {
      '--bg': '#f2efe9', '--bg-1': '#e9e4da', '--bg-2': '#ded7c9', '--bg-3': '#d2c9b6',
      '--line': '#c4bba6', '--line-2': '#a89c82',
      '--text': '#1d1418', '--text-2': '#5c4f52', '--text-3': '#8f8078',
      '--accent': '#d42a3d', '--accent-2': '#f06070',
      '--good': '#1f9d5f', '--warn': '#b87a00', '--bad': '#d43a3a', '--violet': '#7a5fd0'
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
