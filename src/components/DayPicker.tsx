import type { DayIndex } from '../types'
import { DAYS, DAY_NAMES } from '../lib/time'

/** בחירת כמה ימים בשבוע, כצ'יפים */
export function DayPicker({
  value,
  onChange,
  legend,
  hideShabbat,
}: {
  value: DayIndex[]
  onChange: (days: DayIndex[]) => void
  legend: string
  hideShabbat?: boolean
}) {
  const days = hideShabbat ? DAYS.filter((d) => d !== 6) : DAYS
  return (
    <fieldset className="color-set">
      <legend>{legend}</legend>
      <div className="whoami-chips">
        {days.map((d) => (
          <label key={d} className="chip chip-day">
            <input
              type="checkbox"
              checked={value.includes(d)}
              onChange={(e) =>
                onChange(e.target.checked ? [...value, d].sort((a, b) => a - b) : value.filter((x) => x !== d))
              }
            />
            <span>{DAY_NAMES[d]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
