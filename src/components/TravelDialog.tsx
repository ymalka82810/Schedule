import type { DayIndex, Minutes } from '../types'
import { DAY_NAMES, formatTime } from '../lib/time'
import { useEscape } from './useEscape'

interface Range {
  start: Minutes
  end: Minutes
}

interface Props {
  day: DayIndex
  side: 'before' | 'after'
  from: Range
  to: Range
  /** כבר יש מקום קבוע לנסיעה הזו */
  hasRule: boolean
  onOnce: () => void
  onForever: () => void
  onClose: () => void
}

const span = (r: Range) => (
  <bdi dir="ltr">
    {formatTime(r.start)}–{formatTime(r.end)}
  </bdi>
)

/** אחרי גרירה של נסיעה: להזיז רק את היום הזה, או לקבוע מקום קבוע לכל השבועות באותו יום */
export function TravelDialog({ day, side, from, to, hasRule, onOnce, onForever, onClose }: Props) {
  useEscape(onClose)
  const where = side === 'before' ? 'לפני השיעור הראשון' : 'אחרי השיעור האחרון'
  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog dialog-compact" role="dialog" aria-modal="true" aria-labelledby="travel-title">
        <header className="dialog-head">
          <h2 id="travel-title">הזזת הנסיעה {where}</h2>
          <button type="button" className="btn btn-icon" aria-label="סגירה" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="dialog-body lesson-form">
          <p>
            מ{span(from)}
            <br />ל{span(to)}
          </p>
          <p className="muted">
            ביום הזה בלבד: רק התאריך הזה משתנה. בכל יום {DAY_NAMES[day]}: הנסיעה נשארת באותו מרחק מהשיעור, גם אם שעות השיעורים
            ישתנו.{hasRule ? ' זה יחליף את המקום הקבוע הקודם.' : ''}
          </p>
          <div className="import-actions">
            <button type="button" className="btn btn-primary" onClick={onOnce}>
              ביום הזה בלבד
            </button>
            <button type="button" className="btn" onClick={onForever}>
              בכל יום {DAY_NAMES[day]}
            </button>
            <button type="button" className="btn" onClick={onClose}>
              ביטול
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
