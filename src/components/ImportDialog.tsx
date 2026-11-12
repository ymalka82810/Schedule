import { useEffect, useMemo, useRef, useState } from 'react'
import type { DayIndex, ScheduleData } from '../types'
import { WeekGrid } from './WeekGrid'
import { buildBlocks, visibleRange } from '../lib/layout'
import { DAYS, DAY_NAMES, formatTime, fromTimeInput as fromInput, startOfWeek, toTimeInput as toInput } from '../lib/time'
import type { DraftItem, DraftOption, DraftSchedule } from '../lib/pdf/draft'
import { readSchedulePdf } from '../lib/pdf/extract'
import { fromBackup, toBackup } from '../lib/edit'
import { draftToData, validateDraft } from '../lib/pdf/toSchedule'
import {
  applySelection,
  collectSubjects,
  describeConflict,
  findConflicts,
  initialSelection,
  needsWizard,
  type Selection,
} from '../lib/pdf/whoami'
import { WhoAmI } from './WhoAmI'

interface Props {
  current: ScheduleData
  hasBackup: boolean
  /** סביבת בדיקה: מה שנשמר כאן נעלם ברענון */
  memoryOnly: boolean
  onSave: (data: ScheduleData) => void
  onRestore: () => void
  onClose: () => void
}

type Step =
  | { name: 'pick' }
  | { name: 'reading'; file: string }
  | { name: 'whoami'; fileName: string }
  | { name: 'review'; fileName: string }
  | { name: 'error'; message: string }


export function ImportDialog({ current, hasBackup, memoryOnly, onSave, onRestore, onClose }: Props) {
  const [step, setStep] = useState<Step>({ name: 'pick' })
  const [draft, setDraft] = useState<DraftSchedule>({ items: [], warnings: [] })
  /** הטיוטה כפי שנקראה מהקובץ, עם כל הקבוצות. האשף מסנן ממנה מחדש בכל פעם */
  const [fullItems, setFullItems] = useState<DraftItem[]>([])
  const [selection, setSelection] = useState<Selection>({ subjects: {}, variants: {} })
  /** האם היו תיקונים ידניים בטיוטה מאז האשף. חזרה לאשף מבטלת אותם */
  const [edited, setEdited] = useState(false)
  /** תמונות העמודים המקוריים */
  const [pages, setPages] = useState<string[]>([])
  /** כרטיס העריכה שמודגש אחרי לחיצה על בלוק בלוח */
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [selectedDay, setSelectedDay] = useState<DayIndex>(0)
  const [onlyCheck, setOnlyCheck] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const backupInput = useRef<HTMLInputElement>(null)
  const [backupError, setBackupError] = useState<string | null>(null)
  const nextId = useRef(0)
  const [now] = useState(() => new Date())
  const weekStart = useMemo(() => startOfWeek(now), [now])

  // שחרור התמונות כשמחליפים קובץ או סוגרים
  useEffect(() => () => pages.forEach((u) => URL.revokeObjectURL(u)), [pages])

  // אחרי לחיצה על בלוק: גלילה לכרטיס, מיקוד בשדה הראשון, והדגשה קצרה
  useEffect(() => {
    if (!focusedId) return
    const el = document.getElementById(`edit-${focusedId}`)
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' })
    el.querySelector<HTMLElement>('input, select')?.focus({ preventScroll: true })
    const t = window.setTimeout(() => setFocusedId(null), 2000)
    return () => window.clearTimeout(t)
  }, [focusedId])

  /** מזהה בלוק בלוח הטיוטה = מזהה השיבוץ, ובמשבצת בחירה "שיבוץ:שיעור" */
  const openEditor = (blockId: string) => {
    const id = blockId.split(':')[0]
    const item = draft.items.find((i) => i.id === id)
    if (!item) return
    if (onlyCheck && !item.check) setOnlyCheck(false)
    setSelectedDay(item.day)
    setFocusedId(id)
  }

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
  const conflicts = useMemo(() => findConflicts(draft.items), [draft.items])

  const firstDayOf = (items: DraftItem[]) => items.reduce<number>((d, i) => Math.min(d, i.day), 6) as DayIndex

  const finishWizard = (fileName: string, sel: Selection | null) => {
    const items = sel ? applySelection(fullItems, sel) : fullItems
    setDraft((d) => ({ ...d, items }))
    setEdited(false)
    if (items.length) setSelectedDay(firstDayOf(items))
    setStep({ name: 'review', fileName })
  }

  const backToWizard = (fileName: string) => {
    if (edited && !window.confirm('חזרה לשאלות תבטל את התיקונים שעשית בטיוטה. להמשיך?')) return
    setStep({ name: 'whoami', fileName })
  }

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    setStep({ name: 'reading', file: file.name })
    try {
      const { draft: result, pages: images } = await readSchedulePdf(file)
      setPages(images)
      if (!result.items.length) {
        setStep({
          name: 'error',
          message: result.warnings[0] ?? 'לא נמצאו שיעורים בקובץ.',
        })
        return
      }
      setDraft(result)
      setFullItems(result.items)
      setEdited(false)
      setSelectedDay(firstDayOf(result.items))
      if (needsWizard(result.items)) {
        setSelection(initialSelection(collectSubjects(result.items), current))
        setStep({ name: 'whoami', fileName: file.name })
      } else {
        setStep({ name: 'review', fileName: file.name })
      }
    } catch (err) {
      console.error(err)
      setStep({
        name: 'error',
        message: 'לא הצלחתי לקרוא את הקובץ. ודא שזה קובץ PDF תקין, ואם הוא סרוק או תמונה, זה עדיין לא נתמך.',
      })
    }
  }

  /** כל תיקון ידני בטיוטה עובר כאן */
  const editItems = (fn: (items: DraftItem[]) => DraftItem[]) => {
    setEdited(true)
    setDraft((d) => ({ ...d, items: fn(d.items) }))
  }
  const mapItem = (id: string, fn: (i: DraftItem) => DraftItem) =>
    editItems((items) => items.map((i) => (i.id === id ? fn(i) : i)))

  const updateItem = (id: string, patch: Partial<DraftItem>) => mapItem(id, (i) => ({ ...i, ...patch }))
  const updateOption = (id: string, index: number, patch: Partial<DraftOption>) =>
    mapItem(id, (i) => ({ ...i, options: i.options.map((o, k) => (k === index ? { ...o, ...patch } : o)) }))
  const removeOption = (id: string, index: number) =>
    mapItem(id, (i) => ({ ...i, options: i.options.filter((_, k) => k !== index) }))
  const addOption = (id: string) => mapItem(id, (i) => ({ ...i, options: [...i.options, { name: '' }] }))
  const removeItem = (id: string) => editItems((items) => items.filter((i) => i.id !== id))

  const addItem = () => {
    const id = `new${++nextId.current}`
    editItems((items) => [
      ...items,
      { id, day: selectedDay, start: 9 * 60, end: 10 * 60, options: [{ name: '' }], raw: '', check: true },
    ])
  }

  const exportBackup = () => {
    const blob = new Blob([toBackup(current)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `schedule-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const importBackup = async (file: File | undefined) => {
    if (!file) return
    setBackupError(null)
    const result = fromBackup(await file.text())
    if ('error' in result) {
      setBackupError(result.error)
      return
    }
    if (!window.confirm('לטעון את המערכת מהגיבוי במקום המערכת הנוכחית? הנוכחית תישמר לשחזור.')) return
    onSave(result.data)
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
          <h2 id="import-title">{step.name === 'whoami' ? 'מה אני לומד?' : 'ייבוא מערכת מקובץ PDF'}</h2>
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

              <h3 className="import-subtitle">גיבוי</h3>
              <p className="muted">
                קובץ JSON עם כל המערכת, כולל שיעורים אישיים וחלונות תרגול. אפשר לשמור אותו ולטעון אותו בחזרה, גם במחשב אחר.
              </p>
              <input
                ref={backupInput}
                type="file"
                accept="application/json,.json"
                className="visually-hidden"
                onChange={(e) => void importBackup(e.target.files?.[0])}
              />
              <div className="import-actions">
                <button type="button" className="btn" onClick={exportBackup}>
                  הורדת גיבוי
                </button>
                <button type="button" className="btn" onClick={() => backupInput.current?.click()}>
                  טעינה מגיבוי
                </button>
              </div>
              {backupError && (
                <p className="import-error" role="alert">
                  {backupError}
                </p>
              )}
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

          {step.name === 'whoami' && <WhoAmI items={fullItems} selection={selection} onChange={setSelection} />}

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
                {conflicts.length > 0 && (
                  <>
                    <p className="import-error">
                      {conflicts.length === 1 ? 'התנגשות אחת' : `${conflicts.length} התנגשויות`} בטיוטה:
                    </p>
                    <ul className="whoami-conflicts">
                      {conflicts.map((c, i) => (
                        <li key={i}>{describeConflict(c)}</li>
                      ))}
                    </ul>
                  </>
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
                onBlockClick={openEditor}
              />
              <p className="muted">לחיצה על שיעור בלוח פותחת את הכרטיס שלו לעריכה.</p>

              {pages.length > 0 && <OriginalPages pages={pages} />}

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
                          highlighted={focusedId === item.id}
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

        {step.name === 'whoami' && (
          <footer className="dialog-foot">
            <div className="import-actions">
              <button type="button" className="btn btn-primary" onClick={() => finishWizard(step.fileName, selection)}>
                המשך לטיוטה
              </button>
              <button type="button" className="btn" onClick={() => finishWizard(step.fileName, null)}>
                דילוג, להציג את כל הקבוצות
              </button>
              <button type="button" className="btn" onClick={onClose}>
                ביטול
              </button>
            </div>
          </footer>
        )}

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
              {needsWizard(fullItems) && (
                <button type="button" className="btn" onClick={() => backToWizard(step.fileName)}>
                  שינוי המקצועות והקבוצות שלי
                </button>
              )}
              <button type="button" className="btn" onClick={() => setStep({ name: 'pick' })}>
                בחירת קובץ אחר
              </button>
              <button type="button" className="btn" onClick={onClose}>
                ביטול
              </button>
            </div>
            <p className="muted">
              {memoryOnly
                ? 'המערכת נשמרת רק בזיכרון של הדף (סביבת בדיקה) ותיעלם ברענון. המערכת הקודמת נשמרת לשחזור עד הרענון.'
                : 'המערכת הקודמת נשמרת בגיבוי, ואפשר לשחזר אותה ממסך הייבוא.'}
            </p>
          </footer>
        )}
      </div>
    </div>
  )
}

/** העמודים המקוריים מה-PDF, להשוואה תא מול תא. אפשר להגדיל ולגלול */
function OriginalPages({ pages }: { pages: string[] }) {
  const [zoom, setZoom] = useState(false)
  return (
    <details className="original">
      <summary>הקובץ המקורי, להשוואה</summary>
      <div className="original-tools">
        <button type="button" className="link-btn" onClick={() => setZoom((z) => !z)}>
          {zoom ? 'התאמה לרוחב' : 'הגדלה'}
        </button>
      </div>
      <div className={`original-pages${zoom ? ' is-zoomed' : ''}`}>
        {pages.map((src, i) => (
          <img key={src} src={src} alt={`עמוד ${i + 1} בקובץ המקורי`} />
        ))}
      </div>
    </details>
  )
}

interface ItemEditorProps {
  item: DraftItem
  highlighted: boolean
  onChange: (patch: Partial<DraftItem>) => void
  onOption: (index: number, patch: Partial<DraftOption>) => void
  onRemoveOption: (index: number) => void
  onAddOption: () => void
  onRemove: () => void
}

function ItemEditor({ item, highlighted, onChange, onOption, onRemoveOption, onAddOption, onRemove }: ItemEditorProps) {
  const invalid = item.end <= item.start
  return (
    <article
      id={`edit-${item.id}`}
      className={`edit-item${item.check ? ' needs-check' : ''}${highlighted ? ' is-highlighted' : ''}`}
    >
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
