import { useEffect, useState, type FormEvent } from 'react'
import type { ColorKey, DayIndex, ScheduleData, Slot } from '../types'
import {
  COLORS,
  COLOR_NAMES,
  addLesson,
  chooseOption,
  moveChoice,
  moveEntry,
  removeChoice,
  removeEntry,
  removePractice,
  slotProblem,
  toggleCancellation,
  updateLesson,
  updatePractice,
  type BlockTarget,
} from '../lib/edit'
import { DAYS, DAY_NAMES, fromTimeInput, toTimeInput } from '../lib/time'

export type LessonTarget = Extract<BlockTarget, { kind: 'entry' | 'choice' | 'practice' }>
export type LessonDialogMode = { kind: 'edit'; target: LessonTarget } | { kind: 'new'; day: DayIndex }

interface Props {
  data: ScheduleData
  mode: LessonDialogMode
  /** התאריך של השיבוץ בשבוע המוצג, לביטול בשבוע הזה בלבד */
  date?: string
  onSave: (data: ScheduleData) => void
  onClose: () => void
}


/** עריכה של שיעור מהלוח, או הוספת שיעור חדש */
export function LessonDialog({ data, mode, date, onSave, onClose }: Props) {
  const target = mode.kind === 'edit' ? mode.target : null

  const initialSlot: Slot =
    target?.kind === 'entry'
      ? target.entry.slot
      : target?.kind === 'choice'
        ? target.group.slot
        : target?.kind === 'practice'
          ? target.window.slot
          : { day: mode.kind === 'new' ? mode.day : 0, start: 9 * 60, end: 10 * 60 }

  const lesson = target?.kind === 'entry' ? target.lesson : null
  const [name, setName] = useState(
    lesson?.name ?? (target?.kind === 'practice' ? target.window.name : ''),
  )
  const [teacher, setTeacher] = useState(lesson?.teacher ?? '')
  const [room, setRoom] = useState(
    (target?.kind === 'entry' ? (target.entry.room ?? lesson?.room) : undefined) ??
      (target?.kind === 'practice' ? target.window.context : undefined) ??
      '',
  )
  const [color, setColor] = useState<ColorKey>(lesson?.color ?? 'cobalt')
  const [validFrom, setValidFrom] = useState(lesson?.validFrom ?? '')
  const [validUntil, setValidUntil] = useState(lesson?.validUntil ?? '')
  const [slot, setSlot] = useState<Slot>(initialSlot)
  const [chosen, setChosen] = useState<string | null>(target?.kind === 'choice' ? target.group.chosenLessonId : null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const title =
    mode.kind === 'new'
      ? 'הוספת שיעור'
      : target?.kind === 'choice'
        ? 'משבצת בחירה'
        : target?.kind === 'practice'
          ? 'חלון תרגול'
          : 'עריכת שיעור'

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const problem = slotProblem(slot)
    if (problem) return setError(problem)
    const needsName = target?.kind !== 'choice'
    if (needsName && !name.trim()) return setError('צריך שם.')
    if (validFrom && validUntil && validUntil < validFrom) return setError('תאריך הסיום של התוקף לפני תאריך ההתחלה.')

    let next = data
    if (mode.kind === 'new') {
      next = addLesson(data, { name, teacher, room, color, slot })
    } else if (target?.kind === 'entry') {
      // שם, מרצה, חדר וצבע שייכים לשיעור ומשתנים בכל השיבוצים שלו. השעה רק בשיבוץ הזה
      next = updateLesson(data, target.lesson.id, {
        name: name.trim(),
        teacher: teacher.trim() || undefined,
        room: room.trim() || undefined,
        color,
        validFrom: validFrom || undefined,
        validUntil: validUntil || undefined,
      })
      next = moveEntry(next, target.entry.id, slot)
    } else if (target?.kind === 'choice') {
      next = chooseOption(moveChoice(data, target.group.id, slot), target.group.id, chosen)
    } else if (target?.kind === 'practice') {
      next = updatePractice(data, target.window.id, { name: name.trim(), context: room.trim() || undefined, slot })
    }
    onSave(next)
  }

  const remove = () => {
    if (!target) return
    if (!window.confirm('למחוק את השיבוץ הזה מהמערכת?')) return
    if (target.kind === 'entry') onSave(removeEntry(data, target.entry.id))
    else if (target.kind === 'choice') onSave(removeChoice(data, target.group.id))
    else onSave(removePractice(data, target.window.id))
  }

  const refId = target?.kind === 'entry' ? target.entry.id : target?.kind === 'choice' ? target.group.id : target?.window.id
  const cancelledNow = !!(refId && date && (data.cancellations ?? []).some((c) => c.refId === refId && c.date === date))
  const toggleWeek = () => {
    if (refId && date) onSave(toggleCancellation(data, refId, date))
  }

  const usesOfLesson = lesson ? data.entries.filter((e) => e.lessonId === lesson.id).length : 0

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog dialog-compact" role="dialog" aria-modal="true" aria-labelledby="lesson-title">
        <header className="dialog-head">
          <h2 id="lesson-title">{title}</h2>
          <button type="button" className="btn btn-icon" aria-label="סגירה" onClick={onClose}>
            ×
          </button>
        </header>

        <form className="dialog-body lesson-form" onSubmit={submit}>
          {cancelledNow && <p className="import-note">השיבוץ הזה בוטל בשבוע המוצג.</p>}

          {target?.kind === 'choice' ? (
            <fieldset className="whoami-set">
              <legend>מה אני לומד בשעה הזו?</legend>
              {target.options.map((o) => (
                <label key={o.id} className="whoami-option">
                  <input type="radio" name="choice" checked={chosen === o.id} onChange={() => setChosen(o.id)} />
                  <span>
                    {o.group ? `${o.name} ${o.group}` : o.name}
                    {o.teacher && <span className="muted">{o.teacher}</span>}
                  </span>
                </label>
              ))}
              <label className="whoami-option">
                <input type="radio" name="choice" checked={chosen === null} onChange={() => setChosen(null)} />
                <span>עוד לא בחרתי</span>
              </label>
            </fieldset>
          ) : (
            <>
              <label className="field">
                <span>שם</span>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              </label>
              {target?.kind !== 'practice' && (
                <label className="field">
                  <span>מרצה</span>
                  <input type="text" value={teacher} onChange={(e) => setTeacher(e.target.value)} />
                </label>
              )}
              <label className="field">
                <span>{target?.kind === 'practice' ? 'מסגרת' : 'חדר'}</span>
                <input type="text" value={room} onChange={(e) => setRoom(e.target.value)} />
              </label>
              {target?.kind !== 'practice' && (
                <fieldset className="color-set">
                  <legend>צבע</legend>
                  <div className="color-swatches">
                    {COLORS.map((c) => (
                      <label key={c} className={`swatch c-${c}`} title={COLOR_NAMES[c]}>
                        <input
                          type="radio"
                          name="color"
                          className="visually-hidden"
                          checked={color === c}
                          onChange={() => setColor(c)}
                        />
                        <span className="visually-hidden">{COLOR_NAMES[c]}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              {lesson && (
                <fieldset className="color-set">
                  <legend>תוקף (לא חובה)</legend>
                  {lesson.note && (
                    <p className="whoami-auto">
                      בקובץ כתוב: {lesson.note}. {!validUntil && 'אם תכתוב מתי זה נגמר, השיעור ייעלם מהמערכת אחרי התאריך.'}
                    </p>
                  )}
                  <div className="edit-row">
                    <label className="field">
                      <span>מתאריך</span>
                      <input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
                    </label>
                    <label className="field">
                      <span>עד תאריך</span>
                      <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
                    </label>
                  </div>
                </fieldset>
              )}
              {usesOfLesson > 1 && (
                <p className="muted">
                  השם, המרצה, החדר והצבע ישתנו בכל {usesOfLesson} השיבוצים של השיעור. היום והשעה רק כאן.
                </p>
              )}
            </>
          )}

          <div className="edit-row">
            <label className="field">
              <span>יום</span>
              <select
                value={slot.day}
                onChange={(e) => setSlot({ ...slot, day: Number(e.target.value) as DayIndex })}
              >
                {DAYS.map((d) => (
                  <option key={d} value={d}>
                    {DAY_NAMES[d]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>התחלה</span>
              <input
                type="time"
                value={toTimeInput(slot.start)}
                onChange={(e) => {
                  const m = fromTimeInput(e.target.value)
                  if (m !== null) setSlot({ ...slot, start: m })
                }}
              />
            </label>
            <label className="field">
              <span>סיום</span>
              <input
                type="time"
                value={toTimeInput(slot.end)}
                aria-invalid={slot.end <= slot.start}
                onChange={(e) => {
                  const m = fromTimeInput(e.target.value)
                  if (m !== null) setSlot({ ...slot, end: m })
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
              {mode.kind === 'new' ? 'הוספה' : 'שמירה'}
            </button>
            <button type="button" className="btn" onClick={onClose}>
              ביטול
            </button>
            {target && date && (
              <button type="button" className="btn" onClick={toggleWeek}>
                {cancelledNow ? 'החזרה בשבוע הזה' : 'ביטול בשבוע הזה בלבד'}
              </button>
            )}
            {target && (
              <button type="button" className="btn btn-danger" onClick={remove}>
                מחיקה מהמערכת
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
