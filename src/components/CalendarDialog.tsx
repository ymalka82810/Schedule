import { useState, type FormEvent } from 'react'
import type { Break, ScheduleData, SemesterKey } from '../types'
import { SEMESTERS, SEMESTER_NAMES, lessonsOfSemester, semesterProblems, setSemesterDates } from '../lib/semester'
import { newId } from '../lib/edit'
import { useEscape } from './useEscape'

interface Props {
  data: ScheduleData
  onSave: (data: ScheduleData) => void
  onClose: () => void
}

const ISO = /^\d{4}-\d{2}-\d{2}$/

/**
 * לוח השנה במקום אחד: תאריכי הסמסטרים (חלים על כל השיעורים של אותו סמסטר) וחופשות המוסד.
 * החגים מחושבים לבד מהלוח העברי, ולא צריך להזין אותם
 */
export function CalendarDialog({ data, onSave, onClose }: Props) {
  useEscape(onClose)
  const [sem, setSem] = useState<Record<SemesterKey, { from: string; to: string }>>(
    () =>
      Object.fromEntries(
        SEMESTERS.map((k) => [k, { from: data.semesters?.[k]?.from ?? '', to: data.semesters?.[k]?.to ?? '' }]),
      ) as Record<SemesterKey, { from: string; to: string }>,
  )
  const [breaks, setBreaks] = useState<Break[]>(() => [...(data.breaks ?? [])].sort((a, b) => a.from.localeCompare(b.from)))
  const [error, setError] = useState<string | null>(null)

  const semesters = Object.fromEntries(
    SEMESTERS.filter((k) => sem[k].from || sem[k].to).map((k) => [k, { from: sem[k].from || undefined, to: sem[k].to || undefined }]),
  ) as ScheduleData['semesters']
  const problems = semesterProblems(semesters)

  const setBreak = (id: string, patch: Partial<Break>) => setBreaks((list) => list.map((b) => (b.id === id ? { ...b, ...patch } : b)))
  const addBreak = () =>
    setBreaks((list) => {
      const last = list[list.length - 1]
      const from = last?.to ?? ''
      return [...list, { id: newId('br', list.map((b) => b.id)), title: '', from, to: from }]
    })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (problems.length) return setError(problems[0])
    for (const b of breaks) {
      if (!ISO.test(b.from) || !ISO.test(b.to)) return setError(`לחופשה "${b.title || 'בלי שם'}" חסר תאריך.`)
      if (b.to < b.from) return setError(`בחופשה "${b.title || 'בלי שם'}" תאריך הסיום לפני ההתחלה.`)
    }
    let next = data
    for (const k of SEMESTERS) next = setSemesterDates(next, k, sem[k])
    next = { ...next, breaks: breaks.map((b) => ({ ...b, title: b.title.trim() || 'חופשה' })) }
    onSave(next)
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog dialog-compact" role="dialog" aria-modal="true" aria-labelledby="calendar-title">
        <header className="dialog-head">
          <h2 id="calendar-title">לוח השנה</h2>
          <button type="button" className="btn btn-icon" aria-label="סגירה" onClick={onClose}>
            ×
          </button>
        </header>
        <form className="dialog-body lesson-form" onSubmit={submit}>
          <fieldset className="color-set">
            <legend>סמסטרים</legend>
            <p className="muted">
              שיעור של סמסטר מסוים (לפי ההערה בקובץ, או לפי מה שבחרת בכרטיס השיעור) מוצג רק בין התאריכים. בשבוע האחרון
              מופיעה עליו התגית "שיעור אחרון".
            </p>
            {SEMESTERS.map((k) => {
              const count = lessonsOfSemester(data, k).length
              const d = sem[k]
              const set = (patch: Partial<typeof d>) => setSem((s) => ({ ...s, [k]: { ...s[k], ...patch } }))
              return (
                <div key={k} className="calendar-row">
                  <p className="calendar-row-title">
                    <strong>{SEMESTER_NAMES[k]}</strong>{' '}
                    <span className="muted">{count === 1 ? 'שיעור אחד' : count ? `${count} שיעורים` : 'אין שיעורים משויכים'}</span>
                  </p>
                  <div className="edit-row">
                    <label className="field">
                      <span>מתחיל</span>
                      <input type="date" value={d.from} onChange={(e) => set({ from: e.target.value })} />
                    </label>
                    <label className="field">
                      <span>נגמר</span>
                      <input
                        type="date"
                        value={d.to}
                        aria-invalid={!!d.from && !!d.to && d.to < d.from}
                        onChange={(e) => set({ to: e.target.value })}
                      />
                    </label>
                    {(d.from || d.to) && (
                      <button type="button" className="link-btn" onClick={() => set({ from: '', to: '' })}>
                        ניקוי
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
            {problems.map((p) => (
              <p key={p} className="import-error">
                {p}
              </p>
            ))}
          </fieldset>

          <fieldset className="color-set">
            <legend>חופשות המוסד</legend>
            <p className="muted">
              אין שיעורים בין התאריכים, והתכנון של היעדים ממשיך עם יותר זמן פנוי. חגים ומועדים מסומנים לבד, ואין צורך
              להוסיף אותם.
            </p>
            {breaks.length === 0 && <p className="muted">עוד לא הוגדרו חופשות.</p>}
            {breaks.map((b) => (
              <div key={b.id} className="calendar-row">
                <div className="edit-row">
                  <label className="field">
                    <span>שם</span>
                    <input
                      type="text"
                      value={b.title}
                      placeholder="חופשת חנוכה"
                      onChange={(e) => setBreak(b.id, { title: e.target.value })}
                    />
                  </label>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => setBreaks((list) => list.filter((x) => x.id !== b.id))}
                  >
                    מחיקה
                  </button>
                </div>
                <div className="edit-row">
                  <label className="field">
                    <span>מתאריך</span>
                    <input type="date" value={b.from} onChange={(e) => setBreak(b.id, { from: e.target.value })} />
                  </label>
                  <label className="field">
                    <span>עד</span>
                    <input
                      type="date"
                      value={b.to}
                      aria-invalid={!!b.from && !!b.to && b.to < b.from}
                      onChange={(e) => setBreak(b.id, { to: e.target.value })}
                    />
                  </label>
                </div>
              </div>
            ))}
            <button type="button" className="btn" onClick={addBreak}>
              ＋ חופשה
            </button>
          </fieldset>

          {error && (
            <p className="import-error" role="alert">
              {error}
            </p>
          )}
          <div className="import-actions">
            <button type="submit" className="btn btn-primary">
              שמירה
            </button>
            <button type="button" className="btn" onClick={onClose}>
              ביטול
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
