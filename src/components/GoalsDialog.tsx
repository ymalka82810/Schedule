import { useMemo, useState } from 'react'
import type { DayIndex, Goal, GoalKind, PlanSettings, ScheduleData } from '../types'
import { allGoals } from '../lib/suggest'
import { KINDS, blocksOf, guessKind, removeReview, sessionLength, suggestLength } from '../lib/learning'
import { removeGoal, saveGoal, savePlanSettings } from '../lib/edit'
import { DEFAULT_MAX_LOAD, activeWeek, planSettings, planWeek, subjectNames } from '../lib/plan'
import { RoutinesEditor } from './RoutinesEditor'
import { DAYS, DAY_NAMES, addDays, dateOfDay, fromTimeInput, isoDate, toTimeInput } from '../lib/time'
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
  // שבוע שכבר אין בו זמן לתכנן (מוצאי שבת): חוסר שעות הוא לא בעיה של היעד
  const [openedAt] = useState(() => new Date())
  const weekOver = activeWeek(draft, openedAt).weekStart.getTime() > weekStart.getTime()
  const settings = planSettings(draft)
  const subjects = useMemo(() => subjectNames(draft.lessons), [draft.lessons])
  const prefs = useMemo(() => learnedPrefs(draft), [draft])
  const day0 = today ?? dateOfDay(weekStart, 0)
  const dm = (iso: string) => `${Number(iso.slice(8))}.${Number(iso.slice(5, 7))}`

  const updateGoal = (g: Goal, patch: Partial<Goal>) => setDraft((d) => saveGoal(d, { ...g, ...patch }))
  /** בחירת סוג למידה: גם אורך המפגש ומספר המפגשים ביום מתאימים את עצמם לסוג */
  const pickKind = (g: Goal, k: GoalKind | undefined) =>
    updateGoal(g, k ? { kind: k, sessionMinutes: KINDS[k].session, maxPerDay: KINDS[k].maxPerDay } : { kind: undefined })
  // היעדים שהגדרתי, ועוד תרגול אוטומטי לכל מקצוע שאין לו יעד. שינוי ביעד אוטומטי הופך אותו לשלי
  const goalList = useMemo(() => allGoals(draft), [draft])
  const offSubjects = settings.autoOff ?? []
  const setAutoOff = (list: string[]) => setPlan({ autoOff: list.length ? list : undefined })
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

          {goalList.some((g) => g.auto) && (
            <p className="whoami-auto">
              לכל מקצוע שאתה לומד יש תרגול אוטומטי: כחצי מזמן השיעורים בשבוע, בין 2 ל-5 שעות. יעד שאתה משנה הופך לשלך
              ומקבל עדיפות; התרגול האוטומטי מקבל את מה שנשאר.
            </p>
          )}
          {goalList.length === 0 && <p>עוד אין יעדים. הוסף יעד ראשון, למשל "תרגול פיזיקה, 4 שעות".</p>}

          {goalList.map((g) => {
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
                    {g.auto && <span className="goal-kind">אוטומטי</span>}
                  </span>
                  <span className={short ? 'goal-status is-short' : 'goal-status'}>
                    {r
                      ? `${hours(r.planned)} מתוך ${hours(r.min)}–${hours(r.max)} שעות השבוע${r.done ? `, בוצעו ${hours(r.done)}` : ''}${r.reviews ? `, חזרות ${r.reviewsDone} מתוך ${r.reviews}` : ''}`
                      : ''}
                  </span>
                </button>
                {r?.boost && <p className="whoami-auto">{r.boost}: התרגול השבוע גדל פי 1.5.</p>}
                {r?.priority && (
                  <p className="whoami-auto">
                    לפי הציונים: {r.priority.reason}.
                    {r.priority.factor && Math.abs(r.priority.factor - 1) >= 0.05
                      ? ` התרגול האוטומטי ${r.priority.factor > 1 ? 'גדל' : 'קטן'} ל-${Math.round(r.priority.factor * 100)}%.`
                      : ''}
                  </p>
                )}
                {r?.deadline && (
                  <p className="whoami-auto">
                    {r.deadline.passed
                      ? `תאריך היעד (${dm(r.deadline.date)}) עבר.`
                      : r.deadline.remainingHours <= 0
                        ? 'הגעת לסך השעות. כל הכבוד!'
                        : `נשארו ${hours(r.deadline.remainingHours * 60)} שעות עד ${dm(r.deadline.date)}, ומתחלקות שווה על הימים שנותרו.${r.deadline.buffer ? ` התכנון מכוון לסיים קודם, ומשאיר את ${dm(r.deadline.buffer)} כיום ביטחון.` : ''}`}
                  </p>
                )}
                {!!r?.missed && (
                  <p className="muted">
                    {hours(r.missed)} שעות שתוכננו לזמן שעבר לא סומנו. התכנון השלים אותן בהמשך השבוע; אם תרגלת בכל זאת,
                    לחץ על המפגש בלוח וסמן.
                  </p>
                )}
                {!!r?.rearranged && (
                  <p className="muted">כדי שהיעד יגיע למינימום, התכנון הזיז {r.rearranged === 1 ? 'מפגש אחד' : `${r.rearranged} מפגשים`} של יעדים אחרים.</p>
                )}
                {short && weekOver && (
                  <p className="muted">השבוע הזה כבר נגמר, ולא מתכננים לזמן שעבר. בשבוע הבא היעד ישובץ כרגיל.</p>
                )}
                {short && !weekOver && (
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
                              onChange={() => pickKind(g, k)}
                            />
                            <span>{k ? KINDS[k].label : 'בלי סוג'}</span>
                          </label>
                        ))}
                      </div>
                      {(() => {
                        // הצעה לפי השם, רק כשעוד לא נבחר סוג
                        const guess = g.kind ? null : guessKind(g.name)
                        return (
                          guess && (
                            <p className="whoami-auto kind-guess">
                              נראה כמו {KINDS[guess.kind].label}, כי בשם כתוב "{guess.word}".{' '}
                              <button type="button" className="link-btn" onClick={() => pickKind(g, guess.kind)}>
                                לבחור {KINDS[guess.kind].label}
                              </button>
                            </p>
                          )
                        )
                      })()}
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
                    <fieldset className="kind-pick">
                      <legend>כמה זמן</legend>
                      <div className="whoami-chips">
                        <label className="chip">
                          <input
                            type="radio"
                            name={`mode-${g.id}`}
                            checked={!g.deadline}
                            onChange={() => updateGoal(g, { deadline: undefined, totalHours: undefined })}
                          />
                          <span>שעות בכל שבוע</span>
                        </label>
                        <label className="chip">
                          <input
                            type="radio"
                            name={`mode-${g.id}`}
                            checked={!!g.deadline}
                            onChange={() =>
                              updateGoal(g, {
                                deadline: isoDate(addDays(new Date(`${day0}T00:00:00`), 30)),
                                totalHours: g.totalHours ?? Math.max(1, g.minHoursPerWeek * 4),
                              })
                            }
                          />
                          <span>סך שעות עד תאריך</span>
                        </label>
                      </div>
                      {g.deadline && (
                        <p className="muted">
                          לעבודה, פרויקט או הכנה למבחן: מה שנשאר מתחלק שווה על הימים עד התאריך, ומתעדכן לפי מה שסימנת.
                        </p>
                      )}
                    </fieldset>
                    {g.deadline ? (
                      <div className="edit-row">
                        <label className="field">
                          <span>סך הכול שעות</span>
                          <input
                            type="number"
                            min={0.5}
                            max={500}
                            step={0.5}
                            value={g.totalHours ?? 0}
                            onChange={(e) => updateGoal(g, { totalHours: Math.max(0.5, Number(e.target.value) || 0.5) })}
                          />
                        </label>
                        <label className="field">
                          <span>עד תאריך (כולל)</span>
                          <input
                            type="date"
                            value={g.deadline}
                            onChange={(e) => e.target.value && updateGoal(g, { deadline: e.target.value })}
                          />
                        </label>
                      </div>
                    ) : (
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
                    )}
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
                      const sug = suggestLength(draft, g)
                      return sug ? (
                        <p className="whoami-auto">
                          ב-{sug.from} המפגשים האחרונים תרגלת בדרך כלל כ-{sug.minutes} דקות, ולא {sessionLength(g)}. מפגש באורך
                          שבאמת קורה עדיף על תוכנית שלא עומדים בה.{' '}
                          <button type="button" className="link-btn" onClick={() => updateGoal(g, { sessionMinutes: sug.minutes })}>
                            לקבוע {sug.minutes} דקות
                          </button>
                        </p>
                      ) : null
                    })()}
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
                        if (g.auto && g.subject) setAutoOff([...offSubjects, g.subject])
                        else setDraft((d) => removeGoal(d, g.id))
                        setOpenId(null)
                      }}
                    >
                      {g.auto ? 'בלי תרגול במקצוע הזה' : g.id.startsWith('auto-') ? 'חזרה לתרגול האוטומטי' : 'מחיקת היעד'}
                    </button>
                  </div>
                )}
              </article>
            )
          })}

          {offSubjects.length > 0 && (
            <p className="muted">
              בלי תרגול אוטומטי:{' '}
              {offSubjects.map((x, k) => (
                <span key={x}>
                  {k > 0 && ', '}
                  {x}{' '}
                  <button type="button" className="link-btn" onClick={() => setAutoOff(offSubjects.filter((y) => y !== x))}>
                    (להחזיר)
                  </button>
                </span>
              ))}
            </p>
          )}

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
              <label className="field">
                <span>שעות ביום בסך הכול (שיעורים ותרגול)</span>
                <input
                  type="number"
                  min={2}
                  max={16}
                  value={settings.maxLoadPerDay ?? DEFAULT_MAX_LOAD}
                  onChange={(e) => setPlan({ maxLoadPerDay: Math.min(16, Math.max(2, Number(e.target.value) || DEFAULT_MAX_LOAD)) })}
                />
              </label>
              <label className="field">
                <span>נסיעה למוסד (לכל כיוון)</span>
                <select
                  value={settings.travelMinutes ?? 0}
                  onChange={(e) => setPlan({ travelMinutes: Number(e.target.value) })}
                >
                  {[0, 10, 15, 20, 30, 45, 60, 75, 90].map((m) => (
                    <option key={m} value={m}>
                      {m ? `${m} דקות` : 'בלי'}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="muted">
              ביום עמוס בשיעורים התכנון שם פחות תרגול. הנסיעה נשמרת לפני השיעור הראשון ואחרי האחרון; בין שיעורים נשארים
              במוסד.
            </p>
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

          <RoutinesEditor settings={settings} setPlan={setPlan} date={day0} />
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
