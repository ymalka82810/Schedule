import { describe, expect, it } from 'vitest'
import { initialData } from '../../data/initial'
import { buildBlocks } from '../layout'
import { courseEnd, semesterProblems, termNotices, termTag } from '../semester'
import { planWeek } from '../plan'
import { declineName, declineText, declines, dismissDecline, knownTopics, saveGrade } from '../priority'
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
  /**
   * Required<ScheduleData>: שדה חדש ב-ScheduleData שלא נוסף כאן שובר את הבנייה,
   * וכך הבדיקה מוודאת שכל שדה עובר בגיבוי ולא הולך לאיבוד
   */
  const every: Required<ScheduleData> = {
    ...initialData,
    cancellations: [{ refId: 'e1', date: '2026-11-16' }] as ScheduleData['cancellations'] & object,
    moves: [{ id: 'm1', refId: 'e1', date: '2026-11-16', toDate: '2026-11-16', start: 600, end: 690 }],
    planPins: [{ id: 'pin' }] as unknown as Required<ScheduleData>['planPins'],
    planSkips: [{ id: 'skip' }] as unknown as Required<ScheduleData>['planSkips'],
    planDismissed: [{ id: 'dis' }] as unknown as Required<ScheduleData>['planDismissed'],
    planFeedback: [{ id: 'fb' }] as unknown as Required<ScheduleData>['planFeedback'],
    semesters: { a: { from: '2026-10-18', to: '2027-01-29' } },
    grades: [{ id: 'g1', subject: 'פיזיקה', score: 80, date: '2026-11-01', kind: 'exam' }],
    declineSkip: ['g1'],
    selfRemindSkip: '2026-11-08',
    breaks: [{ id: 'br1', title: 'חנוכה', from: '2026-12-06', to: '2026-12-11' }],
    log: [{ id: 'l1', goalId: 'x', date: '2026-11-10', start: 600, end: 660 }],
    reviews: [{ id: 'r1', goalId: 'x', topic: 'וקטורים', due: '2026-11-12', step: 0 }],
    plan: { ...(initialData.plan ?? {}) } as Required<ScheduleData>['plan'],
    wizard: { subjects: { פיזיקה: true }, variants: { פיזיקה: 'קסל' } },
    source: { fileName: 'm.pdf', importedAt: '2026-10-20T10:00:00Z' },
  }

  it('כל שדה ב-ScheduleData חוזר מהגיבוי כמו שהוא', () => {
    const back = fromBackup(toBackup(every))
    expect('data' in back && back.data).toEqual(every)
  })

  it('שדה פגום נזרק בלי לשבור את הטעינה', () => {
    const back = fromBackup(JSON.stringify({ ...every, grades: 'x', semesters: [1] }))
    expect('data' in back).toBe(true)
    if ('data' in back) {
      expect(back.data.grades).toBeUndefined()
      expect(back.data.semesters).toBeUndefined()
      expect(back.data.log).toEqual(every.log)
    }
  })
})

describe('סוף קורס בתכנון', () => {
  const data: ScheduleData = {
    ...initialData,
    lessons: initialData.lessons.map((l) => (l.id === 'writing' ? { ...l, semester: 'a' } : l)),
    semesters: { a: { from: '2026-10-18', to: '2027-01-29' } },
  }

  it('קורס שנגמר: מתי, ורק כשכל השיעורים במקצוע מוגבלים בזמן', () => {
    expect(courseEnd(data, 'כתיבה מדעית')).toBe('2027-01-29')
    expect(courseEnd(data, 'פיזיקה')).toBeUndefined()
  })

  it('בשבועיים האחרונים: יותר תרגול ומפגש חזרה כללית, עם הסבר', () => {
    const before = planWeek(data, new Date(2027, 0, 3), '2027-01-01', 0)
    const last = planWeek(data, new Date(2027, 0, 17), '2027-01-01', 0)
    const goal = autoGoalId('כתיבה מדעית')
    const mins = (p: typeof last) => p.sessions.filter((x) => x.goalId === goal).reduce((m, x) => m + x.end - x.start, 0)
    expect(mins(last)).toBeGreaterThan(mins(before))
    expect(last.report.find((r) => r.goalId === goal)?.boost).toContain('הקורס נגמר ב-29.1')
    const review = last.sessions.filter((x) => x.title?.includes('חזרה כללית'))
    expect(review).toHaveLength(1)
    expect(review[0].goalId).toBe(goal)
    expect(before.sessions.some((x) => x.title?.includes('חזרה כללית'))).toBe(false)
  })

  it('מבחן שהוזן גובר על סוף הקורס', () => {
    const withExam = { ...data, events: [{ id: 'ex', title: 'מבחן', date: '2027-01-27', start: 540, end: 720, examSubject: 'כתיבה מדעית' }] }
    const p = planWeek(withExam, new Date(2027, 0, 17), '2027-01-01', 0)
    expect(p.report.find((r) => r.goalId === autoGoalId('כתיבה מדעית'))?.boost).toContain('לקראת המבחן')
    expect(p.sessions.some((x) => x.title?.includes('חזרה כללית'))).toBe(false)
  })
})

describe('ירידה בנושא', () => {
  const data = [90, 80, 70, 60].reduce(
    (d, score, i) =>
      saveGrade(d, { subject: 'פיזיקה', score, date: `2026-11-0${i + 1}`, kind: 'exam', topic: i % 2 ? 'וקטורים ' : 'וקטורים' }),
    // ציונים אחרים במקצוע בלי נושא, כך שהמקצוע כולו לא יורד ברצף
    saveGrade(initialData, { subject: 'פיזיקה', score: 95, date: '2026-11-03', kind: 'exam' }),
  )

  it('נושא שירד שלוש פעמים ברצף מתריע, גם כשהמקצוע כולו לא', () => {
    const d = declines(data, '2026-11-14')
    expect(d.map((x) => [x.subject, x.topic])).toEqual([['פיזיקה', 'וקטורים']])
    expect(declineName(d[0])).toBe('וקטורים בפיזיקה')
  })

  it('"הבנתי" על הנושא משתיק רק אותו', () => {
    const quiet = dismissDecline(data, declines(data, '2026-11-14')[0])
    expect(declines(quiet, '2026-11-14')).toEqual([])
  })

  it('כשגם המקצוע וגם הנושא יורדים על אותם ציונים, התראה אחת', () => {
    const only = [90, 80, 70, 60].reduce(
      (d, score, i) => saveGrade(d, { subject: 'פיזיקה', score, date: `2026-11-0${i + 1}`, kind: 'exam', topic: 'וקטורים' }),
      initialData,
    )
    expect(declines(only, '2026-11-14').map((x) => x.topic)).toEqual([undefined])
  })
})
