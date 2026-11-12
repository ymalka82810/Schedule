import type { ScheduleData } from '../types'
import { hm } from '../lib/time'

/** לוח ריק: נקודת ההתחלה של סביבת הבדיקה (מי שנכנס בלי התחברות) */
export const emptyData: ScheduleData = {
  version: 1,
  lessons: [],
  entries: [],
  choiceGroups: [],
  practiceWindows: [],
  goals: [],
  events: [],
  settings: { dayStart: hm(9), dayEnd: hm(21) },
}
