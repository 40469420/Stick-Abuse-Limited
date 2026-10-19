export const DEFAULT_THEME={background:'#0c1017',surface:'#141d29',controls:'#1d2b3b',border:'#34475f',text:'#f7ecef',muted:'#b5c8dd',accent:'#5ab8ff',success:'#3ecf8e',warning:'#f5b544',danger:'#ff6b6b',plot:'#e6adff'}
export type Theme=typeof DEFAULT_THEME
export const THEME_KEY='sal-theme-v1'
export function sanitizeTheme(value:unknown):Theme{
 const source=value&&typeof value==='object'?value as Record<string,unknown>:{}
 return Object.fromEntries(Object.entries(DEFAULT_THEME).map(([k,v])=>[k,typeof source[k]==='string'&&/^#[0-9a-f]{6}$/i.test(source[k] as string)?source[k]:v])) as Theme
}
export function themeVariables(t:Theme):Record<string,string>{return {'--bg':t.background,'--bg-1':t.surface,'--bg-2':t.controls,'--bg-3':`color-mix(in srgb, ${t.controls} 80%, ${t.accent})`,'--line':t.border,'--line-2':t.border,'--text':t.text,'--text-2':t.muted,'--text-3':t.muted,'--accent':t.accent,'--accent-2':t.accent,'--good':t.success,'--warn':t.warning,'--bad':t.danger,'--violet':t.plot,'--on-accent':((parseInt(t.accent.slice(1,3),16)*299+parseInt(t.accent.slice(3,5),16)*587+parseInt(t.accent.slice(5,7),16)*114)/1000)>145?'#111111':'#ffffff'}}
