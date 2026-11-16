import { useEffect } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'

/** הדיאלוג העליון שפתוח עכשיו */
const topDialog = () => {
  const all = document.querySelectorAll<HTMLElement>('[role="dialog"]')
  return all.length ? all[all.length - 1] : null
}

const focusable = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0)

/**
 * התנהגות משותפת לכל דיאלוג:
 * נסגר ב-Escape, Tab נשאר בתוך הדיאלוג, המיקוד נכנס אליו בפתיחה, וחוזר למקום שממנו נפתח בסגירה.
 */
export function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const dialog = topDialog()
      if (!dialog) return
      const items = focusable(dialog)
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      const at = document.activeElement as HTMLElement | null
      if (!at || !dialog.contains(at)) {
        e.preventDefault()
        first.focus()
      } else if (e.shiftKey && at === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && at === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // מיקוד: פעם אחת בפתיחה ופעם אחת בסגירה
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const dialog = topDialog()
    // שדה עם autoFocus כבר קיבל מיקוד. אחרת ממקדים את הדיאלוג עצמו, כדי שקורא מסך יקריא את הכותרת
    if (dialog && !dialog.contains(document.activeElement)) {
      if (!dialog.hasAttribute('tabindex')) dialog.tabIndex = -1
      dialog.focus({ preventScroll: true })
    }
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    }
  }, [])
}
