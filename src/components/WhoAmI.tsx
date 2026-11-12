import { useMemo } from 'react'
import type { DraftItem } from '../lib/pdf/draft'
import {
  applySelection,
  collectSubjects,
  describeConflict,
  findConflicts,
  variantClashes,
  type Selection,
} from '../lib/pdf/whoami'
import { DAY_NAMES, formatTime } from '../lib/time'
import type { Teacher } from '../lib/pdf/parseCell'

interface Props {
  /** הטיוטה המלאה, כפי שנקראה מהקובץ */
  items: DraftItem[]
  selection: Selection
  /** טבלת המרצים מהקובץ */
  teachers: Teacher[]
  onChange: (sel: Selection) => void
}

/** אשף "מי אני": אילו מקצועות אני לומד, ובאיזו קבוצה או אצל איזה מרצה */
export function WhoAmI({ items, selection, teachers, onChange }: Props) {
  const subjects = useMemo(() => collectSubjects(items, teachers), [items, teachers])
  const result = useMemo(() => applySelection(items, selection, teachers), [items, selection, teachers])
  const conflicts = useMemo(() => findConflicts(result), [result])
  const openChoices = result.filter((i) => i.options.length > 1).length

  // שינוי ידני מבטל את הסימון "נבחר אוטומטית" של אותו מקצוע
  const withoutAuto = (name: string) => {
    const auto = { ...selection.auto }
    delete auto[name]
    return auto
  }
  const setSubject = (name: string, on: boolean) =>
    onChange({ ...selection, subjects: { ...selection.subjects, [name]: on } })
  const setVariant = (name: string, key: string | null) =>
    onChange({ ...selection, variants: { ...selection.variants, [name]: key }, auto: withoutAuto(name) })

  const withVariants = subjects.filter((s) => s.variants.length && selection.subjects[s.name] !== false)

  return (
    <div className="whoami">
      <p>
        בקובץ יש את כל הקבוצות של כל המקצועות. סמן מה אתה לומד, ובכל מקצוע עם כמה קבוצות, מה שלך. אחר כך תראה טיוטה רק
        עם השיעורים שלך.
      </p>

      <fieldset className="whoami-set">
        <legend>המקצועות שלי</legend>
        <div className="whoami-chips">
          {subjects.map((s) => (
            <label key={s.name} className="chip">
              <input
                type="checkbox"
                checked={selection.subjects[s.name] !== false}
                onChange={(e) => setSubject(s.name, e.target.checked)}
              />
              <span>{s.name}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {withVariants.map((s) => {
        const clashes = variantClashes(items, selection, s, teachers)
        const auto = selection.auto?.[s.name]
        const chosen = selection.variants[s.name] ?? null
        return (
          <fieldset key={s.name} className="whoami-set">
            <legend>
              {s.name}: {s.by === 'group' ? 'באיזו קבוצה אני?' : 'אצל מי אני לומד?'}
            </legend>
            {auto && <p className="whoami-auto">{auto}</p>}
            {s.variants.map((v) => {
              const clash = clashes.get(v.key)
              return (
                <label key={v.key} className={`whoami-option${clash ? ' has-clash' : ''}`}>
                  <input
                    type="radio"
                    name={`v-${s.name}`}
                    checked={chosen === v.key}
                    onChange={() => setVariant(s.name, v.key)}
                  />
                  <span>
                    {v.label}
                    {clash && (
                      <span className="whoami-clash">
                        מתנגש עם {clash.names[0]} ביום {DAY_NAMES[clash.day]}{' '}
                        <bdi dir="ltr">{formatTime(clash.start)}</bdi>
                      </span>
                    )}
                  </span>
                </label>
              )
            })}
            <label className="whoami-option">
              <input
                type="radio"
                name={`v-${s.name}`}
                checked={chosen === null}
                onChange={() => setVariant(s.name, null)}
              />
              <span>עוד לא יודע, להשאיר את כולן לבחירה</span>
            </label>
          </fieldset>
        )
      })}

      <section className="import-summary" aria-live="polite" aria-label="מה יישאר בטיוטה">
        <p>
          יישארו <strong>{result.length}</strong> שיבוצים
          {openChoices > 0 && <>, מתוכם {openChoices} עם כמה אפשרויות לבחירה</>}.
        </p>
        {conflicts.length === 0 ? (
          <p className="import-note">אין התנגשויות.</p>
        ) : (
          <>
            <p className="import-error">
              {conflicts.length === 1 ? 'התנגשות אחת' : `${conflicts.length} התנגשויות`}:
            </p>
            <ul className="whoami-conflicts">
              {conflicts.map((c, i) => (
                <li key={i}>{describeConflict(c)}</li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  )
}
