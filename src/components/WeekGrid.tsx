import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { DayIndex, Minutes } from '../types'
import type { Block } from '../lib/layout'
import { DAYS, DAY_NAMES, addDays, formatTime, isSameDay, isoDate, minutesOfDay } from '../lib/time'
import { dayInfo } from '../lib/hebrew'

interface Props {
  weekStart: Date
  blocks: Block[]
  range: { start: Minutes; end: Minutes }
  now: Date
  selectedDay: DayIndex
  onSelectDay: (day: DayIndex) => void
  /** לחיצה על בלוק. בלי זה הבלוקים לתצוגה בלבד */
  onBlockClick?: (blockId: string) => void
  /** הערה לכל יום, למשל שם חופשה */
  dayNotes?: Partial<Record<DayIndex, string>>
  /** שחרור של בלוק שנגרר למקום חדש. בלי זה אין גרירה */
  onBlockMove?: (blockId: string, day: DayIndex, start: Minutes) => void
}

/** קפיצות של רבע שעה בגרירה */
const SNAP = 15
/** לחיצה ארוכה במגע לפני שהגרירה מתחילה, כדי לא להתבלבל עם גלילה */
const LONG_PRESS = 450

interface Drag {
  id: string
  name: string
  color: Block['color']
  len: Minutes
  /** כמה דקות מתחילת הבלוק נתפס */
  grab: Minutes
  origDay: DayIndex
  origStart: Minutes
  day: DayIndex
  start: Minutes
  touch: boolean
  x: number
  y: number
  /** הגרירה התחילה (אחרי תזוזה בעכבר או לחיצה ארוכה במגע) */
  active: boolean
}

export function WeekGrid({ weekStart, blocks, range, now, selectedDay, onSelectDay, onBlockClick, dayNotes, onBlockMove }: Props) {
  const [ghost, setGhost] = useState<Drag | null>(null)
  const drag = useRef<Drag | null>(null)
  const pressTimer = useRef<number | undefined>(undefined)
  /** אחרי גרירה הדפדפן שולח גם click: לא לפתוח את הכרטיס */
  const suppressClick = useRef(false)
  // הערכים העדכניים, בשביל המאזינים של הגרירה שנרשמים פעם אחת
  const rangeRef = useRef(range)
  const selectRef = useRef(onSelectDay)
  const moveRef = useRef(onBlockMove)
  useLayoutEffect(() => {
    rangeRef.current = range
    selectRef.current = onSelectDay
    moveRef.current = onBlockMove
  })

  useEffect(() => {
    const end = () => {
      window.clearTimeout(pressTimer.current)
      drag.current = null
      setGhost(null)
      document.body.classList.remove('is-dragging')
    }

    /** איפה הבלוק ינחת לפי מיקום האצבע או העכבר */
    const locate = (d: Drag, x: number, y: number) => {
      const r = rangeRef.current
      for (const el of document.elementsFromPoint(x, y)) {
        const h = el as HTMLElement
        const dayAttr = h.dataset?.day
        if (dayAttr === undefined) continue
        const day = Number(dayAttr) as DayIndex
        if (h.classList.contains('day-head')) {
          // בטלפון מוצג יום אחד: מעבר מעל לשונית של יום אחר עובר אליו
          if (day !== d.day) selectRef.current(day)
          return { day, start: d.start }
        }
        const rect = h.getBoundingClientRect()
        const min = r.start + ((y - rect.top) / rect.height) * (r.end - r.start) - d.grab
        const snapped = Math.round(min / SNAP) * SNAP
        const start = Math.max(r.start, Math.min(r.end - d.len, snapped))
        return { day, start: Math.max(0, Math.min(24 * 60 - d.len, start)) }
      }
      return { day: d.day, start: d.start }
    }

    const begin = (d: Drag) => {
      d.active = true
      document.body.classList.add('is-dragging')
      if (d.touch) navigator.vibrate?.(25)
      setGhost({ ...d })
    }

    const onMove = (e: PointerEvent) => {
      const d = drag.current
      if (!d) return
      const dist = Math.hypot(e.clientX - d.x, e.clientY - d.y)
      if (!d.active) {
        // במגע: תזוזה לפני הלחיצה הארוכה היא גלילה. בעכבר: תזוזה קטנה מתחילה גרירה
        if (d.touch) {
          if (dist > 10) end()
          return
        }
        if (dist < 5) return
        begin(d)
      }
      const at = locate(d, e.clientX, e.clientY)
      d.day = at.day
      d.start = at.start
      setGhost({ ...d })
      // גלילה אוטומטית ליד קצות המסך
      if (e.clientY < 70) window.scrollBy(0, -14)
      else if (e.clientY > window.innerHeight - 70) window.scrollBy(0, 14)
    }

    const onUp = () => {
      const d = drag.current
      if (!d) return
      if (d.active) {
        suppressClick.current = true
        window.setTimeout(() => (suppressClick.current = false), 0)
        if (d.day !== d.origDay || d.start !== d.origStart) moveRef.current?.(d.id, d.day, d.start)
      }
      end()
    }

    // בזמן גרירה במגע: לא לגלול את הדף
    const onTouchMove = (e: TouchEvent) => {
      if (drag.current?.active) e.preventDefault()
    }
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && drag.current) end()
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', end)
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', end)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('keydown', onKey)
      end()
    }
  }, [])

  const startPress = (e: ReactPointerEvent<HTMLElement>, b: Block) => {
    if (!onBlockMove || !b.draggable || (e.pointerType === 'mouse' && e.button !== 0)) return
    const col = e.currentTarget.closest('.day-col') as HTMLElement | null
    if (!col) return
    const rect = col.getBoundingClientRect()
    const pointer = range.start + ((e.clientY - rect.top) / rect.height) * (range.end - range.start)
    const d: Drag = {
      id: b.id,
      name: b.name,
      color: b.color,
      len: b.end - b.start,
      grab: Math.max(0, pointer - b.start),
      origDay: b.day,
      origStart: b.start,
      day: b.day,
      start: b.start,
      touch: e.pointerType !== 'mouse',
      x: e.clientX,
      y: e.clientY,
      active: false,
    }
    drag.current = d
    window.clearTimeout(pressTimer.current)
    if (d.touch) {
      pressTimer.current = window.setTimeout(() => {
        if (drag.current === d) {
          d.active = true
          document.body.classList.add('is-dragging')
          navigator.vibrate?.(25)
          setGhost({ ...d })
        }
      }, LONG_PRESS)
    }
  }

  const hours: number[] = []
  for (let m = range.start; m < range.end; m += 60) hours.push(m)

  const nowMin = minutesOfDay(now)
  const showNow = nowMin >= range.start && nowMin <= range.end
  const toHours = (m: Minutes) => (m - range.start) / 60

  return (
    <section className="week" aria-label="מערכת שבועית">
      <div className="week-days" role="tablist" aria-label="ימי השבוע">
        <div className="week-corner" aria-hidden="true" />
        {DAYS.map((day) => {
          const date = addDays(weekStart, day)
          const isToday = isSameDay(date, now)
          const info = dayInfo(isoDate(date))
          return (
            <button
              key={day}
              type="button"
              role="tab"
              data-day={day}
              aria-selected={day === selectedDay}
              className={`day-head${isToday ? ' is-today' : ''}${day === selectedDay ? ' is-selected' : ''}${info.holiday ? ` h-${info.holiday.kind}` : ''}`}
              onClick={() => onSelectDay(day)}
            >
              <span className="day-name">{DAY_NAMES[day]}</span>
              <span className="day-date">{date.getDate()}</span>
              <span className="day-hebrew">{info.hebrew}</span>
              {info.holiday && <span className="day-holiday">{info.holiday.name}</span>}
              {dayNotes?.[day] && <span className="day-holiday">{dayNotes[day]}</span>}
            </button>
          )
        })}
      </div>

      <div className="week-body" style={{ '--hours': hours.length } as CSSProperties}>
        <div className="ruler" aria-hidden="true">
          {hours.map((m) => (
            <span key={m} className="ruler-hour">
              {formatTime(m)}
            </span>
          ))}
        </div>

        {DAYS.map((day) => {
          const date = addDays(weekStart, day)
          const isToday = isSameDay(date, now)
          const dayBlocks = blocks
            .filter((b) => b.day === day)
            .sort((a, b) => a.start - b.start || a.lane - b.lane)

          return (
            <div
              key={day}
              className={`day-col${isToday ? ' is-today' : ''}${day === selectedDay ? ' is-selected' : ''}`}
              role="tabpanel"
              data-day={day}
              aria-label={`יום ${DAY_NAMES[day]}`}
            >
              {dayBlocks.length === 0 && <p className="day-empty">יום פנוי</p>}

              {dayBlocks.map((b) => {
                const duration = b.end - b.start
                const click = onBlockClick
                  ? {
                      role: 'button',
                      tabIndex: 0,
                      'aria-label': `עריכת ${b.name}`,
                      onClick: () => {
                        if (!suppressClick.current) onBlockClick(b.id)
                      },
                      onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onBlockClick(b.id)
                        }
                      },
                    }
                  : {}
                const canDrag = !!onBlockMove && !!b.draggable
                const dragProps = canDrag
                  ? {
                      onPointerDown: (e: ReactPointerEvent<HTMLElement>) => startPress(e, b),
                      onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
                    }
                  : {}
                const style = {
                  '--top': toHours(b.start),
                  '--span': duration / 60,
                  '--lane': b.lane,
                  '--lanes': b.lanes,
                } as CSSProperties
                return (
                  <article
                    key={b.id}
                    className={`block c-${b.color}${b.isOption ? ' is-option' : ''}${b.isOpen ? ' is-open' : ''}${duration < 60 ? ' is-short' : ''}${onBlockClick ? ' is-clickable' : ''} t-${b.type}${b.isCancelled ? ' is-cancelled' : ''}${b.isDone ? ' is-done' : ''}${canDrag ? ' is-draggable' : ''}${ghost?.active && ghost.id === b.id ? ' is-drag-source' : ''}`}
                    style={style}
                    {...click}
                    {...dragProps}
                  >
                    {b.isOption && <span className="block-tag">לבחירה</span>}
                    {b.isOpen && <span className="block-tag">לבחירתך</span>}
                    {b.isCancelled && <span className="block-tag">{b.cancelTag ?? 'בוטל השבוע'}</span>}
                    {b.type === 'event' && <span className="block-tag">{b.cancelTag ?? 'אירוע'}</span>}
                    {b.type === 'plan' && (
                      <span className="block-tag">{b.isDone ? 'בוצע ✓' : b.isMoved ? 'הוזז' : 'מתוכנן'}</span>
                    )}
                    {b.isMoved && b.type !== 'plan' && !b.isCancelled && <span className="block-tag">הוזז השבוע</span>}
                    <h3 className="block-name">{b.name}</h3>
                    <p className="block-time">
                      <bdi dir="ltr">
                        {formatTime(b.start)}–{formatTime(b.end)}
                      </bdi>
                      {b.kind && <span className="block-kind">{b.kind}</span>}
                    </p>
                    {b.room && <p className="block-meta">{b.room}</p>}
                    {b.teacher && <p className="block-meta">{b.teacher}</p>}
                  </article>
                )
              })}

              {ghost?.active && ghost.day === day && (
                <div
                  className={`block drag-ghost c-${ghost.color}${ghost.len < 60 ? ' is-short' : ''}`}
                  style={{ '--top': toHours(ghost.start), '--span': ghost.len / 60, '--lane': 0, '--lanes': 1 } as CSSProperties}
                  aria-hidden="true"
                >
                  <h3 className="block-name">{ghost.name}</h3>
                  <p className="block-time">
                    <bdi dir="ltr">
                      {formatTime(ghost.start)}–{formatTime(ghost.start + ghost.len)}
                    </bdi>
                  </p>
                </div>
              )}

              {isToday && showNow && (
                <div className="now-line" style={{ '--top': toHours(nowMin) } as CSSProperties}>
                  <span className="now-time">{formatTime(nowMin)}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
