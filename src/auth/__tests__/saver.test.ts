import { describe, expect, it } from 'vitest'
import { Saver, type SaveResult } from '../saver'

/** שרת מדומה: שומר רק כשה-base תואם לגרסה שלו, כמו convex/schedule.ts */
function fakeServer(start: number | null = 1) {
  const state = { updatedAt: start, value: 'server', calls: [] as Array<{ item: string; base: number | null; force: boolean }> }
  let release: Array<() => void> = []
  let hold = false
  const send = (item: string, base: number | null, force: boolean): Promise<SaveResult> =>
    new Promise((resolve, reject) => {
      const run = () => {
        state.calls.push({ item, base, force })
        if (item === 'boom') return reject(new Error('network'))
        if (!force && base !== state.updatedAt) return resolve({ ok: false, updatedAt: state.updatedAt })
        state.updatedAt = (state.updatedAt ?? 0) + 1
        state.value = item
        resolve({ ok: true, updatedAt: state.updatedAt })
      }
      if (hold) release.push(run)
      else run()
    })
  return {
    state,
    send,
    /** השמירות הבאות מחכות עד flush */
    pause: () => (hold = true),
    flush: () => {
      hold = false
      const all = release
      release = []
      all.forEach((r) => r())
    },
    /** מכשיר אחר שמר */
    other: (value: string) => {
      state.updatedAt = (state.updatedAt ?? 0) + 1
      state.value = value
    },
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

function setup(start: number | null = 1) {
  const server = fakeServer(start)
  const log = { saved: [] as string[], conflicts: [] as Array<[string, number | null]>, errors: 0 }
  const saver = new Saver<string>(start, {
    send: server.send,
    onSaved: (item) => log.saved.push(item),
    onConflict: (item, at) => log.conflicts.push([item, at]),
    onError: () => log.errors++,
  })
  return { server, saver, log }
}

describe('שמירה לשרת עם הגנה מדריסה', () => {
  it('שמירה רגילה מעדכנת את הבסיס', async () => {
    const { server, saver, log } = setup()
    saver.push('a')
    await tick()
    expect(log.saved).toEqual(['a'])
    expect(saver.base).toBe(2)
    expect(server.state.value).toBe('a')
    expect(saver.busy).toBe(false)
  })

  it('שמירות מהירות ברצף מאותו מכשיר לא מתנגשות זו בזו', async () => {
    const { server, saver, log } = setup()
    server.pause()
    saver.push('a')
    saver.push('b')
    saver.push('c')
    expect(saver.busy).toBe(true)
    server.flush()
    await tick()
    await tick()
    // הראשונה נשלחה, ומהשתיים שחיכו נשלחה רק האחרונה
    expect(log.saved).toEqual(['a', 'c'])
    expect(log.conflicts).toEqual([])
    expect(server.state.value).toBe('c')
    expect(saver.base).toBe(server.state.updatedAt)
  })

  it('מכשיר אחר שמר בינתיים: לא דורסים, ושואלים', async () => {
    const { server, saver, log } = setup()
    server.other('theirs')
    saver.push('mine')
    await tick()
    expect(server.state.value).toBe('theirs')
    expect(log.conflicts).toEqual([['mine', 2]])
    expect(saver.busy).toBe(true)
  })

  it('בהתנגשות, שמירה חדשה לא נשלחת עד שמחליטים', async () => {
    const { server, saver, log } = setup()
    server.other('theirs')
    saver.push('mine')
    await tick()
    saver.push('mine 2')
    await tick()
    expect(server.state.calls).toHaveLength(1)
    expect(server.state.value).toBe('theirs')
    expect(log.conflicts).toHaveLength(1)
  })

  it('בחירה בגרסה של המכשיר מחליפה את מה שבשרת', async () => {
    const { server, saver, log } = setup()
    server.other('theirs')
    saver.push('mine')
    await tick()
    saver.keepMine('mine', 2)
    await tick()
    expect(server.state.value).toBe('mine')
    expect(log.saved).toEqual(['mine'])
    expect(saver.busy).toBe(false)
    // ומכאן ממשיכים רגיל
    saver.push('next')
    await tick()
    expect(server.state.value).toBe('next')
    expect(log.conflicts).toHaveLength(1)
  })

  it('בחירה בגרסה של השרת זורקת את מה שחיכה, והשמירה הבאה מבוססת עליה', async () => {
    const { server, saver, log } = setup()
    server.other('theirs')
    saver.push('mine')
    await tick()
    saver.takeTheirs(2)
    expect(saver.busy).toBe(false)
    expect(server.state.value).toBe('theirs')
    saver.push('theirs + edit')
    await tick()
    expect(server.state.value).toBe('theirs + edit')
    expect(log.conflicts).toHaveLength(1)
  })

  it('התנגשות באמצע רצף מוסרת את המצב העדכני ביותר', async () => {
    const { server, saver, log } = setup()
    server.pause()
    saver.push('a')
    saver.push('b')
    server.other('theirs')
    server.flush()
    await tick()
    expect(log.conflicts).toEqual([['b', 2]])
    expect(server.state.value).toBe('theirs')
  })

  it('כישלון בשליחה משאיר את הפריט בתור, והשמירה הבאה מחליפה אותו', async () => {
    const { server, saver, log } = setup()
    saver.push('boom')
    await tick()
    expect(log.errors).toBe(1)
    expect(saver.busy).toBe(true)
    saver.push('ok')
    await tick()
    expect(log.saved).toEqual(['ok'])
    expect(server.state.value).toBe('ok')
    expect(saver.busy).toBe(false)
  })

  it('שמירה ראשונה כשאין עדיין מערכת בשרת', async () => {
    const { server, saver, log } = setup(null)
    saver.push('first')
    await tick()
    expect(log.saved).toEqual(['first'])
    expect(server.state.calls[0].base).toBeNull()
    expect(saver.base).toBe(1)
  })
})
