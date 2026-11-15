import { describe, expect, it } from 'vitest'
import { initialData } from '../../data/initial'
import { buildBlocks } from '../layout'
import { semesterProblems, termNotices, termTag } from '../semester'
import { declineText, declines, dismissDecline, knownTopics, saveGrade } from '../priority'
import { fromBackup, toBackup } from '../edit'
import { autoGoalId } from '../suggest'
import { dateOfDay } from '../time'
import type { Lesson, ScheduleData } from '../../types'

const lesson = (l: Partial<Lesson>): Lesson => ({ id: 'x', name: 'כתיבה מדעית', color: 'teal', ...l })
const week = (start: Date) => [0, 1, 2, 3, 4, 5, 6].map((d) => dateOfDay(start, d))

describe('שיעור ראשון ואחרון בסמסטר', () => {
  const semesters = { a: { from: '2026-10-18', to: '2027-01-29' } }
  const a = lesson({ semester: 'a' })

  it('בשבוע האחרון התגית "שיעור אחרון", ובשבוע הראשון "שיעור ראשון"', () => {
    expect(termTag(a, '2027-01-25', semesters)).toBe('שיעור אחרון')
    expect(termTag(a, '2027-01-21', semesters)).toBeUndefined()
    expect(termTag(a, '2026-10-20', semesters)).toBe('שיעור ראשון')
    expect(termTag(a, '2026-10-27', semesters)).toBeUndefined()
    // בלי תאריכים לסמסטר: אין תגית
    expect(termTag(a, '2027-01-25', {})).toBeUndefined()
  })

  it('התגית מגיעה לבלוק בלוח', () => {
    const data: ScheduleData = {
      ...initialData,
      lessons: initialData.lessons.map((l) => (l.id === 'writing' ? { ...l, semester: 'a' } : l)),
      semesters,
    }
    const blocks = buildBlocks(data, { weekStart: new Date(2027, 0, 24) })
    const writing = blocks.filter((b) => b.name.startsWith('כתיבה מדעית'))
    expect(writing.length).toBeGreaterThan(0)
    expect(writing.every((b) => b.termTag === 'שיעור אחרון')).toBe(true)
    expect(blocks.filter((b) => b.name.startsWith('מתמטיקה')).every((b) => !b.termTag)).toBe(true)
  })

  it('הודעה על מה שנגמר בשבוע המוצג, רק לשיעורים שלי', () => {
    const data: ScheduleData = {
      ...initialData,
      lessons: initialData.lessons.map((l) => (l.id === 'writing' ? { ...l, semester: 'a' } : l)),
      semesters,
    }
    const notices = termNotices(data, week(new Date(2027, 0, 24)))
    expect(notices).toEqual([{ kind: 'ends', names: ['כתיבה מדעית'], semester: 'a', date: '2027-01-29' }])
    expect(termNotices(data, week(new Date(2027, 0, 17)))).toEqual([])
    expect(termNotices(data, week(new Date(2026, 9, 18)))[0]).toMatchObject({ kind: 'starts', date: '2026-10-18' })
  })

  it('בדיקת תאריכים: סיום לפני התחלה וסמסטרים חופפים', () => {
    expect(semesterProblems({ a: { from: '2027-02-01', to: '2027-01-01' } })[0]).toContain('לפני ההתחלה')
    expect(
      semesterProblems({ a: { from: '2026-10-18', to: '2027-02-10' }, b: { from: '2027-02-01', to: '2027-06-30' } })[0],
    ).toContain('חופפים')
    expect(semesterProblems({ a: { from: '2026-10-18', to: '2027-01-29' }, b: { from: '2027-02-14' } })).toEqual([])
  })
})

describe('התראה על ירידה שלוש פעמים ברצף', () => {
  const graded = (scores: number[]) =>
    scores.reduce(
      (d, score, i) => saveGrade(d, { subject: 'פיזיקה', score, date: `2026-11-0${i + 1}`, kind: 'exam' }),
      initialData,
    )

  it('ארבעה ציונים שיורדים כל פעם = התראה', () => {
    const d = declines(graded([90, 80, 70, 60]), '2026-11-14')
    expect(d.map((x) => x.subject)).toEqual(['פיזיקה'])
    expect(declineText(d[0])).toBe('90 ← 80 ← 70 ← 60')
  })

  it('שתי ירידות, או עלייה באמצע, לא מתריעות', () => {
    expect(declines(graded([80, 70, 60]), '2026-11-14')).toEqual([])
    expect(declines(graded([90, 80, 85, 70]), '2026-11-14')).toEqual([])
  })

  it('"הבנתי" משתיק את הרצף, וירידה נוספת מתריעה שוב', () => {
    const data = graded([90, 80, 70, 60])
    const quiet = dismissDecline(data, declines(data, '2026-11-14')[0])
    expect(declines(quiet, '2026-11-14')).toEqual([])
    const again = saveGrade(quiet, { subject: 'פיזיקה', score: 50, date: '2026-11-08', kind: 'exam' })
    expect(declines(again, '2026-11-14')).toHaveLength(1)
  })
})

describe('נושאים משותפים לציונים ולמפגשים', () => {
  it('נושא שנכתב בסוף מפגש מוצע בציון, והחלש ראשון', () => {
    let data: ScheduleData = {
      ...initialData,
      log: [{ id: 'l1', goalId: autoGoalId('פיזיקה'), date: '2026-11-10', start: 600, end: 660, topic: 'תנועה מעגלית' }],
    } as ScheduleData
    data = saveGrade(data, { subject: 'פיזיקה', score: 50, date: '2026-11-11', kind: 'exam', topic: 'וקטורים' })
    expect(knownTopics(data, 'פיזיקה', '2026-11-14')).toEqual(['וקטורים', 'תנועה מעגלית'])
    expect(knownTopics(data, 'מתמטיקה')).toEqual([])
  })
})

describe('גיבוי', () => {
  it('משחזר גם ציונים, תאריכי סמסטר, הזזות והעדפות', () => {
    const data: ScheduleData = {
      ...saveGrade(initialData, { subject: 'פיזיקה', score: 80, date: '2026-11-01', kind: 'exam' }),
      semesters: { a: { from: '2026-10-18', to: '2027-01-29' } },
      moves: [{ id: 'm1', refId: 'e1', date: '2026-11-16', toDate: '2026-11-16', start: 600, end: 690 }],
      planFeedback: [],
      declineSkip: ['grade1'],
      selfRemindSkip: '2026-11-08',
    } as ScheduleData
    const back = fromBackup(toBackup(data))
    expect('data' in back && back.data).toMatchObject({
      grades: data.grades,
      semesters: data.semesters,
      moves: data.moves,
      declineSkip: ['grade1'],
      selfRemindSkip: '2026-11-08',
    })
  })
})
