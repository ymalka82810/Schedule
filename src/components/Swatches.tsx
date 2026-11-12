import type { ColorKey } from '../types'
import { COLORS, COLOR_NAMES } from '../lib/edit'

/** בחירת צבע מתוך צבעי המקצועות */
export function Swatches({ value, onChange, name }: { value: ColorKey; onChange: (c: ColorKey) => void; name: string }) {
  return (
    <fieldset className="color-set">
      <legend>צבע</legend>
      <div className="color-swatches">
        {COLORS.map((c) => (
          <label key={c} className={`swatch c-${c}`} title={COLOR_NAMES[c]}>
            <input
              type="radio"
              name={name}
              className="visually-hidden"
              checked={value === c}
              onChange={() => onChange(c)}
            />
            <span className="visually-hidden">{COLOR_NAMES[c]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
