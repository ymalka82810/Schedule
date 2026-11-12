import { useState, type FormEvent } from 'react'
import type { OneOffEvent, ScheduleData } from '../types'
import type { PlannedSession } from '../lib/plan'
import type { Goal } from '../types'
import { removeEvent, saveEvent, slotProblem } from '../lib/edit'
import { DAY_NAMES, formatTime, fromTimeInput, toTimeInput } from '../lib/time'
import { useEscape } from './useEscape'

interface EventProps {
  data: ScheduleData
  /** קיים לעריכה, או תאריך התחלתי לאירוע חדש */
  event: OneOffEvent | { date: string }
  onSave: (data: ScheduleData) => void
  onClose: () => void
}

/** אירוע חד-פעמי: חתונה, בר מצווה, תור. תופס זמן רק בתאריך שלו */
export function EventDialog({ data, event, onSave, onClose }: EventProps) {
  useEscape(onClose)
  const existing = 'id' in event ? event : null
  const [title, setTitle] = useState(existing?.title ?? '')
  const [date, setDate] = useState(event.date)
  const [start, setStart] = useState(existing?.start ?? 19 * 60)
  const [end, setEnd] = useState(existing?.end ?? 22 * 60)
  const [error, setError] = useState<string | null>(null)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return setError('צריך שם לאירוע.')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError('צריך תאריך.')
    const problem = slotProblem({ day: 0, start, end })
    if (problem) return setError(problem)
    onSave(saveEvent(data, { id: existing?.id, title, date, start, end }))
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog dialog-compact" role="dialog" aria-modal="true" aria-labelledby="event-title">
        <header className="dialog-head">
          <h2 id="event-title">{existing ? 'עריכת אירוע' : 'אירוע חד-פעמי'}</h2>
          <button type="button" className="btn btn-icon" aria-label="סגירה" onClick={onClose}>
            ×
          </button>
        </header>
        <form className="dialog-body lesson-form" onSubmit={submit}>
          <p className="muted">האירוע תופס זמן רק בתאריך שלו. התכנון של השבוע יסתדר סביבו.</p>
          <label className="field">
            <span>מה</span>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </label>
          <div className="edit-row">
            <label className="field">
              <span>תאריך</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="field">
              <span>התחלה</span>
              <input
                type="time"
                value={toTimeInput(start)}
                onChange={(e) => {
                  const m = fromTimeInput(e.target.value)
                  if (m !== null) setStart(m)
                }}
              />
            </label>
            <label className="field">
              <span>סיום</span>
              <input
                type="time"
                value={toTimeInput(end)}
                aria-invalid={end <= start}
                onChange={(e) => {
                  const m = fromTimeInput(e.target.value)
                  if (m !== null) setEnd(m)
                }}
              />
            </label>
          </div>
          {error && (
            <p className="import-error" role="alert">
              {error}
            </p>
          )}
          <div className="import-actions">
            <button type="submit" className="btn btn-primary">
              {existing ? 'שמירה' : 'הוספה'}
            </button>
            <button type="button" className="btn" onClick={onClose}>
              ביטול
            </button>
            {existing && (
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => window.confirm('למחוק את האירוע?') && onSave(removeEvent(data, existing.id))}
              >
                מחיקה
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

interface SessionProps {
  session: PlannedSession
  goal: Goal
  onEditGoals: () => void
  onClose: () => void
}

/** מפגש שתוכנן אוטומטית: מתי ולמה דווקא שם */
export function SessionDialog({ session, goal, onEditGoals, onClose }: SessionProps) {
  useEscape(onClose)
  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog dialog-compact" role="dialog" aria-modal="true" aria-labelledby="session-title">
        <header className="dialog-head">
          <h2 id="session-title">{goal.name}</h2>
          <button type="button" className="btn btn-icon" aria-label="סגירה" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="dialog-body lesson-form">
          <p>
            יום {DAY_NAMES[session.day]},{' '}
            <bdi dir="ltr">
              {formatTime(session.start)}–{formatTime(session.end)}
            </bdi>
          </p>
          <div>
            <p className="muted">למה כאן:</p>
            <ul className="whoami-conflicts">
              {session.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
          <p className="muted">
            המפגשים מתוכננים מחדש בכל שבוע לפי הזמן הפנוי. כדי לשנות כמה, כמה זמן או מתי, ערוך את היעד.
          </p>
          <div className="import-actions">
            <button type="button" className="btn btn-primary" onClick={onEditGoals}>
              עריכת היעדים
            </button>
            <button type="button" className="btn" onClick={onClose}>
              סגירה
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
