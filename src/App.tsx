import { useEffect, useMemo, useState } from 'react'
import type { DayIndex } from './types'
import { ImportDialog } from './components/ImportDialog'
import { WeekGrid } from './components/WeekGrid'
import { buildBlocks, visibleRange } from './lib/layout'
import {
  loadBackup,
  loadData,
  loadTheme,
  saveBackup,
  saveData,
  saveTheme,
  type Theme,
} from './lib/storage'
import { addDays, formatWeekRange, isSameDay, startOfWeek } from './lib/time'

export default function App() {
  const [data, setData] = useState(loadData)
  const [importing, setImporting] = useState(false)
  const [hasBackup, setHasBackup] = useState(() => loadBackup() !== null)
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

  const isThisWeek = isSameDay(weekStart, startOfWeek(now))
  const goToThisWeek = () => {
    setWeekStart(startOfWeek(now))
    setSelectedDay(now.getDay() as DayIndex)
  }

  const handleImport = (next: typeof data) => {
    saveBackup(data)
    saveData(next)
    setData(next)
    setHasBackup(true)
    setImporting(false)
  }

  const handleRestore = () => {
    const backup = loadBackup()
    if (!backup) return
    saveBackup(data)
    saveData(backup)
    setData(backup)
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
        </div>
      </header>

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
          hasBackup={hasBackup}
          onSave={handleImport}
          onRestore={handleRestore}
          onClose={() => setImporting(false)}
        />
      )}

      <footer className="foot">המכינה להנדסה ומחשבים, לפי המערכת המעודכנת ל-18.10.2026.</footer>
    </div>
  )
}
