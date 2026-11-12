import type { DayIndex, Minutes } from '../types'
import { DAY_NAMES, formatTime } from '../lib/time'
import { useEscape } from './useEscape'

interface Place {
  day: DayIndex
  start: Minutes
  end: Minutes
}

interface Props {
  name: string
  /** המקום הקבוע במערכת */
  from: Place
  to: Place
  /** השיבוץ כבר הוזז השבוע (גרירה שנייה) */
  alreadyMoved: boolean
  /** כמה שיבוצים של אותו שיעור או פעילות באותן שעות בימים אחרים (כולל זה). רלוונטי רק כשהיום לא השתנה */
  siblings: number
  onOnce: () => void
  onForever: () => void
  onAllDays: () => void
  onClose: () => void
}

const when = (p: Place) => (
  <>
    יום {DAY_NAMES[p.day]},{' '}
    <bdi dir="ltr">
      {formatTime(p.start)}–{formatTime(p.end)}
    </bdi>
  </>
)

/** אחרי גרירה של שיבוץ קבוע: להזיז רק בשבוע הזה, או לשנות את המערכת לכל השבועות */
export function MoveDialog({ name, from, to, alreadyMoved, siblings, onOnce, onForever, onAllDays, onClose }: Props) {
  useEscape(onClose)
  const onlyLength = from.day === to.day && from.start === to.start
  const multi = siblings > 1 && from.day === to.day
  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog dialog-compact" role="dialog" aria-modal="true" aria-labelledby="move-title">
        <header className="dialog-head">
          <h2 id="move-title">
            {onlyLength ? 'שינוי האורך של' : 'הזזת'} {name}
          </h2>
          <button type="button" className="btn btn-icon" aria-label="סגירה" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="dialog-body lesson-form">
          <p>
            מ{when(from)}
            <br />
            ל{when(to)}
          </p>
          {alreadyMoved && <p className="muted">השיבוץ כבר הוזז השבוע. ההזזה החדשה תחליף את הקודמת.</p>}
          <p className="muted">
            בשבוע הזה בלבד: המקום הקבוע נשאר, ושבוע הבא הכול חוזר. בכל השבועות: המערכת עצמה משתנה, וייבוא של גרסה חדשה
            מהמוסד יציג את זה כשינוי שאפשר לוותר עליו.
          </p>
          <div className="import-actions">
            <button type="button" className="btn btn-primary" onClick={onOnce}>
              רק בשבוע הזה
            </button>
            <button type="button" className="btn" onClick={onForever}>
              {multi ? `בכל השבועות, רק ביום ${DAY_NAMES[from.day]}` : 'בכל השבועות'}
            </button>
            {multi && (
              <button type="button" className="btn" onClick={onAllDays}>
                בכל השבועות, בכל {siblings} הימים
              </button>
            )}
            <button type="button" className="btn" onClick={onClose}>
              ביטול
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
