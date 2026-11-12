import { useEffect, useMemo, useState } from 'react'
import type { DayIndex, ScheduleData } from './types'
import type { Account } from './auth/account'
import { ImportDialog } from './components/ImportDialog'
import { WeekGrid } from './components/WeekGrid'
import { buildBlocks, visibleRange } from './lib/layout'
import { loadTheme, saveTheme, type Theme } from './lib/storage'
import { addDays, formatWeekRange, isSameDay, startOfWeek } from './lib/time'

interface Props {
  initialData: ScheduleData
  /** המערכת שלפני הייבוא האחרון, לשחזור */
  initialBackup: ScheduleData | null
  account: Account
  /** נקרא בכל שינוי בנתונים. רק אצל הבעלים, כדי לשמור בשרת */
  onPersist?: (data: ScheduleData, backup: ScheduleData | null) => void
}

export default function App({ initialData, initialBackup, account, onPersist }: Props) {
  const [data, setData] = useState(initialData)
  const [backup, setBackup] = useState(initialBackup)
  const [importing, setImporting] = useState(false)
  const [theme, setTheme] = useState<Theme>(loadTheme)
  const [now, setNow] = useState(() => new Date())
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [selectedDay, setSelectedDay] = useState<DayIndex>(() => new Date().getDay() as DayIndex)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    saveTheme(theme)
  }, [theme])

  // מעדכן את קו ה"עכשיו" פעם בדקה
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  const blocks = useMemo(() => buildBlocks(data), [data])
  const range = useMemo(() => visibleRange(data, blocks), [data, blocks])
  const isEmpty = blocks.length === 0

  const isThisWeek = isSameDay(weekStart, startOfWeek(now))
  const goToThisWeek = () => {
    setWeekStart(startOfWeek(now))
    setSelectedDay(now.getDay() as DayIndex)
  }

  /** כל שינוי בנתונים עובר כאן: מתעדכן בזיכרון, ואצל הבעלים גם נשמר בשרת */
  const commit = (next: ScheduleData, nextBackup: ScheduleData | null) => {
    setData(next)
    setBackup(nextBackup)
    onPersist?.(next, nextBackup)
  }

  const handleImport = (next: ScheduleData) => {
    commit(next, data)
    setImporting(false)
  }

  const handleRestore = () => {
    if (!backup) return
    commit(backup, data)
    setImporting(false)
  }

  return (
    <div className="app">
      <header className="top">
        <div className="top-title">
          <h1>המערכת שלי</h1>
          <p className="top-range">{formatWeekRange(weekStart)}</p>
        </div>

        <div className="top-actions">
          <div className="week-nav">
            <button
              type="button"
              className="btn btn-icon"
              aria-label="השבוע הקודם"
              onClick={() => setWeekStart((w) => addDays(w, -7))}
            >
              ›
            </button>
            <button type="button" className="btn" onClick={goToThisWeek} disabled={isThisWeek}>
              השבוע
            </button>
            <button
              type="button"
              className="btn btn-icon"
              aria-label="השבוע הבא"
              onClick={() => setWeekStart((w) => addDays(w, 7))}
            >
              ‹
            </button>
          </div>

          <button type="button" className="btn" onClick={() => setImporting(true)}>
            ייבוא מקובץ PDF
          </button>

          <button
            type="button"
            className="btn"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          >
            {theme === 'dark' ? 'מצב בהיר' : 'מצב כהה'}
          </button>

          {account.kind === 'guest' && (
            <button type="button" className="btn" onClick={account.signIn}>
              כניסה (בעלים)
            </button>
          )}
          {account.kind === 'owner' && (
            <button type="button" className="btn" onClick={account.signOut}>
              התנתקות
            </button>
          )}
        </div>
      </header>

      {account.kind === 'owner' ? (
        <p className="mode-note is-owner">
          מחובר כ-<bdi dir="ltr">{account.email}</bdi>. המערכת נשמרת בשרת.
        </p>
      ) : (
        <p className="mode-note">
          סביבת בדיקה: הכול נשמר רק בזיכרון של הדף ויימחק ברענון. אין חיבור לשום חשבון.
        </p>
      )}

      {isEmpty && (
        <section className="empty-state" aria-label="הלוח ריק">
          <p>הלוח ריק. אפשר לייבא מערכת מקובץ PDF כדי לראות איך זה עובד.</p>
          <button type="button" className="btn btn-primary" onClick={() => setImporting(true)}>
            ייבוא מקובץ PDF
          </button>
        </section>
      )}

      <WeekGrid
        weekStart={weekStart}
        blocks={blocks}
        range={range}
        now={now}
        selectedDay={selectedDay}
        onSelectDay={setSelectedDay}
      />

      {importing && (
        <ImportDialog
          current={data}
          hasBackup={backup !== null}
          memoryOnly={account.kind !== 'owner'}
          onSave={handleImport}
          onRestore={handleRestore}
          onClose={() => setImporting(false)}
        />
      )}
    </div>
  )
}
