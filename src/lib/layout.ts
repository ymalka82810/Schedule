import type { ColorKey, DayIndex, Minutes, ScheduleData } from '../types'

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
}

/** הופך את הנתונים השמורים לרשימת בלוקים לציור */
export function buildBlocks(data: ScheduleData): Block[] {
  const lessons = new Map(data.lessons.map((l) => [l.id, l]))
  const blocks: Block[] = []

  for (const e of data.entries) {
    const l = lessons.get(e.lessonId)
    if (!l) continue
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
    })
  }

  for (const g of data.choiceGroups) {
    // אחרי בחירה מוצג רק השיעור שנבחר; לפני כן כל האפשרויות זו לצד זו
    const ids = g.chosenLessonId ? [g.chosenLessonId] : g.optionLessonIds
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
    })
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
