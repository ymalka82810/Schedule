// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScheduleData } from '../../types'
import { emptyData } from '../../data/empty'

/**
 * הבעלים מול השרת, עם שרת מדומה: מה נשלח, מה מוצג, ומה קורה כשמכשיר אחר שומר באמצע.
 * App עצמו מוחלף בבדיקה ברכיב ריק שרק חושף את מה שקיבל.
 */

type Saved = { data: ScheduleData; backup: ScheduleData | null }
type AppProps = {
  initialData: ScheduleData
  initialBackup: ScheduleData | null
  initialToast?: string
  syncStamp?: number
  account: { kind: string; unsynced?: boolean }
  onPersist?: (data: ScheduleData, backup: ScheduleData | null) => void
}

const h = vi.hoisted(() => ({
  app: null as unknown,
  doc: undefined as unknown,
  rerender: () => {},
  save: (_args: Record<string, unknown>): Promise<unknown> => Promise.resolve(null),
}))
const app = () => h.app as AppProps

vi.mock('../../App', () => ({
  default: (props: AppProps) => {
    h.app = props
    return null
  },
}))
vi.mock('convex/react', () => ({
  ConvexReactClient: class {},
  useConvexAuth: () => ({ isLoading: false, isAuthenticated: true }),
  useQuery: (ref: string) => (ref === 'me' ? { email: 'me@x.com', isOwner: true } : h.doc),
  useMutation: () => (args: Record<string, unknown>) => h.save(args),
}))
vi.mock('convex/server', () => ({ anyApi: { users: { me: 'me' }, schedule: { get: 'get', save: 'save' } } }))
vi.mock('@convex-dev/auth/react', () => ({
  ConvexAuthProvider: ({ children }: { children: unknown }) => children,
  useAuthActions: () => ({ signIn: async () => ({ signingIn: true }), signOut: async () => {} }),
}))

import { AuthRoot } from '../AuthRoot'

const named = (name: string): ScheduleData => ({ ...emptyData, source: { fileName: name } }) as ScheduleData
const nameOf = (d: ScheduleData | null) => (d as { source?: { fileName?: string } } | null)?.source?.fileName

/** שרת מדומה עם אותם כללים כמו convex/schedule.ts */
function server(initial: Saved & { updatedAt: number }) {
  const row = { ...initial }
  const calls: Array<Record<string, unknown>> = []
  h.doc = { ...row }
  h.save = async (args) => {
    calls.push(args)
    const checked = args.base !== undefined
    if (checked && !args.force && row.updatedAt !== args.base) return { ok: false, updatedAt: row.updatedAt }
    row.data = args.data as ScheduleData
    row.backup = (args.backup as ScheduleData | null) ?? null
    row.updatedAt++
    return checked ? { ok: true, updatedAt: row.updatedAt } : row.updatedAt
  }
  return {
    row,
    calls,
    /** מה שהשרת שומר עכשיו מגיע לדף */
    push: async () => {
      h.doc = { ...row }
      await act(async () => h.rerender())
    },
    /** מכשיר אחר שמר */
    other: (data: ScheduleData) => {
      row.data = data
      row.updatedAt++
    },
  }
}

async function open() {
  const view = render(<AuthRoot url="https://x.convex.cloud" />)
  h.rerender = () => view.rerender(<AuthRoot url="https://x.convex.cloud" />)
  await act(async () => {})
}

const edit = async (data: ScheduleData, backup: ScheduleData | null = null) => {
  await act(async () => app().onPersist?.(data, backup))
}

beforeEach(() => {
  localStorage.clear()
  h.app = null
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('הבעלים מול השרת', () => {
  it('פתיחה מציגה את מה שבשרת, ושמירה נשלחת עם הגרסה שעליה היא מבוססת', async () => {
    const s = server({ data: named('server'), backup: null, updatedAt: 5 })
    await open()
    expect(nameOf(app().initialData)).toBe('server')

    await edit(named('mine'))
    expect(s.calls).toEqual([expect.objectContaining({ base: 5, force: false })])
    expect(nameOf(s.row.data)).toBe('mine')
    expect(app().account.unsynced).toBe(false)

    // השמירה של עצמנו חוזרת מהשרת: לא "עדכון ממכשיר אחר"
    const stamp = app().syncStamp
    await s.push()
    expect(app().syncStamp).toBe(stamp)

    await edit(named('mine 2'))
    expect(s.calls[1]).toEqual(expect.objectContaining({ base: 6 }))
  })

  it('שינוי ממכשיר אחר מופיע לבד, עם הודעה', async () => {
    const s = server({ data: named('server'), backup: null, updatedAt: 5 })
    await open()
    const stamp = app().syncStamp!
    s.other(named('phone'))
    await s.push()
    expect(nameOf(app().initialData)).toBe('phone')
    expect(app().syncStamp).toBe(stamp + 1)
    expect(app().initialToast).toContain('ממכשיר אחר')
    // והשמירה הבאה מבוססת על הגרסה החדשה, בלי התנגשות
    await edit(named('mine'))
    expect(nameOf(s.row.data)).toBe('mine')
  })

  it('מכשיר אחר שמר ואנחנו עם עותק ישן: לא דורסים. "אישור" משאיר את שלנו, ושלו נשמר כגיבוי', async () => {
    const s = server({ data: named('server'), backup: null, updatedAt: 5 })
    await open()
    s.other(named('phone'))
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    await edit(named('mine'))
    // השרת סירב, אבל הגרסה מהמכשיר האחר עוד לא הגיעה לדף: מחכים לה לפני ששואלים
    expect(confirm).not.toHaveBeenCalled()
    expect(nameOf(s.row.data)).toBe('phone')
    await s.push()
    await act(async () => {})
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(s.calls[0]).toEqual(expect.objectContaining({ base: 5 }))
    expect(s.calls[1]).toEqual(expect.objectContaining({ force: true }))
    expect(nameOf(s.row.data)).toBe('mine')
    expect(nameOf(s.row.backup)).toBe('phone')
    expect(nameOf(app().initialData)).toBe('mine')
    expect(nameOf(app().initialBackup)).toBe('phone')
  })

  it('"ביטול" עובר לגרסה של המכשיר האחר, ושלנו נשמר כגיבוי', async () => {
    const s = server({ data: named('server'), backup: null, updatedAt: 5 })
    await open()
    s.other(named('phone'))
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    await edit(named('mine'))
    await s.push()
    await act(async () => {})
    expect(nameOf(s.row.data)).toBe('phone')
    expect(nameOf(s.row.backup)).toBe('mine')
    expect(nameOf(app().initialData)).toBe('phone')
    expect(nameOf(app().initialBackup)).toBe('mine')
  })

  it('שרת בגרסה ישנה שלא מכיר את base: שומרים כמו פעם', async () => {
    const s = server({ data: named('server'), backup: null, updatedAt: 5 })
    const modern = h.save
    h.save = async (args) => {
      if ('base' in args) throw new Error('ArgumentValidationError: Object contains extra field `base` that is not in the validator.')
      return modern(args)
    }
    await open()
    await edit(named('mine'))
    await act(async () => {})
    expect(nameOf(s.row.data)).toBe('mine')
    expect(app().account.unsynced).toBe(false)
    await edit(named('mine 2'))
    await act(async () => {})
    expect(nameOf(s.row.data)).toBe('mine 2')
  })

  it('שינויים שנעשו בלי חיבור נשלחים בפתיחה', async () => {
    const s = server({ data: named('server'), backup: null, updatedAt: 5 })
    localStorage.setItem(
      'schedule:owner-cache',
      JSON.stringify({ email: 'me@x.com', data: named('offline edit'), backup: null, savedAt: 'x', pending: true, serverUpdatedAt: 5 }),
    )
    await open()
    await act(async () => {})
    expect(nameOf(app().initialData)).toBe('offline edit')
    expect(nameOf(s.row.data)).toBe('offline edit')
    expect(app().initialToast).toContain('נשלחו לשרת')
  })
})
