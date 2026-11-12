import type { ColorKey, DayIndex, Minutes, ScheduleData } from '../types'
import { activeOn, breakOn, isCancelled, type PlannedSession } from './plan'
import { dateOfDay } from './time'
import { dayInfo } from './hebrew'

/** בלוק אחד מוכן לציור בלוח */
export interface Block {
  id: string
  day: DayIndex
  start: Minutes
  end: Minutes
  name: string
  teacher?: string
  room?: string
  kind?: string
  color: ColorKey
  /** מיקום בתוך משבצת בחירה: אינדקס ומספר האפשרויות */
  lane: number
  lanes: number
  /** חלק ממשבצת בחירה שעוד לא נבחר בה שיעור */
  isOption: boolean
  /** חלון תרגול חופשי שהתוכן שלו עוד לא נקבע */
  isOpen: boolean
  type: 'lesson' | 'choice' | 'practice' | 'event' | 'plan'
  /** בוטל בשבוע המוצג. מוצג חיוור, כדי שאפשר יהיה להחזיר */
  isCancelled?: boolean
  /** למה בוטל: "בוטל השבוע" או שם החג */
  cancelTag?: string
  /** מפגש מתוכנן שסומן כבוצע */
  isDone?: boolean
}

interface WeekOptions {
  /** השבוע המוצג: מוסיף אירועים, מסמן ביטולים */
  weekStart?: Date
  /** המפגשים שתוכננו לשבוע, ושמות היעדים וצבעיהם */
  plan?: PlannedSession[]
}

/** הופך את הנתונים השמורים לרשימת בלוקים לציור */
export function buildBlocks(data: ScheduleData, opts: WeekOptions = {}): Block[] {
  const lessons = new Map(data.lessons.map((l) => [l.id, l]))
  const blocks: Block[] = []
  const { weekStart } = opts
  const cancelled = (refId: string, day: DayIndex) =>
    weekStart ? isCancelled(data, refId, dateOfDay(weekStart, day)) : false
  const tagOf = (refId: string, day: DayIndex) => {
    if (!weekStart || !cancelled(refId, day)) return undefined
    const date = dateOfDay(weekStart, day)
    const h = dayInfo(date).holiday
    if (h?.kind === 'chag') return h.name
    return breakOn(data, date)?.title ?? 'בוטל השבוע'
  }

  // בשבוע מסוים: שיעור שלא בתוקף בתאריך שלו לא מוצג
  const inForce = (id: string, day: DayIndex) => !weekStart || activeOn(lessons.get(id), dateOfDay(weekStart, day))

  for (const e of data.entries) {
    const l = lessons.get(e.lessonId)
    if (!l || !inForce(l.id, e.slot.day)) continue
    blocks.push({
      id: e.id,
      ...e.slot,
      name: l.group ? `${l.name} ${l.group}` : l.name,
      teacher: l.teacher,
      room: e.room ?? l.room,
      kind: e.kind,
      color: l.color,
      lane: 0,
      lanes: 1,
      isOption: false,
      isOpen: false,
      type: 'lesson',
      isCancelled: cancelled(e.id, e.slot.day) || undefined,
      cancelTag: tagOf(e.id, e.slot.day),
    })
  }

  for (const g of data.choiceGroups) {
    // אחרי בחירה מוצג רק השיעור שנבחר; לפני כן כל האפשרויות זו לצד זו
    const ids = (g.chosenLessonId ? [g.chosenLessonId] : g.optionLessonIds).filter((id) => inForce(id, g.slot.day))
    ids.forEach((id, i) => {
      const l = lessons.get(id)
      if (!l) return
      blocks.push({
        id: `${g.id}:${id}`,
        ...g.slot,
        name: l.group ? `${l.name} ${l.group}` : l.name,
        teacher: l.teacher,
        room: l.room,
        color: l.color,
        lane: i,
        lanes: ids.length,
        isOption: !g.chosenLessonId,
        isOpen: false,
        type: 'choice',
        isCancelled: cancelled(g.id, g.slot.day) || undefined,
        cancelTag: tagOf(g.id, g.slot.day),
      })
    })
  }

  // ?? [] כדי שנתונים שנשמרו לפני שהשדה נוסף ימשיכו להיטען
  for (const w of data.practiceWindows ?? []) {
    blocks.push({
      id: w.id,
      ...w.slot,
      name: w.name,
      room: w.context,
      color: 'teal',
      lane: 0,
      lanes: 1,
      isOption: false,
      isOpen: true,
      type: 'practice',
      isCancelled: cancelled(w.id, w.slot.day) || undefined,
      cancelTag: tagOf(w.id, w.slot.day),
    })
  }

  if (weekStart) {
    for (const ev of data.events) {
      const day = ([0, 1, 2, 3, 4, 5, 6] as DayIndex[]).find((d) => dateOfDay(weekStart, d) === ev.date)
      if (day === undefined) continue
      blocks.push({
        id: ev.id,
        day,
        start: ev.start,
        end: ev.end,
        name: ev.title,
        color: 'rose',
        lane: 0,
        lanes: 1,
        isOption: false,
        isOpen: false,
        type: 'event',
        cancelTag: ev.examSubject ? 'מבחן' : undefined,
      })
    }
  }

  const goals = new Map(data.goals.map((g) => [g.id, g]))
  for (const p of opts.plan ?? []) {
    const g = goals.get(p.goalId)
    if (!g) continue
    blocks.push({
      id: p.id,
      day: p.day,
      start: p.start,
      end: p.end,
      name: p.title ?? g.name,
      color: g.color,
      lane: 0,
      lanes: 1,
      isOption: false,
      isOpen: false,
      type: 'plan',
      isDone: p.done || undefined,
    })
  }

  // שיעור קבוע ואירוע באותה שעה: מציגים זה לצד זה
  return sideBySide(blocks)
}

/** בלוקים חופפים באותו יום (שאינם כבר במשבצת בחירה) מקבלים מסלולים נפרדים */
function sideBySide(blocks: Block[]): Block[] {
  const byDay = new Map<DayIndex, Block[]>()
  for (const b of blocks) byDay.set(b.day, [...(byDay.get(b.day) ?? []), b])
  for (const list of byDay.values()) {
    const singles = list.filter((b) => b.lanes === 1).sort((a, b) => a.start - b.start)
    let cluster: Block[] = []
    let end = -1
    const flush = () => {
      if (cluster.length > 1) {
        // כל בלוק למסלול הראשון שהתפנה, כדי לא לפצל יותר ממה שצריך
        const laneEnds: number[] = []
        for (const b of cluster) {
          let lane = laneEnds.findIndex((e) => e <= b.start)
          if (lane < 0) lane = laneEnds.push(0) - 1
          laneEnds[lane] = b.end
          b.lane = lane
        }
        for (const b of cluster) b.lanes = laneEnds.length
      }
      cluster = []
    }
    for (const b of singles) {
      if (b.start >= end) {
        flush()
        end = b.end
      } else end = Math.max(end, b.end)
      cluster.push(b)
    }
    flush()
  }
  return blocks
}

/** טווח השעות שהלוח מציג: ההגדרות, מורחב אם יש שיעור שחורג מהן. מעוגל לשעות שלמות */
export function visibleRange(data: ScheduleData, blocks: Block[]): { start: Minutes; end: Minutes } {
  let start = data.settings.dayStart
  let end = data.settings.dayEnd
  for (const b of blocks) {
    if (b.start < start) start = b.start
    if (b.end > end) end = b.end
  }
  return { start: Math.floor(start / 60) * 60, end: Math.ceil(end / 60) * 60 }
}
