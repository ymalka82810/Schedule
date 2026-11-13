import type { PlanSettings, Routine, TimeRef, Zman } from '../types'
import { CITIES, ROUTINE_PRESETS, ZMAN_NAMES, describeRef, resolveTime } from '../lib/routines'
import { formatTime, fromTimeInput, toTimeInput } from '../lib/time'
import { newId } from '../lib/edit'
import { DayPicker } from './DayPicker'

interface Props {
  settings: PlanSettings
  setPlan: (patch: Partial<PlanSettings>) => void
  /** YYYY-MM-DD, לתצוגה של השעות בפועל היום */
  date: string
}

const ZMANIM = Object.keys(ZMAN_NAMES) as Zman[]

/** עוגן של שעה: שעה קבועה או זמן מזמני היום עם הזזה */
function RefField({ label, value, onChange }: { label: string; value: TimeRef; onChange: (r: TimeRef) => void }) {
  const isZman = 'zman' in value
  return (
    <div className="routine-ref">
      <label className="field">
        <span>{label}</span>
        <select
          value={isZman ? value.zman : 'at'}
          onChange={(e) => {
            const v = e.target.value
            if (v === 'at') onChange({ at: 'at' in value ? value.at : 12 * 60 })
            else onChange({ zman: v as Zman, offset: isZman ? value.offset : 0 })
          }}
        >
          <option value="at">שעה קבועה</option>
          {ZMANIM.map((z) => (
            <option key={z} value={z}>
              {ZMAN_NAMES[z]}
            </option>
          ))}
        </select>
      </label>
      {isZman ? (
        <label className="field">
          <span>דקות לפני (-) או אחרי</span>
          <input
            type="number"
            step={5}
            min={-240}
            max={240}
            value={value.offset}
            onChange={(e) => onChange({ zman: value.zman, offset: Number(e.target.value) || 0 })}
          />
        </label>
      ) : (
        <label className="field">
          <span>שעה</span>
          <input
            type="time"
            value={toTimeInput(value.at)}
            onChange={(e) => {
              const m = fromTimeInput(e.target.value)
              if (m !== null) onChange({ at: m })
            }}
          />
        </label>
      )}
    </div>
  )
}

/**
 * שגרות קבועות: ארוחות ותפילות. כל אחת צריכה כמה דקות בתוך חלון,
 * והתכנון שומר לה מקום ולא משבץ שם תרגול.
 */
export function RoutinesEditor({ settings, setPlan, date }: Props) {
  const routines = settings.routines ?? []
  const save = (list: Routine[]) => setPlan({ routines: list })
  const update = (r: Routine, patch: Partial<Routine>) => save(routines.map((x) => (x.id === r.id ? { ...r, ...patch } : x)))
  const add = (preset: Omit<Routine, 'id'>) =>
    save([...routines, { ...preset, id: newId('rt', routines.map((x) => x.id)) }])
  const usesZmanim = routines.some((r) => 'zman' in r.from || 'zman' in r.to)
  const missing = ROUTINE_PRESETS.filter((p) => !routines.some((r) => r.name === p.name))

  return (
    <fieldset className="whoami-set">
      <legend>ארוחות, תפילות ושגרות</legend>
      <p className="muted">
        לכל שגרה חלון זמן וכמה דקות היא צריכה. התכנון מוצא לה מקום בחלון, צמוד לשיעור אם אפשר, ולא משבץ שם תרגול. אם כל
        החלון תפוס בשיעורים, השגרה לא נשמרת באותו יום.
      </p>

      {routines.map((r) => {
        const from = resolveTime(r.from, date, settings.location)
        const to = resolveTime(r.to, date, settings.location)
        return (
          <article key={r.id} className="routine">
            <div className="edit-row">
              <label className="field">
                <span>שם</span>
                <input type="text" value={r.name} onChange={(e) => update(r, { name: e.target.value })} />
              </label>
              <label className="field goal-narrow">
                <span>דקות</span>
                <input
                  type="number"
                  min={5}
                  max={240}
                  step={5}
                  value={r.minutes}
                  onChange={(e) => update(r, { minutes: Math.max(5, Number(e.target.value) || 5) })}
                />
              </label>
              <button
                type="button"
                className="link-btn"
                onClick={() => save(routines.filter((x) => x.id !== r.id))}
                aria-label={`הסרת ${r.name}`}
              >
                הסרה
              </button>
            </div>
            <div className="edit-row">
              <RefField label="מ-" value={r.from} onChange={(v) => update(r, { from: v })} />
              <RefField label="עד" value={r.to} onChange={(v) => update(r, { to: v })} />
            </div>
            <p className="muted">
              {describeRef(r.from)} עד {describeRef(r.to)}
              {from !== null && to !== null && (
                <>
                  {' '}
                  (היום:{' '}
                  <bdi dir="ltr">
                    {formatTime(from)}–{formatTime(to)}
                  </bdi>
                  )
                </>
              )}
              {from !== null && to !== null && to - from < r.minutes && (
                <span className="import-error"> החלון קצר מ-{r.minutes} דקות.</span>
              )}
            </p>
            <DayPicker legend="בימים" value={r.days} onChange={(days) => update(r, { days })} />
          </article>
        )
      })}

      {missing.length > 0 && (
        <div className="whoami-chips">
          {missing.map((p) => (
            <button key={p.name} type="button" className="chip chip-btn" onClick={() => add(p)}>
              ＋ {p.name}
            </button>
          ))}
          <button
            type="button"
            className="chip chip-btn"
            onClick={() => add({ name: 'שגרה', days: [0, 1, 2, 3, 4], from: { at: 12 * 60 }, to: { at: 13 * 60 }, minutes: 30 })}
          >
            ＋ אחר
          </button>
        </div>
      )}

      {usesZmanim && (
        <label className="field goal-narrow">
          <span>עיר לזמני היום</span>
          <select value={settings.location ?? 'Jerusalem'} onChange={(e) => setPlan({ location: e.target.value })}>
            {CITIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.he}
              </option>
            ))}
          </select>
        </label>
      )}
    </fieldset>
  )
}
