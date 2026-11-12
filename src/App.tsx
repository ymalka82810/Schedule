import { useEffect, useMemo, useState } from 'react'
import type { DayIndex, ScheduleData } from './types'
import type { Account } from './auth/account'
import { ImportDialog } from './components/ImportDialog'
import { LessonDialog, type LessonDialogMode } from './components/LessonDialog'
import { EventDialog, SessionDialog } from './components/EventDialogs'
import { GoalsDialog } from './components/GoalsDialog'
import { Today } from './components/Today'
import { planWeek, type PlannedSession } from './lib/plan'
import type { Goal, OneOffEvent } from './types'
import { LoginDialog } from './components/LoginDialog'
import { resolveBlock } from './lib/edit'
import { WeekGrid } from './components/WeekGrid'
import { buildBlocks, visibleRange } from './lib/layout'
import { loadTheme, saveTheme, type Theme } from './lib/storage'
import { addDays, dateOfDay, formatWeekRange, isSameDay, isoDate, startOfWeek } from './lib/time'

type Dialog =
  | { kind: 'lesson'; mode: LessonDialogMode; date?: string }
  | { kind: 'event'; event: OneOffEvent | { date: string } }
  | { kind: 'session'; session: PlannedSession; goal: Goal }
  | { kind: 'goals' }

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
  const [loggingIn, setLoggingIn] = useState(false)
  const [dialog, setDialog] = useState<Dialog | null>(null)
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

  // התכנון של הזמן הפנוי מחושב מחדש לכל שבוע: אירועים וביטולים משנים אותו
  const plan = useMemo(() => planWeek(data, weekStart), [data, weekStart])
  const blocks = useMemo(() => buildBlocks(data, { weekStart, plan: plan.sessions }), [data, weekStart, plan])

  // לכרטיס "היום": תמיד השבוע של היום והשבוע שאחריו, בלי קשר לשבוע המוצג
  const thisWeek = useMemo(() => startOfWeek(now), [now])
  const todayBlocks = useMemo(
    () => buildBlocks(data, { weekStart: thisWeek, plan: planWeek(data, thisWeek).sessions }),
    [data, thisWeek],
  )
  const nextWeekBlocks = useMemo(() => {
    const w = addDays(thisWeek, 7)
    return buildBlocks(data, { weekStart: w, plan: planWeek(data, w).sessions })
  }, [data, thisWeek])
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

  /** עריכה מהלוח לא נוגעת בגיבוי שלפני הייבוא */
  const handleEdit = (next: ScheduleData) => {
    commit(next, backup)
    setDialog(null)
  }

  const openBlock = (blockId: string) => openBlockIn(blockId, weekStart)

  function openBlockIn(blockId: string, week: Date) {
    const sessions = week === weekStart ? plan.sessions : planWeek(data, week).sessions
    const target = resolveBlock(data, blockId, sessions)
    if (!target) return
    if (target.kind === 'event') setDialog({ kind: 'event', event: target.event })
    else if (target.kind === 'plan') setDialog({ kind: 'session', session: target.session, goal: target.goal })
    else {
      const day = target.kind === 'entry' ? target.entry.slot.day : target.kind === 'choice' ? target.group.slot.day : target.window.slot.day
      setDialog({ kind: 'lesson', mode: { kind: 'edit', target }, date: dateOfDay(week, day) })
    }
  }

  const newEventDate = () => {
    const today = isoDate(now)
    const day = dateOfDay(weekStart, selectedDay)
    return isThisWeek && day < today ? today : day
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
          {data.source?.versionDate && (
            <p className="muted">לפי המערכת המעודכנת ל-{data.source.versionDate}</p>
          )}
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

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setDialog({ kind: 'lesson', mode: { kind: 'new', day: selectedDay } })}
          >
            ＋ שיעור
          </button>

          <button type="button" className="btn" onClick={() => setDialog({ kind: 'event', event: { date: newEventDate() } })}>
            ＋ אירוע
          </button>

          <button type="button" className="btn" onClick={() => setDialog({ kind: 'goals' })}>
            יעדים
          </button>

          <button type="button" className="btn" onClick={() => setImporting(true)}>
            ייבוא וגיבוי
          </button>

          <button type="button" className="btn" onClick={() => window.print()}>
            הדפסה
          </button>

          <button
            type="button"
            className="btn"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          >
            {theme === 'dark' ? 'מצב בהיר' : 'מצב כהה'}
          </button>

          {account.kind === 'guest' && (
            <button type="button" className="btn" onClick={() => setLoggingIn(true)}>
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

      {!isEmpty && (
        <Today
          blocks={todayBlocks}
          nextWeekBlocks={nextWeekBlocks}
          now={now}
          onOpen={(id) => {
            if (!isThisWeek) goToThisWeek()
            openBlockIn(id, thisWeek)
          }}
        />
      )}

      {isEmpty && (
        <section className="empty-state" aria-label="הלוח ריק">
          <p>הלוח ריק. אפשר לייבא מערכת מקובץ PDF, או להוסיף שיעורים בעצמך.</p>
          <div className="import-actions">
            <button type="button" className="btn btn-primary" onClick={() => setImporting(true)}>
              ייבוא מקובץ PDF
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setDialog({ kind: 'lesson', mode: { kind: 'new', day: selectedDay } })}
            >
              הוספת שיעור
            </button>
          </div>
        </section>
      )}

      <WeekGrid
        weekStart={weekStart}
        blocks={blocks}
        range={range}
        now={now}
        selectedDay={selectedDay}
        onSelectDay={setSelectedDay}
        onBlockClick={openBlock}
      />

      {dialog?.kind === 'lesson' && (
        <LessonDialog
          data={data}
          mode={dialog.mode}
          date={dialog.date}
          onSave={handleEdit}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'event' && (
        <EventDialog data={data} event={dialog.event} onSave={handleEdit} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'session' && (
        <SessionDialog
          data={data}
          date={dateOfDay(weekStart, dialog.session.day)}
          onSave={handleEdit}
          session={dialog.session}
          goal={dialog.goal}
          onEditGoals={() => setDialog({ kind: 'goals' })}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'goals' && (
        <GoalsDialog data={data} weekStart={weekStart} onSave={handleEdit} onClose={() => setDialog(null)} />
      )}

      {loggingIn && account.kind === 'guest' && (
        <LoginDialog
          sendCode={account.sendCode}
          verifyCode={account.verifyCode}
          onClose={() => setLoggingIn(false)}
        />
      )}

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
