import { useEffect, useMemo, useRef, useState } from 'react'
import type { DayIndex, Minutes, ScheduleData } from '../types'
import { WeekGrid } from './WeekGrid'
import { buildBlocks, visibleRange } from '../lib/layout'
import { DAYS, DAY_NAMES, formatTime, startOfWeek } from '../lib/time'
import type { DraftItem, DraftOption, DraftSchedule } from '../lib/pdf/draft'
import { readSchedulePdf } from '../lib/pdf/extract'
import { draftToData, validateDraft } from '../lib/pdf/toSchedule'

interface Props {
  current: ScheduleData
  hasBackup: boolean
  onSave: (data: ScheduleData) => void
  onRestore: () => void
  onClose: () => void
}

type Step =
  | { name: 'pick' }
  | { name: 'reading'; file: string }
  | { name: 'review'; fileName: string }
  | { name: 'error'; message: string }

const toInput = (m: Minutes) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const fromInput = (v: string): Minutes | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

export function ImportDialog({ current, hasBackup, onSave, onRestore, onClose }: Props) {
  const [step, setStep] = useState<Step>({ name: 'pick' })
  const [draft, setDraft] = useState<DraftSchedule>({ items: [], warnings: [] })
  const [selectedDay, setSelectedDay] = useState<DayIndex>(0)
  const [onlyCheck, setOnlyCheck] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const nextId = useRef(0)
  const [now] = useState(() => new Date())
  const weekStart = useMemo(() => startOfWeek(now), [now])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const preview = useMemo(
    () => draftToData(draft.items, { ...current, lessons: [], entries: [], choiceGroups: [] }),
    [draft.items, current],
  )
  const blocks = useMemo(() => buildBlocks(preview), [preview])
  const range = useMemo(() => visibleRange(preview, blocks), [preview, blocks])
  const problems = useMemo(() => validateDraft(draft.items), [draft.items])

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    setStep({ name: 'reading', file: file.name })
    try {
      const result = await readSchedulePdf(file)
      if (!result.items.length) {
        setStep({
          name: 'error',
          message: result.warnings[0] ?? 'לא נמצאו שיעורים בקובץ.',
        })
        return
      }
      setDraft(result)
      const firstDay = result.items.reduce<number>((d, i) => Math.min(d, i.day), 6) as DayIndex
      setSelectedDay(firstDay)
      setStep({ name: 'review', fileName: file.name })
    } catch (err) {
      console.error(err)
      setStep({
        name: 'error',
        message: 'לא הצלחתי לקרוא את הקובץ. ודא שזה קובץ PDF תקין, ואם הוא סרוק או תמונה, זה עדיין לא נתמך.',
      })
    }
  }

  const updateItem = (id: string, patch: Partial<DraftItem>) =>
    setDraft((d) => ({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }))

  const updateOption = (id: string, index: number, patch: Partial<DraftOption>) =>
    setDraft((d) => ({
      ...d,
      items: d.items.map((i) =>
        i.id === id ? { ...i, options: i.options.map((o, k) => (k === index ? { ...o, ...patch } : o)) } : i,
      ),
    }))

  const removeOption = (id: string, index: number) =>
    setDraft((d) => ({
      ...d,
      items: d.items.map((i) => (i.id === id ? { ...i, options: i.options.filter((_, k) => k !== index) } : i)),
    }))

  const addOption = (id: string) =>
    setDraft((d) => ({
      ...d,
      items: d.items.map((i) => (i.id === id ? { ...i, options: [...i.options, { name: '' }] } : i)),
    }))

  const removeItem = (id: string) => setDraft((d) => ({ ...d, items: d.items.filter((i) => i.id !== id) }))

  const addItem = () => {
    const id = `new${++nextId.current}`
    setDraft((d) => ({
      ...d,
      items: [
        ...d.items,
        { id, day: selectedDay, start: 9 * 60, end: 10 * 60, options: [{ name: '' }], raw: '', check: true },
      ],
    }))
  }

  const save = () => {
    if (problems.length) return
    onSave(draftToData(draft.items, current))
  }

  const checkCount = draft.items.filter((i) => i.check).length
  const choiceCount = draft.items.filter((i) => i.options.length > 1).length

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="import-title">
        <header className="dialog-head">
          <h2 id="import-title">ייבוא מערכת מקובץ PDF</h2>
          <button type="button" className="btn btn-icon" aria-label="סגירה" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="dialog-body">
          {step.name === 'pick' && (
            <div className="import-pick">
              <p>
                בחר את קובץ המערכת כפי שקיבלת אותו מהמוסד. הקובץ נקרא בדפדפן בלבד ולא נשלח לשום מקום.
              </p>
              <p className="muted">
                אחרי הקריאה תראה טיוטה על הלוח, ותוכל לתקן אותה לפני שהיא נשמרת. שיעורים אישיים, כמו מיגו, לא נמחקים.
              </p>
              <input
                ref={fileInput}
                type="file"
                accept="application/pdf,.pdf"
                className="visually-hidden"
                onChange={(e) => void handleFile(e.target.files?.[0])}
              />
              <div className="import-actions">
                <button type="button" className="btn btn-primary" onClick={() => fileInput.current?.click()}>
                  בחירת קובץ PDF
                </button>
                {hasBackup && (
                  <button type="button" className="btn" onClick={onRestore}>
                    שחזור המערכת שלפני הייבוא האחרון
                  </button>
                )}
              </div>
            </div>
          )}

          {step.name === 'reading' && (
            <p className="import-status" role="status">
              קורא את הקובץ…
            </p>
          )}

          {step.name === 'error' && (
            <div className="import-pick">
              <p className="import-error" role="alert">
                {step.message}
              </p>
              <div className="import-actions">
                <button type="button" className="btn" onClick={() => setStep({ name: 'pick' })}>
                  נסה קובץ אחר
                </button>
              </div>
            </div>
          )}

          {step.name === 'review' && (
            <>
              <section className="import-summary" aria-label="סיכום הקריאה">
                <p>
                  נמצאו <strong>{draft.items.length}</strong> שיבוצים, מתוכם <strong>{choiceCount}</strong> עם כמה
                  שיעורים במקביל (משבצות בחירה).
                </p>
                {checkCount > 0 && (
                  <p className="import-note">
                    {checkCount} שיבוצים מסומנים "כדאי לבדוק": תאים מורכבים שהפענוח שלהם פחות בטוח.
                  </p>
                )}
                {draft.warnings.map((w) => (
                  <p key={w} className="import-note">
                    {w}
                  </p>
                ))}
              </section>

              <WeekGrid
                weekStart={weekStart}
                blocks={blocks}
                range={range}
                now={now}
                selectedDay={selectedDay}
                onSelectDay={setSelectedDay}
              />

              <section className="import-edit" aria-label="עריכת הטיוטה">
                <div className="import-edit-head">
                  <h3>עריכת השיבוצים</h3>
                  {checkCount > 0 && (
                    <label className="import-filter">
                      <input type="checkbox" checked={onlyCheck} onChange={(e) => setOnlyCheck(e.target.checked)} />
                      רק מה שכדאי לבדוק
                    </label>
                  )}
                </div>

                {DAYS.map((day) => {
                  const items = draft.items
                    .filter((i) => i.day === day && (!onlyCheck || i.check))
                    .sort((a, b) => a.start - b.start)
                  if (!items.length) return null
                  return (
                    <div key={day} className="edit-day">
                      <h4>יום {DAY_NAMES[day]}</h4>
                      {items.map((item) => (
                        <ItemEditor
                          key={item.id}
                          item={item}
                          onChange={(p) => updateItem(item.id, p)}
                          onOption={(k, p) => updateOption(item.id, k, p)}
                          onRemoveOption={(k) => removeOption(item.id, k)}
                          onAddOption={() => addOption(item.id)}
                          onRemove={() => removeItem(item.id)}
                        />
                      ))}
                    </div>
                  )
                })}

                <button type="button" className="btn" onClick={addItem}>
                  ＋ הוספת שיעור ליום {DAY_NAMES[selectedDay]}
                </button>
              </section>
            </>
          )}
        </div>

        {step.name === 'review' && (
          <footer className="dialog-foot">
            {problems.length > 0 && (
              <p className="import-error" role="alert">
                {problems.join('. ')}.
              </p>
            )}
            <div className="import-actions">
              <button type="button" className="btn btn-primary" disabled={problems.length > 0} onClick={save}>
                שמירה כמערכת שלי
              </button>
              <button type="button" className="btn" onClick={() => setStep({ name: 'pick' })}>
                בחירת קובץ אחר
              </button>
              <button type="button" className="btn" onClick={onClose}>
                ביטול
              </button>
            </div>
            <p className="muted">המערכת הקודמת נשמרת בגיבוי, ואפשר לשחזר אותה ממסך הייבוא.</p>
          </footer>
        )}
      </div>
    </div>
  )
}

interface ItemEditorProps {
  item: DraftItem
  onChange: (patch: Partial<DraftItem>) => void
  onOption: (index: number, patch: Partial<DraftOption>) => void
  onRemoveOption: (index: number) => void
  onAddOption: () => void
  onRemove: () => void
}

function ItemEditor({ item, onChange, onOption, onRemoveOption, onAddOption, onRemove }: ItemEditorProps) {
  const invalid = item.end <= item.start
  return (
    <article className={`edit-item${item.check ? ' needs-check' : ''}`}>
      <div className="edit-row">
        <label className="field">
          <span>יום</span>
          <select value={item.day} onChange={(e) => onChange({ day: Number(e.target.value) as DayIndex })}>
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
            value={toInput(item.start)}
            onChange={(e) => {
              const m = fromInput(e.target.value)
              if (m !== null) onChange({ start: m })
            }}
          />
        </label>
        <label className="field">
          <span>סיום</span>
          <input
            type="time"
            value={toInput(item.end)}
            aria-invalid={invalid}
            onChange={(e) => {
              const m = fromInput(e.target.value)
              if (m !== null) onChange({ end: m })
            }}
          />
        </label>
        <button type="button" className="btn btn-danger" onClick={onRemove} aria-label="מחיקת השיבוץ">
          מחיקה
        </button>
      </div>

      {invalid && <p className="import-error">שעת הסיום חייבת להיות אחרי שעת ההתחלה.</p>}

      {item.options.map((o, k) => (
        <div key={k} className="edit-option">
          <div className="edit-option-head">
            <span className="edit-option-title">
              {item.options.length > 1 ? `שיעור ${k + 1} מתוך ${item.options.length}, במקביל` : 'שיעור'}
            </span>
            {item.options.length > 1 && (
              <button type="button" className="link-btn" onClick={() => onRemoveOption(k)}>
                הסרה
              </button>
            )}
          </div>
          <div className="edit-grid">
            <label className="field">
              <span>שם</span>
              <input type="text" value={o.name} onChange={(e) => onOption(k, { name: e.target.value })} />
            </label>
            <label className="field">
              <span>מרצה</span>
              <input
                type="text"
                value={o.teacher ?? ''}
                onChange={(e) => onOption(k, { teacher: e.target.value || undefined })}
              />
            </label>
            <label className="field">
              <span>חדר</span>
              <input
                type="text"
                value={o.room ?? ''}
                onChange={(e) => onOption(k, { room: e.target.value || undefined })}
              />
            </label>
            <label className="field">
              <span>קבוצה</span>
              <input
                type="text"
                value={o.group ?? ''}
                onChange={(e) => onOption(k, { group: e.target.value || undefined })}
              />
            </label>
          </div>
        </div>
      ))}

      <button type="button" className="link-btn" onClick={onAddOption}>
        ＋ שיעור נוסף באותה שעה
      </button>

      {item.check && item.raw && (
        <p className="edit-raw">
          כדאי לבדוק. כך זה נקרא מהקובץ: <bdi>{item.raw}</bdi>
        </p>
      )}
      <p className="edit-time muted">
        <bdi dir="ltr">
          {formatTime(item.start)}–{formatTime(item.end)}
        </bdi>
      </p>
    </article>
  )
}
