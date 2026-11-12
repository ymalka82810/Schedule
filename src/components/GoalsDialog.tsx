import { useMemo, useState } from 'react'
import type { DayIndex, Goal, GoalKind, PlanSettings, ScheduleData } from '../types'
import { KINDS, blocksOf, removeReview, sessionLength } from '../lib/learning'
import { removeGoal, saveGoal, savePlanSettings } from '../lib/edit'
import { planSettings, planWeek, subjectNames } from '../lib/plan'
import { DAYS, DAY_NAMES, fromTimeInput, toTimeInput } from '../lib/time'
import { Swatches } from './Swatches'
import { DayPicker } from './DayPicker'
import { useEscape } from './useEscape'
import { forgetPref, learnedPrefs } from '../lib/prefs'

interface Props {
  data: ScheduleData
  weekStart: Date
  /** YYYY-MM-DD */
  today?: string
  onSave: (data: ScheduleData) => void
  onClose: () => void
}

const hours = (m: number) => {
  const h = m / 60
  return Number.isInteger(h) ? String(h) : h.toFixed(1)
}

const newGoal = (): Omit<Goal, 'id'> => ({
  name: '',
  color: 'teal',
  minHoursPerWeek: 3,
  maxHoursPerWeek: 4,
  preferredWindows: [],
  sessionMinutes: 60,
  maxPerDay: 1,
})

/** יעדים גמישים לשבוע, והגדרות התכנון. השינויים נשמרים רק בלחיצה על שמירה */
export function GoalsDialog({ data, weekStart, today, onSave, onClose }: Props) {
  useEscape(onClose)
  const [draft, setDraft] = useState(data)
  const [openId, setOpenId] = useState<string | null>(null)
  const plan = useMemo(() => planWeek(draft, weekStart, today), [draft, weekStart, today])
  const settings = planSettings(draft)
  const subjects = useMemo(() => subjectNames(draft.lessons), [draft.lessons])
  const prefs = useMemo(() => learnedPrefs(draft), [draft])

  const updateGoal = (g: Goal, patch: Partial<Goal>) => setDraft((d) => saveGoal(d, { ...g, ...patch }))
  const addGoal = () => {
    const next = saveGoal(draft, { ...newGoal(), name: `יעד ${draft.goals.length + 1}` })
    setDraft(next)
    setOpenId(next.goals.at(-1)!.id)
  }
  const setPlan = (patch: Partial<PlanSettings>) => setDraft((d) => savePlanSettings(d, { ...settings, ...patch }))

  const time = (value: number, onChange: (m: number) => void) => (
    <input
      type="time"
      value={toTimeInput(value)}
      onChange={(e) => {
        const m = fromTimeInput(e.target.value)
        if (m !== null) onChange(m)
      }}
    />
  )

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="goals-title">
        <header className="dialog-head">
          <h2 id="goals-title">יעדים לזמן הפנוי</h2>
          <button type="button" className="btn btn-icon" aria-label="סגירה" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="dialog-body goals">
          <p className="muted">
            כמה זמן בשבוע לכל דבר, והמערכת מוצאת לבד מתי: רק בזמן פנוי, עם הפסקות, מפוזר על השבוע. תרגול של מקצוע נקבע
            אחרי השיעור או ערב לפני השיעור הבא. בכל שבוע התכנון מתעדכן לפי אירועים וביטולים. כשבוחרים ליעד סוג למידה, התכנון
            עובד לפי מה שהמחקר על למידה מראה: אורך מפגש מתאים, פיזור, ערבוב, וחזרות מרווחות.
          </p>

          {draft.goals.length === 0 && <p>עוד אין יעדים. הוסף יעד ראשון, למשל "תרגול פיזיקה, 4 שעות".</p>}

          {draft.goals.map((g) => {
            const r = plan.report.find((x) => x.goalId === g.id)
            const short = r && r.planned < r.min
            const open = openId === g.id
            return (
              <article key={g.id} className={`goal c-${g.color}${open ? ' is-open' : ''}`}>
                <button
                  type="button"
                  className="goal-head"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : g.id)}
                >
                  <span className="goal-name">
                    {g.name || 'יעד בלי שם'}
                    {g.kind && <span className="goal-kind">{KINDS[g.kind].label}</span>}
                  </span>
                  <span className={short ? 'goal-status is-short' : 'goal-status'}>
                    {r
                      ? `${hours(r.planned)} מתוך ${hours(r.min)}–${hours(r.max)} שעות השבוע${r.done ? `, בוצעו ${hours(r.done)}` : ''}${r.reviews ? `, חזרות ${r.reviewsDone} מתוך ${r.reviews}` : ''}`
                      : ''}
                  </span>
                </button>
                {r?.boost && <p className="whoami-auto">{r.boost}: התרגול השבוע גדל פי 1.5.</p>}
                {short && (
                  <p className="import-error">
                    חסרות {hours(r.min - r.planned)} שעות: אין מספיק זמן פנוי מתאים. אפשר להקטין את היעד, לקצר מפגשים או
                    לאפשר יותר מפגש אחד ביום.
                  </p>
                )}

                {open && (
                  <div className="goal-body">
                    <label className="field">
                      <span>שם</span>
                      <input type="text" value={g.name} onChange={(e) => updateGoal(g, { name: e.target.value })} />
                    </label>
                    <fieldset className="kind-pick">
                      <legend>סוג הלמידה</legend>
                      <div className="whoami-chips">
                        {([undefined, 'knowledge', 'skill', 'creative'] as (GoalKind | undefined)[]).map((k) => (
                          <label key={k ?? 'none'} className="chip">
                            <input
                              type="radio"
                              name={`kind-${g.id}`}
                              checked={g.kind === k}
                              onChange={() =>
                                updateGoal(
                                  g,
                                  k
                                    ? { kind: k, sessionMinutes: KINDS[k].session, maxPerDay: KINDS[k].maxPerDay }
                                    : { kind: undefined },
                                )
                              }
                            />
                            <span>{k ? KINDS[k].label : 'בלי סוג'}</span>
                          </label>
                        ))}
                      </div>
                      <p className="muted">
                        {g.kind
                          ? KINDS[g.kind].describe
                          : 'בלי כללי למידה מיוחדים: רק זמן פנוי ופיזור. מתאים לאימון כושר או לקריאה להנאה.'}
                      </p>
                    </fieldset>
                    <label className="field">
                      <span>קשור למקצוע</span>
                      <select
                        value={g.subject ?? ''}
                        onChange={(e) => updateGoal(g, { subject: e.target.value || undefined })}
                      >
                        <option value="">לא קשור למקצוע (אימון, קריאה)</option>
                        {subjects.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="edit-row">
                      <label className="field">
                        <span>מינימום שעות בשבוע</span>
                        <input
                          type="number"
                          min={0}
                          max={60}
                          step={0.5}
                          value={g.minHoursPerWeek}
                          onChange={(e) => {
                            const v = Math.max(0, Number(e.target.value) || 0)
                            updateGoal(g, { minHoursPerWeek: v, maxHoursPerWeek: Math.max(v, g.maxHoursPerWeek) })
                          }}
                        />
                      </label>
                      <label className="field">
                        <span>מקסימום</span>
                        <input
                          type="number"
                          min={0}
                          max={60}
                          step={0.5}
                          value={g.maxHoursPerWeek}
                          onChange={(e) => updateGoal(g, { maxHoursPerWeek: Math.max(0, Number(e.target.value) || 0) })}
                        />
                      </label>
                    </div>
                    <div className="edit-row">
                      <label className="field">
                        <span>אורך מפגש</span>
                        <select
                          value={g.sessionMinutes ?? 60}
                          onChange={(e) => updateGoal(g, { sessionMinutes: Number(e.target.value) })}
                        >
                          {[...new Set([25, 30, 45, 50, 60, 90, 120, sessionLength(g)])].sort((a, b) => a - b).map((m) => (
                            <option key={m} value={m}>
                              {m} דקות
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>מפגשים ביום, לכל היותר</span>
                        <select
                          value={g.maxPerDay ?? 1}
                          onChange={(e) => updateGoal(g, { maxPerDay: Number(e.target.value) })}
                        >
                          {[1, 2, 3].map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {(() => {
                      const b = blocksOf(g.kind, sessionLength(g))
                      return b ? (
                        <p className="muted">
                          מפגש של {sessionLength(g)} דקות מתחלק ל-{b.count} בלוקים של כ-{b.each} דקות, עם {b.rest} דקות הפסקה
                          ביניהם. ריכוז נשחק אחרי כ-50 דקות.
                        </p>
                      ) : null
                    })()}
                    {g.kind && KINDS[g.kind].dailyCap < 24 * 60 && (
                      <p className="muted">
                        לכל היותר {hours(KINDS[g.kind].dailyCap)} שעות ביום ביעד הזה: מעבר לזה התרגול כבר כמעט לא מוסיף.
                      </p>
                    )}
                    {(draft.reviews ?? []).some((rv) => rv.goalId === g.id) && (
                      <div>
                        <p className="muted">חזרות מרווחות שממתינות:</p>
                        <ul className="review-list">
                          {(draft.reviews ?? [])
                            .filter((rv) => rv.goalId === g.id)
                            .sort((a, b) => a.due.localeCompare(b.due))
                            .map((rv) => (
                              <li key={rv.id}>
                                <span>
                                  {rv.topic}: חזרה {rv.step + 1}, ב-{rv.due.slice(8).replace(/^0/, '')}.
                                  {rv.due.slice(5, 7).replace(/^0/, '')}
                                </span>
                                <button
                                  type="button"
                                  className="link-btn"
                                  onClick={() => setDraft((d) => removeReview(d, rv.id))}
                                >
                                  הפסקת החזרות
                                </button>
                              </li>
                            ))}
                        </ul>
                      </div>
                    )}
                    <DayPicker
                      legend="רק בימים (בלי סימון: כל יום)"
                      value={g.days ?? []}
                      onChange={(days) => updateGoal(g, { days: days.length ? days : undefined })}
                    />
                    <label className="import-filter">
                      <input
                        type="checkbox"
                        checked={g.earliest !== undefined || g.latest !== undefined}
                        onChange={(e) =>
                          updateGoal(
                            g,
                            e.target.checked
                              ? { earliest: 7 * 60, latest: 12 * 60 }
                              : { earliest: undefined, latest: undefined },
                          )
                        }
                      />
                      רק בשעות מסוימות
                    </label>
                    {(g.earliest !== undefined || g.latest !== undefined) && (
                      <div className="edit-row">
                        <label className="field">
                          <span>לא לפני</span>
                          {time(g.earliest ?? settings.dayStart, (m) => updateGoal(g, { earliest: m }))}
                        </label>
                        <label className="field">
                          <span>לסיים עד</span>
                          {time(g.latest ?? settings.dayEnd, (m) => updateGoal(g, { latest: m }))}
                        </label>
                      </div>
                    )}
                    {(draft.practiceWindows ?? []).length > 0 && (
                      <label className="import-filter">
                        <input
                          type="checkbox"
                          checked={!!g.preferPractice}
                          onChange={(e) => updateGoal(g, { preferPractice: e.target.checked })}
                        />
                        קודם בחלונות התרגול (כמו מיגו)
                      </label>
                    )}
                    <Swatches value={g.color} name={`color-${g.id}`} onChange={(c) => updateGoal(g, { color: c })} />
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => {
                        setDraft((d) => removeGoal(d, g.id))
                        setOpenId(null)
                      }}
                    >
                      מחיקת היעד
                    </button>
                  </div>
                )}
              </article>
            )
          })}

          <button type="button" className="btn" onClick={addGoal}>
            ＋ יעד חדש
          </button>

          <fieldset className="whoami-set">
            <legend>מה התכנון למד מההזזות שלך</legend>
            {prefs.length === 0 ? (
              <p className="muted">
                {(draft.planFeedback ?? []).length
                  ? `נרשמו ${(draft.planFeedback ?? []).length} הזזות ודחיות, עוד בלי דפוס קבוע. כשאותה הזזה חוזרת פעמיים, בתאריכים שונים, היא הופכת להעדפה.`
                  : 'עוד כלום. כשתגרור מפגש מתוכנן לשעה אחרת או תסמן "לא מתאים לי כאן", ואותו דבר יחזור פעמיים, התכנון ילמד את זה.'}
              </p>
            ) : (
              <>
                <ul className="pref-list">
                  {prefs.map((p) => (
                    <li key={p.label}>
                      <span>
                        {p.label} <span className="muted">({p.count} פעמים)</span>
                      </span>
                      <button type="button" className="link-btn" onClick={() => setDraft((d) => forgetPref(d, p))}>
                        לשכוח
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="muted">
                  אלה העדפות רכות: אם אין מקום אחר, מפגש עדיין יכול להיכנס לשם. הזזה לכיוון ההפוך מחלישה אותן.
                </p>
              </>
            )}
          </fieldset>

          <fieldset className="whoami-set">
            <legend>מתי מותר לתכנן</legend>
            <div className="edit-row">
              <label className="field">
                <span>מתחיל ביום</span>
                {time(settings.dayStart, (m) => setPlan({ dayStart: m }))}
              </label>
              <label className="field">
                <span>מסיים ביום</span>
                {time(settings.dayEnd, (m) => setPlan({ dayEnd: m }))}
              </label>
              <label className="field">
                <span>הפסקה בין דברים</span>
                <select
                  value={settings.breakMinutes}
                  onChange={(e) => setPlan({ breakMinutes: Number(e.target.value) })}
                >
                  {[0, 10, 15, 20, 30].map((m) => (
                    <option key={m} value={m}>
                      {m} דקות
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>שעות תרגול ביום, לכל היותר</span>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={settings.maxHoursPerDay}
                  onChange={(e) => setPlan({ maxHoursPerDay: Math.max(1, Number(e.target.value) || 1) })}
                />
              </label>
            </div>
            <label className="import-filter">
              <input
                type="checkbox"
                checked={settings.fridayEnd !== null}
                onChange={(e) => setPlan({ fridayEnd: e.target.checked ? 12 * 60 : null })}
              />
              בשישי לסיים מוקדם
            </label>
            {settings.fridayEnd !== null && (
              <label className="field goal-narrow">
                <span>בשישי עד</span>
                {time(settings.fridayEnd, (m) => setPlan({ fridayEnd: m }))}
              </label>
            )}
            <label className="import-filter">
              <input
                type="checkbox"
                checked={settings.sharpFrom !== undefined}
                onChange={(e) =>
                  setPlan(
                    e.target.checked
                      ? { sharpFrom: 9 * 60, sharpTo: 13 * 60 }
                      : { sharpFrom: undefined, sharpTo: undefined },
                  )
                }
              />
              יש לי שעות שבהן אני חד במיוחד
            </label>
            {settings.sharpFrom !== undefined && (
              <>
                <div className="edit-row">
                  <label className="field">
                    <span>חד מ-</span>
                    {time(settings.sharpFrom, (m) => setPlan({ sharpFrom: m }))}
                  </label>
                  <label className="field">
                    <span>עד</span>
                    {time(settings.sharpTo ?? settings.dayEnd, (m) => setPlan({ sharpTo: m }))}
                  </label>
                </div>
                <p className="muted">
                  למידה קשה של יעדים עם סוג מושמת בשעות האלה, וחזרות קלות בשעות העייפות.
                </p>
              </>
            )}
            <p className="muted">ימים בלי תכנון:</p>
            <div className="whoami-chips">
              {DAYS.map((d: DayIndex) => (
                <label key={d} className="chip">
                  <input
                    type="checkbox"
                    checked={settings.offDays.includes(d)}
                    onChange={(e) =>
                      setPlan({
                        offDays: e.target.checked
                          ? [...settings.offDays, d].sort()
                          : settings.offDays.filter((x) => x !== d),
                      })
                    }
                  />
                  <span>{DAY_NAMES[d]}</span>
                </label>
              ))}
            </div>
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
