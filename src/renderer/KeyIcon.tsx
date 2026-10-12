export function KeyIcon({ value, tag, size = 18 }: { value: number; tag?: string; size?: number }): JSX.Element | null {
  const s = size
  const wrap = (inner: JSX.Element): JSX.Element => (
    <svg aria-hidden="true" focusable="false" width={s} height={s} viewBox="0 0 20 20" style={{ verticalAlign: 'middle', flexShrink: 0 }}>{inner}</svg>
  )
  const label = (bg: string, ch: string, fg = '#fff', fs = 10): JSX.Element =>
    wrap(<><circle cx={10} cy={10} r={8.5} fill={bg} /><text x={10} y={10.5} fontSize={fs} fill={fg} fontWeight={800} textAnchor="middle" dominantBaseline="central">{ch}</text></>)
  const arrow = (pts: string): JSX.Element =>
    wrap(<><rect x={2.5} y={2.5} width={15} height={15} rx={4.5} fill="#33333d" /><polygon points={pts} fill="#fff" /></>)
  const pill = (ch: string, tall: boolean): JSX.Element =>
    wrap(<><rect x={2} y={tall ? 3 : 6.5} width={16} height={tall ? 14 : 7} rx={3.5} fill={tall ? '#3a3a46' : '#4a4a55'} /><text x={10} y={10.5} fontSize={6} fill="#fff" fontWeight={800} textAnchor="middle" dominantBaseline="central">{ch}</text></>)
  const paddle = (ch: string): JSX.Element =>
    wrap(<><rect x={3.5} y={3.5} width={13} height={13} rx={5.5} fill="#4a4a55" stroke="#7a7a88" strokeWidth={1} /><text x={10} y={10.5} fontSize={6} fill="#fff" fontWeight={800} textAnchor="middle" dominantBaseline="central">{ch}</text></>)
  switch (value) {
    case 9: return label('#2ca243', 'A')
    case 10: return label('#e74856', 'B')
    case 11: return label('#2f7de1', 'X')
    case 12: return label('#f2b90d', 'Y')
    case 1: return arrow('10,5.5 14.5,12 5.5,12')
    case 2: return arrow('10,14.5 14.5,8 5.5,8')
    case 3: return arrow('5.5,10 12,5.5 12,14.5')
    case 4: return arrow('14.5,10 8,5.5 8,14.5')
    case 5: return pill('LB', false)
    case 6: return pill('RB', false)
    case 19: return pill('LT', true)
    case 20: return pill('RT', true)
    case 7:
    case 8:
      return wrap(<><circle cx={10} cy={10} r={8} fill="#33333d" stroke="#8a8a96" /><circle cx={10} cy={7} r={3} fill="#8a8a96" /><text x={10} y={16} fontSize={6} fill="#fff" textAnchor="middle">{value === 7 ? 'L' : 'R'}</text></>)
    case 13:
      return wrap(<><circle cx={10} cy={10} r={8} fill="none" stroke="#8a8a96" strokeWidth={2} /><circle cx={10} cy={10} r={2.5} fill="#8a8a96" /></>)
    case 14:
      return wrap(<><rect x={3} y={6} width={9} height={8} rx={1.5} fill="none" stroke="#8a8a96" strokeWidth={1.5} /><rect x={8} y={8.5} width={9} height={8} rx={1.5} fill="#33333d" stroke="#8a8a96" strokeWidth={1.5} /></>)
    case 15:
      return wrap(<><rect x={2.5} y={2.5} width={15} height={15} rx={4.5} fill="#33333d" /><path d="M6 7.5h8M6 10h8M6 12.5h8" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" /></>)
    case 16:
      return wrap(<><rect x={2.5} y={6} width={15} height={9} rx={2} fill="#33333d" /><circle cx={10} cy={10.5} r={2.8} fill="none" stroke="#8a8a96" strokeWidth={1.5} /><rect x={8} y={4} width={4} height={2.5} rx={1} fill="#33333d" /></>)
    case 17: return paddle(tag ?? 'FL1')
    case 18: return paddle(tag ?? 'FR1')
    case 31: return paddle('L5')
    case 32: return paddle('R5')
    default:
      if (value >= 21 && value <= 30) return pill(value < 25 ? 'LS' : 'RS', true)
      if (value >= 50 && value <= 155) return pill('KEY', false)
      if (value >= 200 && value <= 206) return pill('M', true)
      return null
  }
}
