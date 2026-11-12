import type { CSSProperties, KeyboardEvent } from 'react'
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
}

export function WeekGrid({ weekStart, blocks, range, now, selectedDay, onSelectDay, onBlockClick, dayNotes }: Props) {
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
                      onClick: () => onBlockClick(b.id),
                      onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onBlockClick(b.id)
                        }
                      },
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
                    className={`block c-${b.color}${b.isOption ? ' is-option' : ''}${b.isOpen ? ' is-open' : ''}${duration < 60 ? ' is-short' : ''}${onBlockClick ? ' is-clickable' : ''} t-${b.type}${b.isCancelled ? ' is-cancelled' : ''}${b.isDone ? ' is-done' : ''}`}
                    style={style}
                    {...click}
                  >
                    {b.isOption && <span className="block-tag">לבחירה</span>}
                    {b.isOpen && <span className="block-tag">לבחירתך</span>}
                    {b.isCancelled && <span className="block-tag">{b.cancelTag ?? 'בוטל השבוע'}</span>}
                    {b.type === 'event' && <span className="block-tag">{b.cancelTag ?? 'אירוע'}</span>}
                    {b.type === 'plan' && <span className="block-tag">{b.isDone ? 'בוצע ✓' : 'מתוכנן'}</span>}
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
