import type { ColorKey, Grade } from '../types'
import { levelOf } from '../lib/priority'

interface Props {
  subject: string
  color: ColorKey
  grades: Grade[]
  /** YYYY-MM-DD: קצה הציר */
  today: string
}

const W = 320
const H = 120
const PAD = { top: 10, right: 34, bottom: 22, left: 30 }
const ms = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8))
const dm = (iso: string) => `${Number(iso.slice(8))}.${Number(iso.slice(5, 7))}`
const label = (g: Grade) =>
  `${dm(g.date)}: ${g.kind === 'exam' ? `ציון ${g.score}` : `הערכה עצמית ${g.score}/5`}${g.topic ? `, ${g.topic}` : ''}`

/**
 * התקדמות במקצוע לאורך הזמן: קו אחד, 0–100. מבחן = נקודה מלאה, הערכה עצמית = נקודה חלולה
 * (1 → 0, 5 → 100). קו מקווקו ב-75, הרמה הרגילה. ריחוף על נקודה מציג את הפרטים.
 */
export function ProgressChart({ subject, color, grades, today }: Props) {
  const list = [...grades].sort((a, b) => a.date.localeCompare(b.date))
  if (!list.length) return null
  const first = ms(list[0].date)
  const lastMs = Math.max(ms(today), ms(list[list.length - 1].date))
  const span = Math.max(lastMs - first, 7 * 864e5)
  const x = (iso: string) => PAD.left + ((ms(iso) - first) / span) * (W - PAD.left - PAD.right)
  const y = (v: number) => PAD.top + (1 - v) * (H - PAD.top - PAD.bottom)
  const pts = list.map((g) => ({ g, cx: x(g.date), cy: y(levelOf(g)) }))
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p.cx.toFixed(1)},${p.cy.toFixed(1)}`).join(' ')
  const last = pts[pts.length - 1]
  const lastText = last.g.kind === 'exam' ? String(last.g.score) : `${last.g.score}/5`

  return (
    <figure className={`progress-chart c-${color}`}>
      <figcaption>{subject}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ direction: 'ltr' }} role="img" aria-label={`התקדמות ב${subject}: ${list.map(label).join('; ')}`}>
        {[0, 0.5, 1].map((v) => (
          <g key={v}>
            <line className="pc-grid" x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} />
            <text className="pc-axis" x={PAD.left - 6} y={y(v) + 4} textAnchor="end">
              {v * 100}
            </text>
          </g>
        ))}
        <line className="pc-normal" x1={PAD.left} x2={W - PAD.right} y1={y(0.75)} y2={y(0.75)} />
        <text className="pc-axis" x={W - PAD.right + 4} y={y(0.75) + 4}>
          רגיל
        </text>
        <text className="pc-axis" x={PAD.left} y={H - 6} textAnchor="start">
          {dm(list[0].date)}
        </text>
        <text className="pc-axis" x={W - PAD.right} y={H - 6} textAnchor="end">
          {dm(today > list[list.length - 1].date ? today : list[list.length - 1].date)}
        </text>
        {pts.length > 1 && <path className="pc-line" d={path} />}
        {pts.map((p) => (
          <g key={p.g.id} className="pc-point">
            <circle className={p.g.kind === 'exam' ? 'pc-dot' : 'pc-dot is-self'} cx={p.cx} cy={p.cy} r={5} />
            {/* אזור ריחוף גדול מהנקודה */}
            <circle className="pc-hit" cx={p.cx} cy={p.cy} r={11}>
              <title>{label(p.g)}</title>
            </circle>
          </g>
        ))}
        <text className="pc-value" x={last.cx + 8} y={last.cy + 4}>
          {lastText}
        </text>
      </svg>
    </figure>
  )
}
