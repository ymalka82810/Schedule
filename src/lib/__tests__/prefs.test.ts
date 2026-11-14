import { describe, expect, it, vi } from 'vitest'

// הבדיקות כאן בודקות יעדים שהוגדרו בלבד. התרגול האוטומטי לכל מקצוע נבדק ב-suggest.test.ts
vi.mock('../suggest', async (orig) => ({
  ...(await orig<typeof import('../suggest')>()),
  allGoals: (d: { goals: unknown[] }) => d.goals,
}))
import { initialData } from '../../data/initial'
import { emptyData } from '../../data/empty'
import { busyForWeek, planWeek } from '../plan'
import { buildBlocks } from '../layout'
import { clearMove, moveForever, moveOnce, resolveBlock } from '../edit'
import { bandOf, forgetPref, learnedPrefs, movePlanned, skipPlanned, unpinPlanned } from '../prefs'
import type { Goal, PlanFeedback, ScheduleData } from '../../types'

// שבוע שמתחיל ביום ראשון 15.11.2026
const WEEK = new Date(2026, 10, 15)
const NEXT = new Date(2026, 10, 22)

const goal = (g: Partial<Goal> & { id: string; name: string }): Goal => ({
  color: 'teal',
  minHoursPerWeek: 3,
  maxHoursPerWeek: 3,
  preferredWindows: [],
  ...g,
})

describe('הזזה של שיבוץ קבוע בשבוע אחד', () => {
  const e = initialData.entries.find((x) => x.lessonId === 'math' && x.slot.day === 4)!
  const moved = moveOnce(initialData, e.id, '2026-11-19', { date: '2026-11-17', start: 18 * 60, end: 18 * 60 + 90 })

  it('השיעור מוצג במקום החדש רק בשבוע הזה, ומסומן כהוזז', () => {
    const here = buildBlocks(moved, { weekStart: WEEK }).find((b) => b.id === e.id)!
    expect(here).toMatchObject({ day: 2, start: 18 * 60, end: 18 * 60 + 90, isMoved: true })
    const next = buildBlocks(moved, { weekStart: NEXT }).find((b) => b.id === e.id)!
    expect(next).toMatchObject({ day: 4, start: e.slot.start, isMoved: undefined })
  })

  it('התכנון רואה את הזמן החדש כתפוס ואת הישן כפנוי', () => {
    const busy = busyForWeek(moved, WEEK)
    expect(busy.some((b) => b.day === 2 && b.start === 18 * 60)).toBe(true)
    expect(busy.some((b) => b.day === 4 && b.start === e.slot.start && b.label === 'מתמטיקה')).toBe(false)
  })

  it('ביטול השיעור בשבוע הזה גובר על ההזזה', () => {
    const data: ScheduleData = { ...moved, cancellations: [{ id: 'c', refId: e.id, date: '2026-11-19' }] }
    const b = buildBlocks(data, { weekStart: WEEK }).find((x) => x.id === e.id)!
    expect(b).toMatchObject({ day: 4, isCancelled: true, draggable: false })
  })

  it('החזרה למקום הקבוע מוחקת את ההזזה', () => {
    expect(clearMove(moved, e.id, '2026-11-19').moves).toEqual([])
  })

  it('הזזה בכל השבועות משנה את המשבצת ומוחקת את ההזזה של אותו תאריך', () => {
    const target = resolveBlock(moved, e.id)!
    const slot = { day: 3 as const, start: 9 * 60, end: 10 * 60 + 30 }
    const next = moveForever(moved, target, slot, '2026-11-19')
    expect(next.entries.find((x) => x.id === e.id)!.slot).toEqual(slot)
    expect(next.moves).toEqual([])
  })
})

describe('הזזה ודחייה של מפגש מתוכנן', () => {
  const data: ScheduleData = { ...initialData, goals: [goal({ id: 'gym', name: 'אימון', minHoursPerWeek: 2, maxHoursPerWeek: 2 })] }
  const plan = planWeek(data, WEEK)
  const s = plan.sessions[0]

  it('מפגש שהוזז נשאר במקום החדש, והיעד לא מקבל מפגש נוסף בגללו', () => {
    const next = movePlanned(data, s, WEEK, 5, 9 * 60)
    const after = planWeek(next, WEEK)
    const pinned = after.sessions.find((x) => x.pinId)!
    expect(pinned).toMatchObject({ day: 5, start: 9 * 60, end: 9 * 60 + (s.end - s.start) })
    expect(after.report[0].planned).toBe(plan.report[0].planned)
    // הרישום נשמר לפי המקום המקורי
    expect(next.planFeedback).toEqual([
      expect.objectContaining({ goalId: 'gym', day: s.day, start: s.start, action: 'moved', toDay: 5, toStart: 9 * 60 }),
    ])
  })

  it('הזזה שנייה של אותו מפגש מעדכנת את אותו רישום, והחזרה למקור מבטלת', () => {
    const once = movePlanned(data, s, WEEK, 5, 9 * 60)
    const pinned = planWeek(once, WEEK).sessions.find((x) => x.pinId)!
    const twice = movePlanned(once, pinned, WEEK, 5, 10 * 60)
    expect(twice.planPins).toHaveLength(1)
    expect(twice.planFeedback).toHaveLength(1)
    expect(twice.planFeedback![0].toStart).toBe(10 * 60)
    const pinned2 = planWeek(twice, WEEK).sessions.find((x) => x.pinId)!
    const back = movePlanned(twice, pinned2, WEEK, s.day, s.start)
    expect(back.planPins).toEqual([])
    expect(back.planFeedback).toEqual([])
  })

  it('החזרה לתכנון האוטומטי מוחקת גם את הרישום', () => {
    const once = movePlanned(data, s, WEEK, 5, 9 * 60)
    const back = unpinPlanned(once, once.planPins![0].id)
    expect(back.planPins).toEqual([])
    expect(back.planFeedback).toEqual([])
  })

  it('"לא מתאים לי כאן": המפגש מקבל מקום אחר, רחוק לפחות שעה', () => {
    const next = skipPlanned(data, s, '2026-11-' + String(15 + s.day))
    const after = planWeek(next, WEEK)
    expect(after.report[0].planned).toBe(plan.report[0].planned)
    expect(
      after.sessions.some((x) => x.day === s.day && x.start < s.end + 60 && x.end > s.start - 60),
    ).toBe(false)
    expect(next.planFeedback).toEqual([expect.objectContaining({ action: 'removed', day: s.day })])
  })

  it('מפגש מוצמד שסומן "תרגלתי" לא מופיע פעמיים', () => {
    const once = movePlanned(data, s, WEEK, 5, 9 * 60)
    const pin = once.planPins![0]
    const logged: ScheduleData = {
      ...once,
      log: [{ id: 'done1', goalId: 'gym', date: pin.date, start: pin.start, end: pin.end }],
    }
    const after = planWeek(logged, WEEK)
    expect(after.sessions.filter((x) => x.day === 5 && x.start === 9 * 60)).toHaveLength(1)
    expect(after.sessions.find((x) => x.day === 5 && x.start === 9 * 60)!.done).toBe(true)
  })
})

describe('למידת העדפות', () => {
  const g = goal({ id: 'phys', name: 'פיזיקה', minHoursPerWeek: 3, maxHoursPerWeek: 3 })
  const fb = (f: Partial<PlanFeedback> & { date: string }): PlanFeedback => ({
    id: `f-${f.date}-${f.start ?? 0}-${f.day ?? 0}`,
    goalId: 'phys',
    day: 1,
    start: 8 * 60,
    action: 'moved',
    toDay: 1,
    toStart: 17 * 60,
    ...f,
  })
  const base: ScheduleData = { ...emptyData, goals: [g] }

  it('פעם אחת זה עוד לא דפוס, פעמיים בתאריכים שונים כן', () => {
    const one = { ...base, planFeedback: [fb({ date: '2026-11-09' })] }
    expect(learnedPrefs(one)).toEqual([])
    const two = { ...base, planFeedback: [fb({ date: '2026-11-09' }), fb({ date: '2026-11-16' })] }
    const labels = learnedPrefs(two).map((p) => p.label)
    expect(labels).toContain('פיזיקה: לא בבוקר')
    expect(labels).toContain('פיזיקה: עדיף אחר הצהריים')
    // הוזז באותו יום, אז אין העדפה לגבי ימים
    expect(learnedPrefs(two).some((p) => p.dim === 'day')).toBe(false)
  })

  it('פעמיים באותו תאריך נחשב פעם אחת', () => {
    const data = { ...base, planFeedback: [fb({ date: '2026-11-09' }), fb({ date: '2026-11-09', start: 9 * 60 })] }
    expect(learnedPrefs(data)).toEqual([])
  })

  it('הזזה בכיוון ההפוך מקזזת', () => {
    const data = {
      ...base,
      planFeedback: [
        fb({ date: '2026-11-09' }),
        fb({ date: '2026-11-16' }),
        fb({ date: '2026-11-23', start: 17 * 60, toStart: 8 * 60 }),
      ],
    }
    expect(learnedPrefs(data).map((p) => p.label)).not.toContain('פיזיקה: לא בבוקר')
  })

  it('התכנון מתרחק משעות שנמנעים מהן ומעדיף את אלה שעוברים אליהן', () => {
    const data: ScheduleData = {
      ...base,
      goals: [goal({ id: 'phys', name: 'פיזיקה', minHoursPerWeek: 3, maxHoursPerWeek: 3, sessionMinutes: 60 })],
      planFeedback: [fb({ date: '2026-11-02' }), fb({ date: '2026-11-09' })],
    }
    const plain = planWeek({ ...data, planFeedback: [] }, WEEK)
    expect(plain.sessions.some((x) => bandOf(x.start) === 'morning')).toBe(true)
    const learned = planWeek(data, WEEK)
    expect(learned.sessions.length).toBeGreaterThan(0)
    for (const x of learned.sessions) expect(bandOf(x.start)).toBe('afternoon')
    expect(learned.sessions[0].reasons.join(' ')).toContain('בדרך כלל מזיז')
  })

  it('יום שמפנים ממנו מפגשים של כמה יעדים נחשב עמוס לכולם', () => {
    const data: ScheduleData = {
      ...base,
      goals: [g, goal({ id: 'gym', name: 'אימון' })],
      planFeedback: [
        fb({ date: '2026-11-02', day: 2, action: 'removed', toDay: undefined, toStart: undefined }),
        fb({ date: '2026-11-09', day: 2, goalId: 'gym', action: 'removed', toDay: undefined, toStart: undefined }),
        fb({ date: '2026-11-03', day: 2, toDay: 4, toStart: 8 * 60 }),
      ],
    }
    expect(learnedPrefs(data).find((p) => !p.goalId)).toMatchObject({ kind: 'avoid', dim: 'day', value: 2 })
  })

  it('לשכוח העדפה מוחק את הרישומים שיצרו אותה', () => {
    const data = { ...base, planFeedback: [fb({ date: '2026-11-09' }), fb({ date: '2026-11-16' })] }
    const avoid = learnedPrefs(data).find((p) => p.kind === 'avoid')!
    expect(learnedPrefs(forgetPref(data, avoid))).toEqual([])
  })
})
