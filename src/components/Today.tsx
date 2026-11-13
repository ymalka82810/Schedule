import type { ReactNode } from 'react'
import type { DayIndex, Minutes } from '../types'
import type { Block } from '../lib/layout'
import { DAY_NAMES, addDays, formatTime, isoDate, minutesOfDay } from '../lib/time'
import { dayInfo } from '../lib/hebrew'

interface Props {
  /** הבלוקים של השבוע הנוכחי */
  blocks: Block[]
  /** הבלוקים של השבוע הבא, למקרה ש"הבא" נופל שם */
  nextWeekBlocks: Block[]
  now: Date
  onOpen: (blockId: string) => void
}

const duration = (m: Minutes) => {
  const h = Math.floor(m / 60)
  const min = m % 60
  if (!h) return `${min} דק׳`
  if (!min) return h === 1 ? 'שעה' : `${h} שעות`
  return `${h}:${String(min).padStart(2, '0')} שעות`
}

const live = (b: Block) => !b.isCancelled && !b.isMissed

/** שורה בכרטיס: בלוק רגיל נפתח בלחיצה, שגרה (ארוחה, תפילה) רק מוצגת */
function Row({ b, onOpen, children }: { b: Block; onOpen: (id: string) => void; children: ReactNode }) {
  if (b.type === 'reserved') return <div className={`today-row is-routine c-${b.color}`}>{children}</div>
  return (
    <button type="button" className={`today-row c-${b.color}`} onClick={() => onOpen(b.id)}>
      {children}
    </button>
  )
}

/** שם לתצוגה של כמה בלוקים באותה שעה (משבצת בחירה) */
const nameOf = (list: Block[]) => (list.length > 1 ? list.map((b) => b.name).join(' / ') : list[0].name)

/** "מה עכשיו, מה הבא, כמה זמן נשאר": השאלה הראשונה כשפותחים בטלפון */
export function Today({ blocks, nextWeekBlocks, now, onOpen }: Props) {
  const day = now.getDay() as DayIndex
  const nowMin = minutesOfDay(now)
  const holiday = dayInfo(isoDate(now)).holiday

  const today = blocks.filter((b) => b.day === day && live(b)).sort((a, b) => a.start - b.start)
  const current = today.filter((b) => b.start <= nowMin && nowMin < b.end)
  const nextStart = today.find((b) => b.start > nowMin)?.start
  const next = nextStart === undefined ? [] : today.filter((b) => b.start === nextStart)

  // אם היום נגמר: הדבר הראשון ביום הבא שיש בו משהו (עד שבוע קדימה)
  let later: { list: Block[]; date: Date } | null = null
  if (!current.length && !next.length) {
    for (let i = 1; i <= 7 && !later; i++) {
      const date = addDays(now, i)
      const d = date.getDay() as DayIndex
      const pool = d > day ? blocks : nextWeekBlocks
      // ביום אחר: הדבר הראשון שהוא לא שגרה
      const list = pool.filter((b) => b.day === d && live(b) && b.type !== 'reserved').sort((a, b) => a.start - b.start)
      if (list.length) later = { list: list.filter((b) => b.start === list[0].start), date }
    }
  }

  const meta = (b: Block) => [b.room, b.teacher].filter(Boolean).join(', ')

  return (
    <section className="today" aria-label="היום">
      {holiday && <p className="today-holiday">היום {holiday.name}</p>}

      {current.length > 0 && (
        <Row b={current[0]} onOpen={onOpen}>
          <span className="today-label">עכשיו</span>
          <span className="today-what">
            {nameOf(current)}
            {meta(current[0]) && <span className="muted"> · {meta(current[0])}</span>}
          </span>
          <span className="today-when">
            עד <bdi dir="ltr">{formatTime(current[0].end)}</bdi>, נשארו {duration(current[0].end - nowMin)}
          </span>
        </Row>
      )}

      {!current.length && next.length > 0 && (
        <p className="today-free">
          עכשיו פנוי, עוד {duration(next[0].start - nowMin)} עד הדבר הבא.
        </p>
      )}

      {next.length > 0 && (
        <Row b={next[0]} onOpen={onOpen}>
          <span className="today-label">{current.length ? 'אחר כך' : 'הבא'}</span>
          <span className="today-what">
            {nameOf(next)}
            {meta(next[0]) && <span className="muted"> · {meta(next[0])}</span>}
          </span>
          <span className="today-when">
            ב-<bdi dir="ltr">{formatTime(next[0].start)}</bdi>, בעוד {duration(next[0].start - nowMin)}
          </span>
        </Row>
      )}

      {!current.length && !next.length && (
        <p className="today-free">
          {today.some((b) => b.type !== 'reserved') ? 'סיימת להיום.' : 'היום אין שיעורים.'}
          {later &&
            ` הבא: ${nameOf(later.list)}, ${
              isoDate(later.date) === isoDate(addDays(now, 1)) ? 'מחר' : `ביום ${DAY_NAMES[later.date.getDay()]}`
            } ב-${formatTime(later.list[0].start)}.`}
        </p>
      )}
    </section>
  )
}
