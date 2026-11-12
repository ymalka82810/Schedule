import { useState, type FormEvent } from 'react'
import type { OneOffEvent, ScheduleData } from '../types'
import type { PlannedSession } from '../lib/plan'
import type { Goal } from '../types'
import { removeBreak, removeEvent, saveBreak, saveEvent, slotProblem, toggleDone } from '../lib/edit'
import { subjectNames } from '../lib/plan'
import { DAY_NAMES, formatTime, fromTimeInput, toTimeInput } from '../lib/time'
import { useEscape } from './useEscape'

interface EventProps {
  data: ScheduleData
  /** קיים לעריכה, או תאריך התחלתי לחדש */
  event: OneOffEvent | { date: string }
  onSave: (data: ScheduleData) => void
  onClose: () => void
}

type Kind = 'event' | 'exam' | 'break'

/**
 * תאריך מיוחד: אירוע חד-פעמי (חתונה, תור), מבחן במקצוע (מגביר את התרגול לפניו),
 * או חופשה של כמה ימים (אין שיעורים).
 */
export function EventDialog({ data, event, onSave, onClose }: EventProps) {
  useEscape(onClose)
  const existing = 'id' in event ? event : null
  const subjects = subjectNames(data.lessons)
  const [kind, setKind] = useState<Kind>(existing?.examSubject ? 'exam' : 'event')
  const [title, setTitle] = useState(existing?.title ?? '')
  const [subject, setSubject] = useState(existing?.examSubject ?? subjects[0] ?? '')
  const [date, setDate] = useState(event.date)
  const [to, setTo] = useState(event.date)
  const [start, setStart] = useState(existing?.start ?? (kind === 'exam' ? 9 * 60 : 19 * 60))
  const [end, setEnd] = useState(existing?.end ?? (kind === 'exam' ? 12 * 60 : 22 * 60))
  const [error, setError] = useState<string | null>(null)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError('צריך תאריך.')
    if (kind === 'break') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(to) || to < date) return setError('תאריך הסיום צריך להיות אחרי ההתחלה.')
      return onSave(saveBreak(data, { title: title.trim() || 'חופשה', from: date, to }))
    }
    if (kind === 'event' && !title.trim()) return setError('צריך שם לאירוע.')
    if (kind === 'exam' && !subject) return setError('צריך לבחור מקצוע.')
    const problem = slotProblem({ day: 0, start, end })
    if (problem) return setError(problem)
    onSave(
      saveEvent(data, {
        id: existing?.id,
        title: kind === 'exam' ? title.trim() || `מבחן ב${subject}` : title,
        date,
        start,
        end,
        examSubject: kind === 'exam' ? subject : undefined,
      }),
    )
  }

  const timeInput = (value: number, set: (m: number) => void, invalid?: boolean) => (
    <input
      type="time"
      value={toTimeInput(value)}
      aria-invalid={invalid}
      onChange={(e) => {
        const m = fromTimeInput(e.target.value)
        if (m !== null) set(m)
      }}
    />
  )

  const fmt = (d: string) => d.split('-').reverse().map(Number).join('.')

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog dialog-compact" role="dialog" aria-modal="true" aria-labelledby="event-title">
        <header className="dialog-head">
          <h2 id="event-title">{existing ? 'עריכה' : 'תאריך מיוחד'}</h2>
          <button type="button" className="btn btn-icon" aria-label="סגירה" onClick={onClose}>
            ×
          </button>
        </header>
        <form className="dialog-body lesson-form" onSubmit={submit}>
          {!existing && (
            <div className="whoami-chips" role="radiogroup" aria-label="סוג">
              {(
                [
                  ['event', 'אירוע'],
                  ['exam', 'מבחן'],
                  ['break', 'חופשה'],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="chip">
                  <input type="radio" name="kind" checked={kind === k} onChange={() => setKind(k)} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          )}

          <p className="muted">
            {kind === 'event' && 'תופס זמן רק בתאריך שלו. התכנון של השבוע יסתדר סביבו.'}
            {kind === 'exam' &&
              'בשבועיים שלפני המבחן התרגול במקצוע גדל פי 1.5, ומפגשים נקבעים קרוב למבחן. צריך יעד תרגול שקשור למקצוע.'}
            {kind === 'break' && 'אין שיעורים בין התאריכים. התכנון של היעדים ממשיך, עם יותר זמן פנוי.'}
          </p>

          {kind === 'exam' && (
            <label className="field">
              <span>מקצוע</span>
              <select value={subject} onChange={(e) => setSubject(e.target.value)}>
                {subjects.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="field">
            <span>{kind === 'exam' ? 'שם (לא חובה)' : kind === 'break' ? 'שם החופשה' : 'מה'}</span>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus={kind === 'event'} />
          </label>

          <div className="edit-row">
            <label className="field">
              <span>{kind === 'break' ? 'מתאריך' : 'תאריך'}</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            {kind === 'break' ? (
              <label className="field">
                <span>עד תאריך</span>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </label>
            ) : (
              <>
                <label className="field">
                  <span>התחלה</span>
                  {timeInput(start, setStart)}
                </label>
                <label className="field">
                  <span>סיום</span>
                  {timeInput(end, setEnd, end <= start)}
                </label>
              </>
            )}
          </div>

          {kind === 'break' && (data.breaks ?? []).length > 0 && (
            <div>
              <p className="muted">חופשות שכבר הוגדרו:</p>
              <ul className="changes-list">
                {(data.breaks ?? []).map((b) => (
                  <li key={b.id} className="change">
                    <span>
                      {b.title}, <bdi dir="ltr">{fmt(b.from)}–{fmt(b.to)}</bdi>
                    </span>
                    <button type="button" className="link-btn" onClick={() => onSave(removeBreak(data, b.id))}>
                      מחיקה
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

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
                onClick={() => window.confirm('למחוק?') && onSave(removeEvent(data, existing.id))}
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
  data: ScheduleData
  session: PlannedSession
  goal: Goal
  /** התאריך של המפגש */
  date: string
  onSave: (data: ScheduleData) => void
  onEditGoals: () => void
  onClose: () => void
}

/** מפגש שתוכנן אוטומטית: מתי ולמה דווקא שם */
export function SessionDialog({ data, session, goal, date, onSave, onEditGoals, onClose }: SessionProps) {
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
            {session.done
              ? 'סימנת שתרגלת. המפגש נשאר במקומו, ושאר השבוע מתוכנן סביבו.'
              : 'המפגשים מתוכננים מחדש בכל שבוע לפי הזמן הפנוי. אחרי שתרגלת, סמן, והמפגש יישאר במקומו.'}
          </p>
          <div className="import-actions">
            <button type="button" className="btn btn-primary" onClick={() => onSave(toggleDone(data, session, date))}>
              {session.done ? 'ביטול הסימון' : 'תרגלתי ✓'}
            </button>
            <button type="button" className="btn" onClick={onEditGoals}>
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
