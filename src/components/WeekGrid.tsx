import type { CSSProperties } from 'react'
import type { DayIndex, Minutes } from '../types'
import type { Block } from '../lib/layout'
import { DAYS, DAY_NAMES, addDays, formatTime, isSameDay, minutesOfDay } from '../lib/time'

interface Props {
  weekStart: Date
  blocks: Block[]
  range: { start: Minutes; end: Minutes }
  now: Date
  selectedDay: DayIndex
  onSelectDay: (day: DayIndex) => void
}

export function WeekGrid({ weekStart, blocks, range, now, selectedDay, onSelectDay }: Props) {
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
          return (
            <button
              key={day}
              type="button"
              role="tab"
              aria-selected={day === selectedDay}
              className={`day-head${isToday ? ' is-today' : ''}${day === selectedDay ? ' is-selected' : ''}`}
              onClick={() => onSelectDay(day)}
            >
              <span className="day-name">{DAY_NAMES[day]}</span>
              <span className="day-date">{date.getDate()}</span>
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
                const style = {
                  '--top': toHours(b.start),
                  '--span': duration / 60,
                  '--lane': b.lane,
                  '--lanes': b.lanes,
                } as CSSProperties
                return (
                  <article
                    key={b.id}
                    className={`block c-${b.color}${b.isOption ? ' is-option' : ''}${b.isOpen ? ' is-open' : ''}${duration < 60 ? ' is-short' : ''}`}
                    style={style}
                  >
                    {b.isOption && <span className="block-tag">לבחירה</span>}
                    {b.isOpen && <span className="block-tag">לבחירתך</span>}
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
