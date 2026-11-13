import { useState, type FormEvent } from 'react'
import type { OneOffEvent, ScheduleData } from '../types'
import type { PlannedSession } from '../lib/plan'
import type { Goal, Rating } from '../types'
import { removeBreak, removeEvent, saveBreak, saveEvent, slotProblem } from '../lib/edit'
import {
  INTERVALS,
  KINDS,
  REVIEW_TIP,
  blocksOf,
  intervalText,
  lastStuck,
  logReview,
  logSession,
  nextReview,
  unlogSession,
} from '../lib/learning'
import { subjectNames } from '../lib/plan'
import { DAY_NAMES, formatTime, fromTimeInput, toTimeInput } from '../lib/time'
import { useEscape } from './useEscape'
import { skipPlanned, unpinPlanned } from '../lib/prefs'

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

const RATINGS: { value: Rating; label: string }[] = [
  { value: 'easy', label: 'קל מדי' },
  { value: 'ok', label: 'מתאים' },
  { value: 'hard', label: 'קשה מדי' },
]

const RATING_LABEL: Record<Rating, string> = { easy: 'קל מדי', ok: 'מתאים', hard: 'קשה מדי' }

/** מפגש שתוכנן אוטומטית: מתי ולמה דווקא שם, איך לעבוד בו, ותיעוד של דקה בסיום */
export function SessionDialog({ data, session, goal, date, onSave, onEditGoals, onClose }: SessionProps) {
  useEscape(onClose)
  const [rating, setRating] = useState<Rating | undefined>()
  const [topic, setTopic] = useState('')
  const [stuck, setStuck] = useState('')
  const [minutes, setMinutes] = useState(session.end - session.start)
  const review = session.reviewId ? (data.reviews ?? []).find((r) => r.id === session.reviewId) : undefined
  const logged = session.logId ? (data.log ?? []).find((l) => l.id === session.logId) : undefined
  const isReview = !!session.reviewId
  const len = session.end - session.start
  const blocks = isReview ? null : blocksOf(goal.kind, len)
  const tip = isReview ? REVIEW_TIP : goal.kind ? KINDS[goal.kind].tip : null
  const prevStuck = !isReview && !session.done ? lastStuck(data, goal.id, date, session.start) : null

  const save = () => {
    if (review) onSave(logReview(data, review, session, date, { rating: rating ?? 'ok', stuck }))
    else onSave(logSession(data, session, date, { rating, topic, stuck, minutes }))
  }

  /** מה יקרה עם החזרה הבאה, לפי הדירוג שנבחר */
  const nextNote = (() => {
    if (review) {
      const next = nextReview(review, rating ?? 'ok', date)
      return next ? `החזרה הבאה: ${intervalText(INTERVALS[next.step])}.` : 'זו החזרה האחרונה על הנושא. הוא אמור להישאר בזיכרון לאורך זמן.'
    }
    if (goal.kind === 'knowledge' && topic.trim()) {
      return `ייווצרו חזרות קצרות על הנושא: ${rating === 'easy' ? 'אחרי שלושה ימים' : 'מחר'}, ואחר כך במרווחים שהולכים וגדלים.`
    }
    return null
  })()

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog dialog-compact" role="dialog" aria-modal="true" aria-labelledby="session-title">
        <header className="dialog-head">
          <h2 id="session-title">{session.title ?? goal.name}</h2>
          <button type="button" className="btn btn-icon" aria-label="סגירה" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="dialog-body lesson-form">
          <p>
            {isReview ? `${goal.name}, ` : ''}יום {DAY_NAMES[session.day]},{' '}
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
          {prevStuck && (
            <div className="session-tip">
              <p className="muted">
                בפעם הקודמת ({Number(prevStuck.date.slice(8))}.{Number(prevStuck.date.slice(5, 7))}) נתקעת ב:
              </p>
              <p>{prevStuck.stuck}</p>
              <p className="muted">כדאי להתחיל משם: חולשה אחת מוגדרת היא המטרה הכי טובה למפגש.</p>
            </div>
          )}
          {(tip || blocks) && !session.done && (
            <div className="session-tip">
              <p className="muted">איך לעבוד:</p>
              {blocks && (
                <p>
                  {blocks.count} בלוקים של כ-{blocks.each} דקות, עם {blocks.rest} דקות הפסקה ביניהם.
                </p>
              )}
              {tip && <p>{tip}</p>}
            </div>
          )}

          {session.done ? (
            <>
              <p className="muted">
                {isReview ? 'סימנת שחזרת.' : 'סימנת שתרגלת. המפגש נשאר במקומו, ושאר השבוע מתוכנן סביבו.'}
              </p>
              {logged && (logged.rating || logged.topic || logged.stuck || logged.planned) && (
                <ul className="whoami-conflicts">
                  {logged.rating && <li>הרגיש: {RATING_LABEL[logged.rating]}</li>}
                  {logged.planned && (
                    <li>
                      תרגלת {logged.end - logged.start} דקות (תוכננו {logged.planned})
                    </li>
                  )}
                  {logged.topic && !isReview && <li>נושא: {logged.topic}</li>}
                  {logged.stuck && <li>נתקעתי ב: {logged.stuck}</li>}
                </ul>
              )}
            </>
          ) : (
            <fieldset className="session-log">
              <legend>{isReview ? 'אחרי החזרה' : 'אחרי המפגש (דקה, לא חובה)'}</legend>
              <p className="muted">איך היה?</p>
              <div className="whoami-chips">
                {RATINGS.map((r) => (
                  <label key={r.value} className="chip">
                    <input
                      type="radio"
                      name="rating"
                      checked={rating === r.value}
                      onChange={() => setRating(r.value)}
                    />
                    <span>{r.label}</span>
                  </label>
                ))}
              </div>
              {!isReview && (
                <label className="field">
                  <span>{goal.kind === 'knowledge' ? 'מה למדתי (נושא חדש יקבל חזרות מרווחות)' : 'מה עשיתי'}</span>
                  <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)} />
                </label>
              )}
              {!isReview && (
                <label className="field goal-narrow">
                  <span>כמה דקות תרגלתי בפועל</span>
                  <input
                    type="number"
                    min={5}
                    max={300}
                    step={5}
                    value={minutes}
                    onChange={(e) => setMinutes(Math.max(5, Number(e.target.value) || 5))}
                  />
                </label>
              )}
              <label className="field">
                <span>איפה נתקעתי</span>
                <input type="text" value={stuck} onChange={(e) => setStuck(e.target.value)} />
              </label>
              {nextNote && <p className="whoami-auto">{nextNote}</p>}
            </fieldset>
          )}

          {session.missed && (
            <p className="whoami-auto">הזמן של המפגש עבר ולא סומן. אם תרגלת בכל זאת, סמן כאן; אחרת התכנון כבר השלים אותו בהמשך השבוע.</p>
          )}
          {!session.done && !isReview && !session.missed && (
            <p className="muted">המפגשים מתוכננים מחדש בכל שבוע לפי הזמן הפנוי. אחרי שתרגלת, סמן, והמפגש יישאר במקומו.</p>
          )}
          {!session.done && !session.missed && (
            <p className="muted">
              אפשר לגרור את המפגש בלוח לשעה אחרת (בטלפון: לחיצה ארוכה). כשאותה הזזה חוזרת פעמיים, התכנון לומד את ההעדפה.
            </p>
          )}
          <div className="import-actions">
            {session.done ? (
              session.logId && (
                <button type="button" className="btn" onClick={() => onSave(unlogSession(data, session.logId!))}>
                  ביטול הסימון
                </button>
              )
            ) : (
              <button type="button" className="btn btn-primary" onClick={save} disabled={isReview && !review}>
                {isReview ? 'חזרתי ✓' : 'תרגלתי ✓'}
              </button>
            )}
            {!session.done && !session.missed && (
              <button
                type="button"
                className="btn"
                title="המפגש יקבל מקום אחר, ונרשם שהשעה הזו לא התאימה"
                onClick={() => onSave(skipPlanned(data, session, date))}
              >
                לא מתאים לי כאן
              </button>
            )}
            {session.pinId && !session.done && (
              <button type="button" className="btn" onClick={() => onSave(unpinPlanned(data, session.pinId!))}>
                החזרה לתכנון האוטומטי
              </button>
            )}
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
