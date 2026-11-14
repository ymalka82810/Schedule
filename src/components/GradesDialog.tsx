import { useMemo, useState } from 'react'
import type { ScheduleData } from '../types'
import { attendedSubjects } from '../lib/suggest'
import { gradeText, knownTopics, needFactor, priorities, removeGrade, saveGrade, setWeeklySelf, weakTopics } from '../lib/priority'
import { ProgressChart } from './ProgressChart'
import type { ColorKey } from '../types'
import { sameSubject } from '../lib/pdf/parseCell'
import { addDays, dateOfDay, formatWeekRange, startOfWeek } from '../lib/time'
import { useEscape } from './useEscape'

interface Props {
  data: ScheduleData
  /** YYYY-MM-DD */
  today: string
  /** לפתוח על השבוע הזה בהערכה העצמית (מהתזכורת) */
  initialWeek?: Date
  onSave: (data: ScheduleData) => void
  onClose: () => void
}

const SELF = [1, 2, 3, 4, 5]
const SELF_NAMES = ['', 'לא מבין', 'מתקשה', 'בסדר', 'טוב', 'שולט']
const dm = (iso: string) => `${Number(iso.slice(8))}.${Number(iso.slice(5, 7))}`
const toDate = (iso: string) => new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8))

/**
 * ציונים והערכה עצמית, גם לשבועות שעברו. מהם המערכת קובעת עדיפות בין המקצועות:
 * כמה תרגול אוטומטי, ומה נכנס קודם לחלונות התרגול החופשי
 */
export function GradesDialog({ data, today, initialWeek, onSave, onClose }: Props) {
  useEscape(onClose)
  const [draft, setDraft] = useState(data)
  const subjects = useMemo(() => attendedSubjects(draft), [draft])
  const prio = useMemo(() => priorities(draft, today), [draft, today])
  // הערכה עצמית: ברירת המחדל היא השבוע של היום (במוצאי שבת, השבוע שנגמר עכשיו)
  const [week, setWeek] = useState(() => initialWeek ?? startOfWeek(toDate(today)))
  const weekDates = [0, 1, 2, 3, 4, 5, 6].map((d) => dateOfDay(week, d))
  const isFuture = weekDates[0] > today
  const selfOf = (subject: string) =>
    (draft.grades ?? []).find((g) => g.kind === 'self' && sameSubject(g.subject, subject) && weekDates.includes(g.date))

  const [subject, setSubject] = useState(subjects[0] ?? '')
  const [date, setDate] = useState(today)
  const [score, setScore] = useState('')
  const [note, setNote] = useState('')
  const [topic, setTopic] = useState('')
  const [error, setError] = useState<string | null>(null)
  const addExam = () => {
    const n = Number(score)
    if (!subject) return setError('צריך לבחור מקצוע.')
    if (score.trim() === '' || !Number.isFinite(n) || n < 0 || n > 100) return setError('הציון צריך להיות בין 0 ל-100.')
    if (date > today) return setError('אי אפשר להזין ציון לתאריך שעוד לא הגיע.')
    setDraft((d) =>
      saveGrade(d, { subject, date, kind: 'exam', score: n, topic: topic.trim() || undefined, note: note.trim() || undefined }),
    )
    setScore('')
    setNote('')
    setTopic('')
    setError(null)
  }
  // גרף לכל מקצוע שיש לו ציונים, בצבע של המקצוע בלוח
  const charts = subjects
    .map((sub) => ({
      subject: sub,
      color: (draft.lessons.find((l) => sameSubject(l.name, sub))?.color ?? 'slate') as ColorKey,
      grades: (draft.grades ?? []).filter((g) => sameSubject(g.subject, sub)),
    }))
    .filter((c) => c.grades.length > 0)
  const exams = (draft.grades ?? []).filter((g) => g.kind === 'exam').sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="grades-title">
        <header className="dialog-head">
          <h2 id="grades-title">ציונים ועדיפות</h2>
          <button type="button" className="btn btn-icon" aria-label="סגירה" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="dialog-body goals">
          <p className="muted">
            מהציונים האחרונים המערכת קובעת במה כדאי להתמקד: מקצוע חלש או יורד מקבל יותר תרגול ונכנס ראשון לחלונות התרגול
            החופשי. ציון חדש שוקל יותר מישן, ומבחן שוקל יותר מהערכה עצמית.
          </p>

          <fieldset className="whoami-set">
            <legend>במה כדאי להתמקד עכשיו</legend>
            {prio.length === 0 ? (
              <p className="muted">עוד אין ציונים. בלי ציונים כל המקצועות שווים, והתרגול לפי זמן השיעורים.</p>
            ) : (
              <ol className="prio-list">
                {prio.map((p, i) => {
                  const f = needFactor(p)
                  const pct = Math.round((f - 1) * 100)
                  return (
                    <li key={p.subject}>
                      <strong>{p.subject}</strong>{' '}
                      <span className={p.need >= 0.5 ? 'prio-tag is-high' : 'prio-tag'}>
                        {p.need >= 0.6 ? 'צריך עבודה' : p.need >= 0.35 ? 'בינוני' : 'שולט'}
                      </span>
                      <div className="muted">
                        {p.reason}.{' '}
                        {pct === 0 ? 'תרגול רגיל' : `התרגול האוטומטי ${pct > 0 ? 'גדל' : 'קטן'} ב-${Math.abs(pct)}%`}
                        {i === 0 && p.need >= 0.4 ? ', ראשון בחלונות התרגול החופשי' : ''}
                      </div>
                      {weakTopics(draft, p.subject, today).length > 0 && (
                        <div className="muted">
                          נושאים לחזק: {weakTopics(draft, p.subject, today).map((t) => t.topic).join(', ')}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ol>
            )}
          </fieldset>

          {charts.length > 0 && (
            <fieldset className="whoami-set">
              <legend>התקדמות</legend>
              <div className="pc-key muted" aria-hidden="true">
                <span>
                  <svg width="12" height="12">
                    <circle cx="6" cy="6" r="4.5" style={{ fill: 'var(--muted)' }} />
                  </svg>{' '}
                  מבחן או בוחן
                </span>
                <span>
                  <svg width="12" height="12">
                    <circle cx="6" cy="6" r="4" style={{ fill: 'none', stroke: 'var(--muted)', strokeWidth: 2 }} />
                  </svg>{' '}
                  הערכה עצמית (1 = 0, 5 = 100)
                </span>
              </div>
              <div className="progress-charts">
                {charts.map((c) => (
                  <ProgressChart key={c.subject} subject={c.subject} color={c.color} grades={c.grades} today={today} />
                ))}
              </div>
            </fieldset>
          )}

          <fieldset className="whoami-set">
            <legend>הערכה עצמית לשבוע</legend>
            <div className="week-nav">
              <button type="button" className="btn btn-icon" aria-label="השבוע הקודם" onClick={() => setWeek((w) => addDays(w, -7))}>
                ›
              </button>
              <span>{formatWeekRange(week)}</span>
              <button
                type="button"
                className="btn btn-icon"
                aria-label="השבוע הבא"
                disabled={addDays(week, 7) > toDate(today)}
                onClick={() => setWeek((w) => addDays(w, 7))}
              >
                ‹
              </button>
            </div>
            {isFuture ? (
              <p className="muted">השבוע הזה עוד לא התחיל.</p>
            ) : (
              <>
                <p className="muted">כמה אתה שולט בחומר של השבוע, מ-1 (לא מבין) עד 5 (שולט). לחיצה שנייה מוחקת.</p>
                {subjects.map((sub) => {
                  const cur = selfOf(sub)?.score
                  return (
                    <div key={sub} className="self-row">
                      <span>{sub}</span>
                      <div className="self-scores" role="group" aria-label={`הערכה עצמית ב${sub}`}>
                        {SELF.map((n) => (
                          <button
                            key={n}
                            type="button"
                            className={cur === n ? 'btn is-on' : 'btn'}
                            aria-pressed={cur === n}
                            title={SELF_NAMES[n]}
                            onClick={() => setDraft((d) => setWeeklySelf(d, sub, weekDates, cur === n ? null : n))}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </>
            )}
          </fieldset>

          <fieldset className="whoami-set">
            <legend>ציון במבחן או בוחן</legend>
            <div className="edit-row">
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
              <label className="field">
                <span>תאריך</span>
                <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
              </label>
              <label className="field">
                <span>ציון</span>
                <input type="number" min={0} max={100} inputMode="numeric" value={score} onChange={(e) => setScore(e.target.value)} />
              </label>
            </div>
            <label className="field">
              <span>נושא (לא חובה), למשל "וקטורים". מנושא חלש המערכת תמליץ במה להתמקד בתרגול</span>
              <input type="text" list="grade-topics" value={topic} onChange={(e) => setTopic(e.target.value)} />
              <datalist id="grade-topics">
                {knownTopics(draft, subject).map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </label>
            <label className="field">
              <span>הערה (לא חובה)</span>
              <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            {error && <p className="import-error">{error}</p>}
            <button type="button" className="btn" onClick={addExam}>
              ＋ הוספת ציון
            </button>
            {exams.length > 0 && (
              <ul className="pref-list">
                {exams.map((g) => (
                  <li key={g.id}>
                    <span>
                      {g.subject}{g.topic ? ` · ${g.topic}` : ''}: {gradeText(g)}{' '}
                      <span className="muted">({dm(g.date)}{g.note ? `, ${g.note}` : ''})</span>
                    </span>
                    <button type="button" className="link-btn" onClick={() => setDraft((d) => removeGrade(d, g.id))}>
                      מחיקה
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
        </div>

        <footer className="dialog-foot">
          <div className="import-actions">
            <button type="button" className="btn btn-primary" onClick={() => onSave(draft)}>
              שמירה
            </button>
            <button type="button" className="btn" onClick={onClose}>
              ביטול
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
