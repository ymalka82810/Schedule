import { goneKey, type CalendarChoice, type CalendarPlan, type GoneItem } from '../lib/yearCalendarImport'
import type { CalendarKind } from '../lib/pdf/yearCalendar'

interface Props {
  /** הכותרת שמעל הטבלה בקובץ */
  title?: string
  plan: CalendarPlan
  /** המקצועות שלי, לבחירה במבחנים */
  subjects: string[]
  /** מה מסומן להסרה מתוך plan.gone */
  removing: Set<string>
  onChange: (index: number, patch: Partial<CalendarChoice>) => void
  onToggleRemove: (item: GoneItem) => void
}

const WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

const short = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d}.${m}.${String(y).slice(2)}`
}
const weekday = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
}
const range = (from: string, to?: string) => (to && to !== from ? `${short(from)} – ${short(to)}` : short(from))

const GROUPS: Array<{ kind: CalendarKind; title: string; hint: string }> = [
  { kind: 'semester', title: 'סמסטרים', hint: 'שיעור של סמסטר מסוים מוצג רק בין התאריכים שלו.' },
  { kind: 'break', title: 'חופשות ותקופות בחינות', hint: 'אין שיעורים בין התאריכים. התכנון ממשיך, עם יותר זמן פנוי.' },
  { kind: 'exam', title: 'מבחנים', hint: 'בשבועיים שלפני מבחן התרגול במקצוע גדל. בקובץ אין שעות, אז המבחן מופיע מעל היום עד שתקבע שעה.' },
  { kind: 'event', title: 'אירועים וימים מיוחדים', hint: 'מופיעים ככותרת מעל היום. הלימודים באותו יום כרגיל.' },
]

/**
 * מסך הבדיקה של לוח שנתי: מה נמצא בקובץ, מה חדש ומה השתנה מאז הייבוא הקודם.
 * רק מה שמסומן נכנס ללוח
 */
export function CalendarImport({ title, plan, subjects, removing, onChange, onToggleRemove }: Props) {
  const rows = plan.choices.map((c, index) => ({ c, index }))
  const dated = rows.filter((r) => r.c.status === 'new' || r.c.status === 'changed')
  const same = rows.filter((r) => r.c.status === 'same')
  const undated = rows.filter((r) => r.c.status === 'undated')
  const changed = dated.filter((r) => r.c.status === 'changed').length
  const fresh = dated.length - changed

  return (
    <div className="cal-import">
      <section className="import-summary" aria-label="סיכום הקריאה">
        <p>
          זה לוח שנתי{title ? <>: <strong>{title}</strong></> : null}. נמצאו בו <strong>{plan.choices.length}</strong> שורות
          {same.length > 0 || changed > 0 ? (
            <>
              : <strong>{fresh}</strong> חדשות, <strong>{changed}</strong> שהתאריך שלהן השתנה, ו-{same.length} שכבר בלוח בלי שינוי.
            </>
          ) : (
            '.'
          )}
        </p>
        <p className="muted">
          רק מה שמסומן נכנס ללוח. כשהמוסד מפרסם גרסה מעודכנת, אפשר להעלות אותה כאן שוב: מה שכבר יובא לא יוכפל, תאריכים שזזו
          יתעדכנו, ושורות שקיבלו תאריך יתווספו.
        </p>
      </section>

      {dated.length === 0 && <p className="import-note">אין בקובץ שום דבר חדש לעומת מה שכבר בלוח.</p>}

      {GROUPS.map((g) => {
        const list = dated.filter((r) => r.c.item.kind === g.kind)
        if (!list.length) return null
        return (
          <fieldset key={g.kind} className="color-set">
            <legend>{g.title}</legend>
            <p className="muted">{g.hint}</p>
            <ul className="cal-list">
              {list.map(({ c, index }) => (
                <li key={c.item.key} className={`cal-row${c.checked ? '' : ' is-off'}`}>
                  <label className="cal-check">
                    <input type="checkbox" checked={c.checked} onChange={(e) => onChange(index, { checked: e.target.checked })} />
                    <span className="cal-main">
                      <span className="cal-title">{c.item.title}</span>
                      <span className="cal-when">
                        <bdi dir="ltr">{range(c.item.from!, c.item.to)}</bdi>
                        <span className="muted">
                          {' '}
                          יום {weekday(c.item.from!)}
                          {c.item.to && c.item.to !== c.item.from ? ` עד ${weekday(c.item.to)}` : ''}
                        </span>
                      </span>
                    </span>
                    {c.status === 'changed' && <span className="cal-badge is-changed">התאריך השתנה</span>}
                  </label>
                  {c.status === 'changed' && c.was && (
                    <p className="cal-detail">
                      בלוח עכשיו: <bdi dir="ltr">{range(c.was.from, c.was.to)}</bdi>
                    </p>
                  )}
                  {c.item.kind === 'exam' && subjects.length > 0 && (
                    <label className="cal-detail cal-subject">
                      <span>מקצוע{c.subjectGuess ? ' (ניחוש, כדאי לבדוק)' : ''}</span>
                      <select value={c.subject ?? ''} onChange={(e) => onChange(index, { subject: e.target.value || undefined, subjectGuess: false })}>
                        <option value="">בלי מקצוע (רק כותרת מעל היום)</option>
                        {subjects.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {c.reason && <p className="cal-detail muted">לא סומן: {c.reason}.</p>}
                  {c.item.warning && <p className="cal-detail import-note">{c.item.warning}</p>}
                  {c.item.note && <p className="cal-detail muted">{c.item.note}</p>}
                </li>
              ))}
            </ul>
          </fieldset>
        )
      })}

      {plan.gone.length > 0 && (
        <fieldset className="color-set">
          <legend>כבר לא מופיעים בקובץ</legend>
          <p className="muted">יובאו בעבר מלוח שנתי, ובגרסה הזו השורה שלהם נעלמה או נוסחה מחדש. סמן את מה שצריך להסיר מהלוח.</p>
          <ul className="cal-list">
            {plan.gone.map((g) => (
              <li key={goneKey(g)} className="cal-row">
                <label className="cal-check">
                  <input type="checkbox" checked={removing.has(goneKey(g))} onChange={() => onToggleRemove(g)} />
                  <span className="cal-main">
                    <span className="cal-title">{g.title}</span>
                    <span className="cal-when">
                      <bdi dir="ltr">{range(g.from, g.to)}</bdi>
                    </span>
                  </span>
                  <span className="cal-badge is-removed">להסיר</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      )}

      {undated.length > 0 && (
        <details className="cal-more">
          <summary>
            {undated.length} שורות בלי תאריך בקובץ
          </summary>
          <p className="muted">לא נכנסות ללוח. כשיתפרסם להן תאריך, העלה את הקובץ המעודכן והן יופיעו כאן כחדשות.</p>
          <ul className="cal-plain">
            {undated.map(({ c }) => (
              <li key={c.item.key}>
                {c.item.title}
                {c.item.dateText && <span className="muted"> ({c.item.dateText})</span>}
              </li>
            ))}
          </ul>
        </details>
      )}

      {same.length > 0 && (
        <details className="cal-more">
          <summary>{same.length} שורות שכבר בלוח, בלי שינוי</summary>
          <ul className="cal-plain">
            {same.map(({ c }) => (
              <li key={c.item.key}>
                {c.item.title} <bdi dir="ltr" className="muted">{range(c.item.from!, c.item.to)}</bdi>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
