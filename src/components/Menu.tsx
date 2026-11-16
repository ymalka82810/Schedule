import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

export interface MenuItem {
  label: string
  /** שורת הסבר קטנה מתחת לשם */
  hint?: string
  onSelect: () => void
  danger?: boolean
}

interface Props {
  /** מה שכתוב על הכפתור */
  label: ReactNode
  /** שם לקורא מסך, כשהכפתור הוא רק סימן */
  ariaLabel?: string
  items: MenuItem[]
  /** שורה מעל הפריטים, למשל המייל המחובר */
  header?: ReactNode
  primary?: boolean
  /** לאיזה צד התפריט נפתח: start = צמוד לתחילת הכפתור (ימין בעברית) */
  align?: 'start' | 'end'
}

/** כפתור שפותח תפריט קטן. נסגר בלחיצה בחוץ, ב-Escape ואחרי בחירה. חצים עוברים בין הפריטים */
export function Menu({ label, ariaLabel, items, header, primary, align = 'start' }: Props) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
        button.current?.focus()
        return
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      const list = [...(root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])]
      if (!list.length) return
      e.preventDefault()
      const at = list.indexOf(document.activeElement as HTMLButtonElement)
      const next = e.key === 'ArrowDown' ? (at + 1) % list.length : (at - 1 + list.length) % list.length
      list[next].focus()
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  return (
    <div className="menu" ref={root}>
      <button
        ref={button}
        type="button"
        className={`btn${primary ? ' btn-primary' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
      </button>
      {open && (
        <div id={id} className={`menu-list is-${align}`} role="menu">
          {header && <div className="menu-header">{header}</div>}
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={`menu-item${item.danger ? ' is-danger' : ''}`}
              onClick={() => {
                setOpen(false)
                item.onSelect()
              }}
            >
              <span>{item.label}</span>
              {item.hint && <span className="menu-hint">{item.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
