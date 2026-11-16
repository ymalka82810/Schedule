import { useEffect, useMemo, useRef, useState } from 'react'
import type { DayIndex, Minutes, ScheduleData, Slot } from './types'
import type { Account } from './auth/account'
import { ImportDialog } from './components/ImportDialog'
import { LessonDialog, type LessonDialogMode } from './components/LessonDialog'
import { EventDialog, SessionDialog } from './components/EventDialogs'
import { GoalsDialog } from './components/GoalsDialog'
import { GradesDialog } from './components/GradesDialog'
import { CalendarDialog } from './components/CalendarDialog'
import { declineName, declineText, declines, dismissDecline, selfReminder } from './lib/priority'
import { SEMESTER_NAMES, termNotices } from './lib/semester'
import { sameSubject } from './lib/pdf/parseCell'
import { attendedSubjects } from './lib/suggest'
import { Today } from './components/Today'
import { activeWeek, breakOn, isWorkDay, planSettings, planWeek, type PlannedSession } from './lib/plan'
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
import { loadFlag, loadTheme, saveFlag, saveTheme, type Theme } from './lib/storage'
import { Menu } from './components/Menu'
import { savedAtDate } from './auth/offlineCache'
import { DAY_NAMES, addDays, dateOfDay, formatTime, formatWeekRange, isSameDay, isoDate, startOfWeek } from './lib/time'

type Dialog =
  | { kind: 'lesson'; mode: LessonDialogMode; date?: string }
  | { kind: 'event'; event: OneOffEvent | { date: string; title?: string; start?: Minutes } }
  | { kind: 'session'; session: PlannedSession; goal: Goal }
  | { kind: 'goals' }
  | { kind: 'calendar' }
  | { kind: 'grades'; week?: Date }
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
  // במוצאי שבת (או כשהשבוע כבר נגמר לתכנון) נפתחים על השבוע הבא
  const [weekStart, setWeekStart] = useState(() => activeWeek(data, new Date()).weekStart)
  const [selectedDay, setSelectedDay] = useState<DayIndex>(() => activeWeek(data, new Date()).day)
  /** הטיפ על גרירה: מוצג עד שסוגרים אותו, ואפשר לפתוח שוב מהתפריט */
  const [showHint, setShowHint] = useState(() => !loadFlag('hint-drag-seen'))
  /** לחיצה על מקום ריק בלוח: מה להוסיף שם */
  const [addAt, setAddAt] = useState<{ day: DayIndex; start: Minutes; x: number; y: number } | null>(null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    saveTheme(theme)
    // צבע שורת הדפדפן בטלפון תואם לרקע של הערכה
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#121829' : '#eef1f6')
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
  // תזכורת להערכה עצמית בסוף השבוע (או בתחילת הבא), כשחסרה למקצוע שאני לומד
  const selfDue = useMemo(() => selfReminder(data, now, attendedSubjects(data)), [data, now])
  // מקצוע שירד שלוש פעמים ברצף: הצעה להגדיל יעד או לקבוע שעה עם המרצה
  const declining = useMemo(() => declines(data, todayIso), [data, todayIso])
  // מה נגמר או מתחיל בשבוע המוצג (סמסטר, או שיעור עם תאריכים משלו)
  const terms = useMemo(() => termNotices(data, [0, 1, 2, 3, 4, 5, 6].map((d) => dateOfDay(weekStart, d))), [data, weekStart])
  const teacherOf = (subject: string) => {
    const mine = new Set([...data.entries.map((e) => e.lessonId), ...data.choiceGroups.map((g) => g.chosenLessonId)])
    return data.lessons.find((l) => mine.has(l.id) && l.teacher && sameSubject(l.name, subject))?.teacher
  }

  const current = activeWeek(data, now)
  const isThisWeek = isSameDay(weekStart, current.weekStart)
  const goToThisWeek = () => {
    setWeekStart(current.weekStart)
    setSelectedDay(current.day)
  }
  // שיעור חדש לא נפתח על שבת: ביום בלי תכנון מציעים את יום הלימודים הראשון
  const newDay: DayIndex = isWorkDay(planSettings(data), selectedDay)
    ? selectedDay
    : (([0, 1, 2, 3, 4, 5, 6] as DayIndex[]).find((d) => isWorkDay(planSettings(data), d)) ?? selectedDay)

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
        return
      }
      // קיצורים בלוח: חצים = שבוע קודם או הבא, T = השבוע, N = שיעור חדש. לא בתוך שדה, דיאלוג או בלוק מסומן
      if (dialog || importing || loggingIn || addAt || e.defaultPrevented) return
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
      if (/INPUT|TEXTAREA|SELECT|BUTTON/.test(el.tagName) || el.closest('.block, .menu')) return
      if (e.key === 'ArrowLeft') setWeekStart((w) => addDays(w, 7))
      else if (e.key === 'ArrowRight') setWeekStart((w) => addDays(w, -7))
      else if (e.code === 'KeyT') goToThisWeek()
      else if (e.code === 'KeyN') setDialog({ kind: 'lesson', mode: { kind: 'new', day: newDay } })
      else return
      // בלי זה האות N הייתה נכתבת בשדה השם של הדיאלוג שנפתח
      e.preventDefault()
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
          {account.kind === 'owner' && !account.unsynced && (
            <span className="status-pill is-ok" title={`מחובר כ-${account.email}. כל שינוי נשמר בשרת`}>
              נשמר בשרת
            </span>
          )}
          {(account.kind === 'offline' || (account.kind === 'owner' && account.unsynced)) && (
            <span className="status-pill is-warn">ממתין לחיבור</span>
          )}
          {(account.kind === 'guest' || account.kind === 'local') && (
            <span className="status-pill" title="הכול נשמר רק בזיכרון של הדף ויימחק ברענון. אין חיבור לשום חשבון">
              סביבת בדיקה · נמחק ברענון
            </span>
          )}
        </div>

        <div className="top-bar">
          <div className="week-nav">
            <button
              type="button"
              className="btn btn-icon"
              aria-label="השבוע הקודם"
              title="השבוע הקודם (חץ ימינה)"
              onClick={() => setWeekStart((w) => addDays(w, -7))}
            >
              ›
            </button>
            <div className="week-label" aria-live="polite">
              <span className="top-range">{formatWeekRange(weekStart)}</span>
              {data.source?.versionDate && <span className="week-version">מעודכן ל-{data.source.versionDate}</span>}
            </div>
            <button
              type="button"
              className="btn btn-icon"
              aria-label="השבוע הבא"
              title="השבוע הבא (חץ שמאלה)"
              onClick={() => setWeekStart((w) => addDays(w, 7))}
            >
              ‹
            </button>
            {!isThisWeek && (
              <button type="button" className="btn btn-today" onClick={goToThisWeek} title="חזרה לשבוע הנוכחי (T)">
                חזרה להיום
              </button>
            )}
          </div>

          <div className="top-actions">
            <Menu
              primary
              label="＋ הוספה"
              items={[
                {
                  label: 'שיעור או פעילות',
                  hint: 'חוזר כל שבוע',
                  onSelect: () => setDialog({ kind: 'lesson', mode: { kind: 'new', day: newDay } }),
                },
                {
                  label: 'אירוע, מבחן או חופשה',
                  hint: 'בתאריך מסוים',
                  onSelect: () => setDialog({ kind: 'event', event: { date: newEventDate() } }),
                },
              ]}
            />
            <button type="button" className="btn" onClick={() => setDialog({ kind: 'goals' })}>
              יעדים
            </button>
            <button type="button" className="btn" onClick={() => setDialog({ kind: 'grades' })}>
              ציונים
            </button>
            <Menu
              label="עוד ▾"
              align="end"
              header={account.kind === 'owner' || account.kind === 'offline' ? <bdi dir="ltr">{account.email}</bdi> : undefined}
              items={[
                { label: 'לוח שנה', hint: 'סמסטרים וחופשות', onSelect: () => setDialog({ kind: 'calendar' }) },
                { label: 'ייבוא וגיבוי', hint: 'קובץ מערכת, גיבוי ושחזור', onSelect: () => setImporting(true) },
                { label: 'הדפסה', hint: 'כל השבוע על דף אחד', onSelect: () => window.print() },
                {
                  label: theme === 'dark' ? 'מצב בהיר' : 'מצב כהה',
                  onSelect: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
                },
                {
                  label: 'איך מזיזים ומוסיפים?',
                  hint: 'גרירה, לחיצה וקיצורי מקלדת',
                  onSelect: () => {
                    saveFlag('hint-drag-seen', false)
                    setShowHint(true)
                  },
                },
                ...(account.kind === 'guest' ? [{ label: 'כניסה (בעלים)', onSelect: () => setLoggingIn(true) }] : []),
                ...(account.kind === 'owner' ? [{ label: 'התנתקות', onSelect: account.signOut, danger: true }] : []),
              ]}
            />
          </div>
        </div>
      </header>

      {account.kind === 'offline' && (
        <p className="mode-note is-offline" role="status">
          {offlineEdits
            ? 'אין חיבור לשרת. השינויים נשמרים במכשיר הזה, ויישלחו לשרת כשהחיבור יחזור.'
            : `אין חיבור לשרת. מוצגת המערכת כפי שנשמרה במכשיר ב-${savedAtDate(account.savedAt).toLocaleString('he-IL', {
                dateStyle: 'short',
                timeStyle: 'short',
              })}. אפשר לערוך, והשינויים יישלחו לשרת כשהחיבור יחזור.`}
        </p>
      )}
      {account.kind === 'owner' && account.unsynced && (
        <p className="mode-note is-owner is-offline" role="status">
          יש שינויים שעוד לא הגיעו לשרת. הם שמורים במכשיר ויישלחו כשהחיבור יתייצב.
        </p>
      )}

      {selfDue && (
        <section className="mode-note version-note" aria-label="תזכורת להערכה עצמית">
          <p>
            איך היה השבוע ({formatWeekRange(selfDue.weekStart)})? חסרה הערכה עצמית: {selfDue.missing.join(', ')}. חצי דקה,
            והתכנון של השבוע הבא יתעדף לפיה.
          </p>
          <div className="import-actions">
            <button type="button" className="btn" onClick={() => setDialog({ kind: 'grades', week: selfDue.weekStart })}>
              להעריך עכשיו
            </button>
            <button
              type="button"
              className="link-btn"
              onClick={() => commit({ ...data, selfRemindSkip: isoDate(selfDue.weekStart) }, backup, 'לא אזכיר על השבוע הזה')}
            >
              לא השבוע
            </button>
          </div>
        </section>
      )}

      {declining.map((d) => {
        const teacher = teacherOf(d.subject)
        return (
          <section key={`${d.subject}:${d.topic ?? ''}`} className="mode-note version-note" aria-label={`ירידה ב${declineName(d)}`}>
            <p>
              {declineName(d)} ירד שלוש פעמים ברצף (<bdi dir="ltr">{declineText(d)}</bdi>).{' '}
              {d.topic
                ? `מפגשי התרגול ב${d.subject} כבר מתמקדים בנושא הזה, אבל אולי כדאי גם להגדיל את היעד, או לשאול את ${teacher ?? 'המרצה'} עליו.`
                : `התכנון כבר נותן לו יותר תרגול, אבל אולי כדאי גם להגדיל את היעד, או לקבוע שעה עם ${teacher ?? 'המרצה'} כדי להבין מה לא מסתדר.`}
            </p>
            <div className="import-actions">
              <button type="button" className="btn" onClick={() => setDialog({ kind: 'goals' })}>
                הגדלת היעד
              </button>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  setDialog({
                    kind: 'event',
                    event: { date: newEventDate(), title: `שעה עם ${teacher ?? 'המרצה'} (${declineName(d)})` },
                  })
                }
              >
                שעה עם {teacher ? teacher : 'המרצה'}
              </button>
              <button type="button" className="link-btn" onClick={() => commit(dismissDecline(data, d), backup, 'הבנתי. אתריע שוב רק אם תהיה עוד ירידה')}>
                הבנתי
              </button>
            </div>
          </section>
        )
      })}

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
              onClick={() => setDialog({ kind: 'lesson', mode: { kind: 'new', day: newDay } })}
            >
              הוספת שיעור
            </button>
          </div>
        </section>
      )}

      {showHint && (
        <aside className="drag-hint" aria-label="טיפים לשימוש בלוח">
          <ul>
            <li>לחיצה על מקום ריק בלוח מוסיפה שם שיעור או אירוע.</li>
            <li>גרירה מזיזה שיעור, אירוע או מפגש מתוכנן, והקצה התחתון משנה אורך. בטלפון: לחיצה ארוכה ואז גרירה.</li>
            <li className="hint-touch">בטלפון: החלקה ימינה או שמאלה על הלוח עוברת בין הימים.</li>
            <li className="hint-keys">
              במקלדת: חצים ימינה ושמאלה עוברים בין שבועות, T חוזר להיום, N מוסיף שיעור. על בלוק מסומן החצים מזיזים אותו,
              ו-Enter מאשר.
            </li>
          </ul>
          <button
            type="button"
            className="btn"
            onClick={() => {
              saveFlag('hint-drag-seen', true)
              setShowHint(false)
            }}
          >
            הבנתי
          </button>
        </aside>
      )}

      {terms.length > 0 && (
        <p className="mode-note term-note" role="note">
          {terms
            .map((t) => {
              const date = `${Number(t.date.slice(8))}.${Number(t.date.slice(5, 7))}`
              const what = t.semester && t.names.length > 1 ? `${SEMESTER_NAMES[t.semester]} (${t.names.join(', ')})` : t.names.join(', ')
              return t.kind === 'ends' ? `השבוע האחרון של ${what}, עד ${date}.` : `${what} מתחיל השבוע, ב-${date}.`
            })
            .join(' ')}{' '}
          <button type="button" className="link-btn" onClick={() => setDialog({ kind: 'calendar' })}>
            לוח השנה
          </button>
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
        onEmptyClick={(day, start, x, y) => setAddAt({ day, start, x, y })}
        onShiftWeek={(dir) => {
          setWeekStart((w) => addDays(w, dir * 7))
          setSelectedDay(dir > 0 ? 0 : 6)
        }}
      />

      {addAt && (
        <AddHere
          at={addAt}
          label={`יום ${DAY_NAMES[addAt.day]}, ${formatTime(addAt.start)}`}
          onClose={() => setAddAt(null)}
          onLesson={() => {
            setDialog({ kind: 'lesson', mode: { kind: 'new', day: addAt.day, start: addAt.start } })
            setAddAt(null)
          }}
          onEvent={() => {
            setDialog({ kind: 'event', event: { date: dateOfDay(weekStart, addAt.day), start: addAt.start } })
            setAddAt(null)
          }}
        />
      )}

      {dialog?.kind === 'lesson' && (
        <LessonDialog
          data={data}
          mode={dialog.mode}
          date={dialog.date}
          onSave={handleEdit}
          onOpenGoals={() => setDialog({ kind: 'goals' })}
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

      {dialog?.kind === 'calendar' && (
        <CalendarDialog data={data} onSave={(next) => { commit(next, backup, 'לוח השנה נשמר'); setDialog(null) }} onClose={() => setDialog(null)} />
      )}

      {dialog?.kind === 'grades' && (
        <GradesDialog data={data} today={todayIso} initialWeek={dialog.week} onSave={handleEdit} onClose={() => setDialog(null)} />
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

/** תפריט קטן שנפתח במקום שלחצו עליו בלוח: מה להוסיף בשעה הזו */
function AddHere({
  at,
  label,
  onLesson,
  onEvent,
  onClose,
}: {
  at: { x: number; y: number }
  label: string
  onLesson: () => void
  onEvent: () => void
  onClose: () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    box.current?.querySelector('button')?.focus()
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    // גלילה מזיזה את הלוח מתחת לתפריט, אז סוגרים
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onClose, { passive: true })
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onClose)
    }
  }, [onClose])
  // נשאר בתוך המסך גם ליד הקצוות
  const left = Math.max(8, Math.min(at.x - 110, window.innerWidth - 228))
  const top = Math.min(at.y + 6, window.innerHeight - 170)
  return (
    <div ref={box} className="menu-list add-here" role="menu" aria-label={`הוספה ב${label}`} style={{ left, top }}>
      <div className="menu-header">{label}</div>
      <button type="button" role="menuitem" className="menu-item" onClick={onLesson}>
        <span>＋ שיעור או פעילות</span>
        <span className="menu-hint">חוזר כל שבוע</span>
      </button>
      <button type="button" role="menuitem" className="menu-item" onClick={onEvent}>
        <span>＋ אירוע או מבחן</span>
        <span className="menu-hint">רק בתאריך הזה</span>
      </button>
    </div>
  )
}
