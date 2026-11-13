import { useEffect, useMemo, useState } from 'react'
import type { DayIndex, Minutes, ScheduleData, Slot } from './types'
import type { Account } from './auth/account'
import { ImportDialog } from './components/ImportDialog'
import { LessonDialog, type LessonDialogMode } from './components/LessonDialog'
import { EventDialog, SessionDialog } from './components/EventDialogs'
import { GoalsDialog } from './components/GoalsDialog'
import { Today } from './components/Today'
import { breakOn, planWeek, type PlannedSession } from './lib/plan'
import type { Goal, OneOffEvent } from './types'
import { LoginDialog } from './components/LoginDialog'
import {
  clearMove,
  moveForever,
  moveOnce,
  refIdOf,
  resolveBlock,
  saveEvent,
  setActivityDays,
  siblings,
  snoozeVersionReminder,
  versionAge,
  slotOf,
  type BlockTarget,
} from './lib/edit'
import { MoveDialog } from './components/MoveDialog'
import { learnedPrefs, movePlanned } from './lib/prefs'
import { moveOf } from './lib/plan'
import { WeekGrid } from './components/WeekGrid'
import { buildBlocks, visibleRange } from './lib/layout'
import { loadTheme, saveTheme, type Theme } from './lib/storage'
import { savedAtDate } from './auth/offlineCache'
import { addDays, dateOfDay, formatWeekRange, isSameDay, isoDate, startOfWeek } from './lib/time'

type Dialog =
  | { kind: 'lesson'; mode: LessonDialogMode; date?: string }
  | { kind: 'event'; event: OneOffEvent | { date: string } }
  | { kind: 'session'; session: PlannedSession; goal: Goal }
  | { kind: 'goals' }
  | {
      kind: 'move'
      target: BlockTarget
      name: string
      refId: string
      date: string
      from: Slot
      to: Slot
      alreadyMoved: boolean
      siblings: number
    }

interface Props {
  initialData: ScheduleData
  /** המערכת שלפני הייבוא האחרון, לשחזור */
  initialBackup: ScheduleData | null
  account: Account
  /** נקרא בכל שינוי בנתונים. רק אצל הבעלים, כדי לשמור בשרת (או במכשיר, בלי חיבור) */
  onPersist?: (data: ScheduleData, backup: ScheduleData | null) => void
  /** הודעה להציג בפתיחה, למשל שהשינויים מהמכשיר נשלחו לשרת */
  initialToast?: string
}

export default function App({ initialData, initialBackup, account, onPersist, initialToast }: Props) {
  const [data, setData] = useState(initialData)
  const [backup, setBackup] = useState(initialBackup)
  const [importing, setImporting] = useState(false)
  const [loggingIn, setLoggingIn] = useState(false)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  /** היסטוריה לביטול פעולה, רק בזיכרון של הדף */
  const [history, setHistory] = useState<Array<{ data: ScheduleData; backup: ScheduleData | null; label: string }>>([])
  const [toast, setToast] = useState<string | null>(initialToast ?? null)
  /** בלי חיבור: האם נעשו כאן שינויים שממתינים לשרת */
  const [offlineEdits, setOfflineEdits] = useState(account.kind === 'offline' && !!account.pending)
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
  const todayIso = isoDate(now)
  // עכשיו, ברבעי שעה: מה שעבר לא מתוכנן, ומה שפוספס עובר להמשך. התכנון מתעדכן כל רבע שעה
  const nowMin = Math.floor((now.getHours() * 60 + now.getMinutes()) / 15) * 15
  const plan = useMemo(() => planWeek(data, weekStart, todayIso, nowMin), [data, weekStart, todayIso, nowMin])
  const blocks = useMemo(
    () => buildBlocks(data, { weekStart, plan: plan.sessions, reserved: plan.reserved }),
    [data, weekStart, plan],
  )

  const dayNotes = useMemo(() => {
    const out: Partial<Record<DayIndex, string>> = {}
    for (const d of [0, 1, 2, 3, 4, 5, 6] as DayIndex[]) {
      const b = breakOn(data, dateOfDay(weekStart, d))
      if (b) out[d] = b.title
    }
    return out
  }, [data, weekStart])

  // לכרטיס "היום": תמיד השבוע של היום והשבוע שאחריו, בלי קשר לשבוע המוצג
  const thisWeek = useMemo(() => startOfWeek(now), [now])
  const todayBlocks = useMemo(
    () => {
      const p = planWeek(data, thisWeek, todayIso, nowMin)
      // בכרטיס "היום" גם הארוחה או התפילה הבאה, בלי הנסיעות
      return buildBlocks(data, { weekStart: thisWeek, plan: p.sessions, reserved: p.reserved.filter((r) => r.kind === 'routine') })
    },
    [data, thisWeek, todayIso, nowMin],
  )
  const nextWeekBlocks = useMemo(() => {
    const w = addDays(thisWeek, 7)
    const p = planWeek(data, w, todayIso, nowMin)
    return buildBlocks(data, { weekStart: w, plan: p.sessions, reserved: p.reserved.filter((r) => r.kind === 'routine') })
  }, [data, thisWeek, todayIso, nowMin])
  const range = useMemo(() => visibleRange(data, blocks), [data, blocks])
  const isEmpty = blocks.length === 0
  const versionDays = useMemo(() => versionAge(data, todayIso), [data, todayIso])

  const isThisWeek = isSameDay(weekStart, startOfWeek(now))
  const goToThisWeek = () => {
    setWeekStart(startOfWeek(now))
    setSelectedDay(now.getDay() as DayIndex)
  }

  /** כל שינוי בנתונים עובר כאן: מתעדכן בזיכרון, ואצל הבעלים גם נשמר בשרת */
  const commit = (next: ScheduleData, nextBackup: ScheduleData | null, label = 'השינוי נשמר') => {
    setHistory((h) => [...h.slice(-19), { data, backup, label }])
    setToast(label)
    setData(next)
    setBackup(nextBackup)
    onPersist?.(next, nextBackup)
    if (account.kind === 'offline') setOfflineEdits(true)
  }

  const undo = () => {
    const last = history[history.length - 1]
    if (!last) return
    setHistory((h) => h.slice(0, -1))
    setData(last.data)
    setBackup(last.backup)
    onPersist?.(last.data, last.backup)
    setToast(null)
  }

  // ההודעה נעלמת אחרי כמה שניות
  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 7000)
    return () => window.clearTimeout(t)
  }, [toast, history.length])

  // Ctrl+Z מחוץ לשדות טקסט
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey && !/INPUT|TEXTAREA|SELECT/.test(el.tagName)) {
        if (dialog || importing) return
        e.preventDefault()
        undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const handleImport = (next: ScheduleData) => {
    commit(next, data, 'המערכת עודכנה מהקובץ')
    setImporting(false)
  }

  /** עריכה מהלוח לא נוגעת בגיבוי שלפני הייבוא */
  const handleEdit = (next: ScheduleData) => {
    commit(next, backup)
    setDialog(null)
  }

  const openBlock = (blockId: string) => openBlockIn(blockId, weekStart)

  function openBlockIn(blockId: string, week: Date) {
    const sessions = week === weekStart ? plan.sessions : planWeek(data, week, todayIso, nowMin).sessions
    const target = resolveBlock(data, blockId, sessions)
    if (!target) return
    if (target.kind === 'event') setDialog({ kind: 'event', event: target.event })
    else if (target.kind === 'plan') setDialog({ kind: 'session', session: target.session, goal: target.goal })
    else {
      const day = target.kind === 'entry' ? target.entry.slot.day : target.kind === 'choice' ? target.group.slot.day : target.window.slot.day
      setDialog({ kind: 'lesson', mode: { kind: 'edit', target }, date: dateOfDay(week, day) })
    }
  }

  /** גרירה של בלוק למקום חדש בשבוע המוצג */
  const handleBlockMove = (blockId: string, day: DayIndex, start: Minutes, end: Minutes) => {
    const target = resolveBlock(data, blockId, plan.sessions)
    const block = blocks.find((b) => b.id === blockId)
    if (!target || !block) return
    const len = end - start
    const toDate = dateOfDay(weekStart, day)

    if (target.kind === 'event') {
      commit(saveEvent(data, { ...target.event, date: toDate, start, end: start + len }), backup, 'האירוע הוזז')
      return
    }

    if (target.kind === 'plan') {
      if (target.session.done) return
      const next = movePlanned(data, target.session, weekStart, day, start, end)
      // אם ההזזה הזו השלימה דפוס, מספרים מה נלמד
      const before = new Set(learnedPrefs(data).map((p) => p.label))
      const learned = learnedPrefs(next).find((p) => !before.has(p.label))
      commit(
        next,
        backup,
        learned
          ? `המפגש הוזז. מעכשיו התכנון יודע: ${learned.label}`
          : 'המפגש הוזז. כשתזיז מפגשים באותו כיוון שוב, התכנון ילמד את זה',
      )
      return
    }

    const refId = refIdOf(target)
    const fixed = slotOf(target)
    if (!refId || !fixed) return
    const date = dateOfDay(weekStart, fixed.day)
    const alreadyMoved = !!moveOf(data, refId, date)
    // החזרה בדיוק למקום הקבוע מבטלת את ההזזה של השבוע, בלי לשאול
    if (day === fixed.day && start === fixed.start && end === fixed.end) {
      if (alreadyMoved) commit(clearMove(data, refId, date), backup, 'השיבוץ חזר למקום הקבוע')
      return
    }
    setDialog({
      kind: 'move',
      target,
      name: block.name,
      refId,
      date,
      from: fixed,
      to: { day, start, end },
      alreadyMoved,
      siblings: target.kind === 'entry' ? siblings(data, target.entry.id).length : 1,
    })
  }

  const newEventDate = () => {
    const today = isoDate(now)
    const day = dateOfDay(weekStart, selectedDay)
    return isThisWeek && day < today ? today : day
  }

  const handleRestore = () => {
    if (!backup) return
    commit(backup, data, 'המערכת שוחזרה')
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
            ＋ שיעור או פעילות
          </button>

          <button type="button" className="btn" onClick={() => setDialog({ kind: 'event', event: { date: newEventDate() } })}>
            ＋ אירוע, מבחן או חופשה
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

      {account.kind === 'offline' ? (
        <p className="mode-note is-offline" role="status">
          {offlineEdits
            ? 'אין חיבור לשרת. השינויים נשמרים במכשיר הזה, ויישלחו לשרת כשהחיבור יחזור.'
            : `אין חיבור לשרת. מוצגת המערכת כפי שנשמרה במכשיר ב-${savedAtDate(account.savedAt).toLocaleString('he-IL', {
                dateStyle: 'short',
                timeStyle: 'short',
              })}. אפשר לערוך, והשינויים יישלחו לשרת כשהחיבור יחזור.`}
        </p>
      ) : account.kind === 'owner' ? (
        <p className={`mode-note is-owner${account.unsynced ? ' is-offline' : ''}`} role="status">
          מחובר כ-<bdi dir="ltr">{account.email}</bdi>.{' '}
          {account.unsynced
            ? 'יש שינויים שעוד לא הגיעו לשרת. הם שמורים במכשיר ויישלחו כשהחיבור יתייצב.'
            : 'המערכת נשמרת בשרת.'}
        </p>
      ) : (
        <p className="mode-note">
          סביבת בדיקה: הכול נשמר רק בזיכרון של הדף ויימחק ברענון. אין חיבור לשום חשבון.
        </p>
      )}

      {versionDays !== null && (
        <section className="mode-note version-note" aria-label="תזכורת לגרסה חדשה">
          <p>
            המערכת שלך {data.source?.versionDate ? `מעודכנת ל-${data.source.versionDate}` : 'יובאה'}, לפני{' '}
            {Math.round(versionDays / 7)} שבועות. אם המוסד שלח גרסה חדשה, אפשר לייבא אותה ולראות רק מה השתנה.
          </p>
          <div className="import-actions">
            <button type="button" className="btn" onClick={() => setImporting(true)}>
              ייבוא גרסה חדשה
            </button>
            <button
              type="button"
              className="link-btn"
              onClick={() => commit(snoozeVersionReminder(data, isoDate(addDays(now, 14))), backup, 'אזכיר שוב בעוד שבועיים')}
            >
              הזכר לי בעוד שבועיים
            </button>
          </div>
        </section>
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
              ייבוא מקובץ או תמונה
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

      {!isEmpty && (
        <p className="muted drag-hint">
          אפשר לגרור שיעור, אירוע או מפגש מתוכנן לשעה אחרת, ולשנות אורך מהקצה התחתון. בטלפון: לחיצה ארוכה ואז גרירה.
          במקלדת: חצים על בלוק מסומן, ו-Enter לאישור.
        </p>
      )}

      <WeekGrid
        weekStart={weekStart}
        blocks={blocks}
        range={range}
        now={now}
        selectedDay={selectedDay}
        onSelectDay={setSelectedDay}
        onBlockClick={openBlock}
        dayNotes={dayNotes}
        onBlockMove={handleBlockMove}
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
      {dialog?.kind === 'move' && (
        <MoveDialog
          name={dialog.name}
          from={dialog.from}
          to={dialog.to}
          alreadyMoved={dialog.alreadyMoved}
          siblings={dialog.siblings}
          onAllDays={() => {
            if (dialog.target.kind !== 'entry') return
            const days = siblings(data, dialog.target.entry.id).map((e) => e.slot.day)
            const next = setActivityDays(data, dialog.target.entry.id, days, dialog.to.start, dialog.to.end)
            commit(clearMove(next, dialog.refId, dialog.date), backup, `השעה השתנתה בכל ${days.length} הימים`)
            setDialog(null)
          }}
          onOnce={() => {
            const to = dialog.to
            commit(
              moveOnce(data, dialog.refId, dialog.date, { date: dateOfDay(weekStart, to.day), start: to.start, end: to.end }),
              backup,
              'הוזז בשבוע הזה בלבד',
            )
            setDialog(null)
          }}
          onForever={() => {
            commit(moveForever(data, dialog.target, dialog.to, dialog.date), backup, 'השיבוץ הוזז בכל השבועות')
            setDialog(null)
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'goals' && (
        <GoalsDialog data={data} weekStart={weekStart} today={todayIso} onSave={handleEdit} onClose={() => setDialog(null)} />
      )}

      {toast && history.length > 0 && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button type="button" className="link-btn" onClick={undo}>
            ביטול הפעולה
          </button>
        </div>
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
