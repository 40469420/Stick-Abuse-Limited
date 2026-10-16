import {api} from './api'
export const WEB_DESKTOP_PAGES = new Set(['rc','calibrate','lab','firmware','steam','marius'])
export function DesktopRequired(){return <section className="card stack"><h3>Download a local version to modify these settings</h3><p className="hint">This section uses desktop services that are not available in the browser.</p><button className="btn primary" style={{alignSelf:'flex-start'}} onClick={()=>void api().openExternal('https://github.com/40469420/Stick-Abuse-Limited/releases/latest')}>Download local version ↗</button></section>}
