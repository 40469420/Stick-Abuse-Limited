/**
 * App theme — single default look. The UI stylesheet runs on CSS variables;
 * the default set is applied to :root on launch. (The old multi-theme
 * picker was removed with the tab cull; this module keeps the variable
 * machinery so canvas graphs and styles keep working.)
 */

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

const DEFAULT_THEME: AppTheme = {
  id: 'default',
  label: 'Default',
  vars: {
    '--bg': '#14090d', '--bg-1': '#1e1015', '--bg-2': '#2a151c', '--bg-3': '#361b24',
    '--line': '#40222c', '--line-2': '#552c38',
    '--text': '#f7ecef', '--text-2': '#c9a3ad', '--text-3': '#8f6470',
    '--accent': '#f43f52', '--accent-2': '#ff8fa0', '--on-accent': '#07101d',
    '--good': '#3ecf8e', '--warn': '#f5b544', '--bad': '#ff6b6b', '--violet': '#a78bfa'
  }
}

export function applyTheme(): void {
  const vars = DEFAULT_THEME.vars
  const root = document.documentElement
  for (const key of VARS) {
    const value = vars[key]
    if (value) root.style.setProperty(key, value)
    else root.style.removeProperty(key)
  }
}
