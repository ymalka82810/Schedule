import { useEffect, useMemo, useRef, useState } from 'react'
import { clearOwnerCache, decideSync, loadOwnerCache, markSynced, saveOwnerCache } from './offlineCache'
import { Saver, type SaveResult } from './saver'
import { ConvexReactClient, useConvexAuth, useMutation, useQuery } from 'convex/react'
import { ConvexAuthProvider, useAuthActions } from '@convex-dev/auth/react'
import { anyApi } from 'convex/server'
import App from '../App'
import { initialData } from '../data/initial'
import { emptyData } from '../data/empty'
import type { ScheduleData } from '../types'

/** האתר פתוח לכולם. ההתחברות רק מוסיפה אפשרות לבעלים, ואינה חוסמת אף אחד */
export function AuthRoot({ url }: { url: string }) {
  const client = useMemo(() => new ConvexReactClient(url), [url])
  return (
    <ConvexAuthProvider client={client}>
      <Router />
    </ConvexAuthProvider>
  )
}

/**
 * בזמן ההמתנה לשרת: אם אין רשת, או שההמתנה ארוכה, ויש עותק של המערכת במכשיר,
 * מציגים אותו, ואפשר לערוך. השינויים נשמרים במכשיר ונשלחים לשרת כשהחיבור חוזר
 * (ראו OwnerApp). כשהחיבור חוזר, הדף מתחלף לבד למערכת מהשרת.
 */
function WaitOrOffline() {
  const [slow, setSlow] = useState(false)
  const [offline, setOffline] = useState(() => !navigator.onLine)
  useEffect(() => {
    const t = window.setTimeout(() => setSlow(true), 4000)
    const on = () => setOffline(false)
    const off = () => setOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  const cache = useMemo(() => loadOwnerCache(), [])
  if (cache && (offline || slow)) {
    return (
      <App
        initialData={cache.data}
        initialBackup={cache.backup}
        account={{ kind: 'offline', email: cache.email, savedAt: cache.savedAt, pending: !!cache.pending }}
        onPersist={(data, backup) => {
          const now = loadOwnerCache() ?? cache
          saveOwnerCache({ ...now, data, backup, pending: true })
        }}
      />
    )
  }
  return <Loading />
}

function Loading() {
  return (
    <main className="auth-screen">
      <p className="muted" role="status">
        טוען…
      </p>
    </main>
  )
}

function Router() {
  const { isLoading, isAuthenticated } = useConvexAuth()
  const { signIn, signOut } = useAuthActions()
  const me = useQuery(anyApi.users.me, isAuthenticated ? {} : 'skip') as
    | { email: string | null; isOwner: boolean }
    | null
    | undefined

  // מחובר לחשבון שאינו המורשה (לא אמור לקרות, השרת חוסם): מנתקים ומציגים סביבת בדיקה
  const wrongAccount = isAuthenticated && me !== undefined && !(me?.isOwner && me.email)
  useEffect(() => {
    if (wrongAccount) void signOut()
  }, [wrongAccount, signOut])

  const waiting = isLoading || (isAuthenticated && me === undefined)
  if (waiting) return <WaitOrOffline />

  if (isAuthenticated && me?.isOwner && me.email) {
    return (
      <OwnerApp
        email={me.email}
        signOut={() => {
          clearOwnerCache()
          void signOut()
        }}
      />
    )
  }

  return (
    <App
      initialData={emptyData}
      initialBackup={null}
      account={{
        kind: 'guest',
        sendCode: async (email) => {
          await signIn('resend-otp', { email })
        },
        verifyCode: async (email, code) => {
          const result = await signIn('resend-otp', { email, code })
          return result.signingIn
        },
      }}
    />
  )
}

type Saved = { data: ScheduleData; backup: ScheduleData | null }
type Doc = Saved & { updatedAt?: number }

const CONFLICT_TEXT =
  'המערכת השתנתה בינתיים ממכשיר אחר.\n\n' +
  'אישור = להשאיר את מה שערכת במכשיר הזה. ביטול = לעבור למה שנשמר מהמכשיר האחר.\n' +
  'הגרסה שלא נבחרה נשמרת, ואפשר לחזור אליה ב"ייבוא וגיבוי" ← שחזור.'

/**
 * הבעלים: טוען את המערכת מהשרת ושומר אליו כל שינוי.
 * כל שינוי נשמר קודם במכשיר ומסומן כממתין, ורק כשהשרת מאשר הסימון יורד.
 * כך שינוי שנעשה בלי חיבור, או שהחיבור נפל באמצעו, נשלח בכניסה הבאה.
 *
 * שני מכשירים פתוחים יחד: שינוי ממכשיר אחר מופיע כאן לבד. אם גם כאן נערך משהו
 * שעוד לא נשמר, השרת לא נותן לדרוס, ושואלים איזו גרסה להשאיר (ראו saver.ts).
 */
function OwnerApp({ email, signOut }: { email: string; signOut: () => void }) {
  const doc = useQuery(anyApi.schedule.get, {}) as Doc | null | undefined
  const save = useMutation(anyApi.schedule.save)
  const seeded = useRef(false)
  /** המערכת לפתיחה אחרי הסנכרון. null = עוד לא הוחלט. stamp עולה כשהנתונים מוחלפים מבחוץ */
  const [start, setStart] = useState<(Saved & { note?: string; stamp: number }) | null>(null)
  const [unsynced, setUnsynced] = useState(false)
  /** הגרסה האחרונה שהגיעה מהשרת, בשביל התנגשות */
  const docRef = useRef(doc)
  /** שרת בגרסה ישנה שלא מכיר את base (עד שהוא מתעדכן): שומרים כמו פעם */
  const legacyServer = useRef(false)

  /** מחליף את מה שמוצג, בלי לטעון את הדף מחדש */
  const show = (next: Saved, note?: string) => setStart((s) => ({ ...next, note, stamp: (s?.stamp ?? 0) + 1 }))

  const saverRef = useRef<Saver<Saved & { token: string }> | null>(null)
  const getSaver = () =>
    (saverRef.current ??= new Saver<Saved & { token: string }>(null, {
      send: async ({ data, backup }, base, force) => {
        if (!legacyServer.current) {
          try {
            return (await save({ data, backup, base, force })) as SaveResult
          } catch (err) {
            // רק "השרת לא מכיר את השדה" עובר לשמירה הישנה. כל שגיאה אחרת נשארת שגיאה
            if (!/ArgumentValidationError|extra field|not in the validator/i.test(String(err))) throw err
            legacyServer.current = true
          }
        }
        return { ok: true, updatedAt: (await save({ data, backup })) as number }
      },
      onSaved: (item, updatedAt) => {
        markSynced(item.token, updatedAt)
        setUnsynced(!!loadOwnerCache()?.pending)
      },
      onConflict: (mine, serverUpdatedAt) => {
        conflict.current = { mine, serverUpdatedAt }
        resolveConflict()
      },
      onError: () => setUnsynced(true),
    }))

  /** התנגשות שמחכה שהגרסה מהמכשיר האחר תגיע לדף, כדי שיהיה מה להציג ומה לשמור כגיבוי */
  const conflict = useRef<{ mine: Saved; serverUpdatedAt: number | null } | null>(null)
  const resolveConflict = () => {
    const pending = conflict.current
    const server = docRef.current
    if (!pending) return
    // השרת דיווח על גרסה שעוד לא הגיעה לכאן: מחכים לה (האפקט למטה יקרא לנו שוב)
    if (!server || (server.updatedAt ?? 0) < (pending.serverUpdatedAt ?? 0)) return
    conflict.current = null
    const saver = getSaver()
    const at = server.updatedAt ?? null
    const { mine } = pending
    if (window.confirm(CONFLICT_TEXT)) {
      // הגרסה מהמכשיר האחר נשמרת כגיבוי לשחזור
      const next = { data: mine.data, backup: server.data }
      const token = saveOwnerCache({ email, ...next, pending: true, serverUpdatedAt: at ?? undefined })
      saver.keepMine({ ...next, token }, at)
      show(next)
    } else {
      // גם בשרת: הגרסה מהמכשיר הזה נשמרת כגיבוי
      const next = { data: server.data, backup: mine.data }
      const token = saveOwnerCache({ email, ...next, pending: true, serverUpdatedAt: at ?? undefined })
      saver.takeTheirs(at)
      saver.push({ ...next, token })
      show(next, 'עברת לגרסה מהמכשיר האחר. מה שערכת כאן שמור ב"ייבוא וגיבוי" ← שחזור.')
    }
  }

  /** שומר במכשיר, שולח לשרת, ומוריד את הסימון כשהשרת אישר */
  const persist = (data: ScheduleData, backup: ScheduleData | null) => {
    const saver = getSaver()
    const token = saveOwnerCache({ email, data, backup, pending: true, serverUpdatedAt: saver.base ?? undefined })
    setUnsynced(true)
    saver.push({ data, backup, token })
  }

  // סנכרון עם מערכות חיצוניות (המכשיר והשרת), ולכן setState כאן במקום.
  /* oxlint-disable react/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    docRef.current = doc
    if (!doc) return
    const saver = getSaver()
    if (conflict.current) {
      resolveConflict()
      return
    }

    // אחרי הפתיחה: שינוי שהגיע ממכשיר אחר מוצג מיד, כל עוד אין כאן שינוי שעוד לא נשמר
    // (אם יש, השמירה שלו תיתקל בהתנגשות, ושם שואלים)
    if (start) {
      if (doc.updatedAt === undefined || doc.updatedAt === saver.base || saver.busy) return
      saver.base = doc.updatedAt
      saveOwnerCache({ email, data: doc.data, backup: doc.backup, pending: false, serverUpdatedAt: doc.updatedAt })
      setUnsynced(false)
      show({ data: doc.data, backup: doc.backup }, 'המערכת התעדכנה ממכשיר אחר.')
      return
    }

    // בפתיחה: אם יש במכשיר שינויים שלא נשלחו, שולחים אותם (או שואלים, אם גם השרת השתנה)
    saver.base = doc.updatedAt ?? null
    const decision = decideSync(loadOwnerCache(), email, doc.updatedAt)
    if (decision.action === 'none') {
      saveOwnerCache({ email, data: doc.data, backup: doc.backup, pending: false, serverUpdatedAt: doc.updatedAt })
      show({ data: doc.data, backup: doc.backup })
      return
    }
    const keepDevice =
      decision.action === 'upload' ||
      window.confirm(
        'בזמן שהיית בלי חיבור, המערכת השתנתה גם בשרת (כנראה ממכשיר אחר).\n\n' +
          'אישור = להשאיר את מה שערכת במכשיר הזה. ביטול = להשאיר את מה שבשרת.\n' +
          'הגרסה שלא נבחרה נשמרת, ואפשר לחזור אליה ב"ייבוא וגיבוי" ← שחזור.',
      )
    if (keepDevice) {
      // בהתנגשות, הגרסה מהשרת נשמרת כגיבוי לשחזור
      const backup = decision.action === 'conflict' ? doc.data : decision.backup
      persist(decision.data, backup)
      show({ data: decision.data, backup }, decision.action === 'upload' ? 'השינויים שעשית בלי חיבור נשלחו לשרת.' : undefined)
    } else {
      persist(doc.data, decision.data)
      show({ data: doc.data, backup: decision.data })
    }
    // persist ו-show יציבים מספיק כאן: האפקט תלוי רק במה שהגיע מהשרת
  }, [doc, email])
  /* oxlint-enable react/set-state-in-effect, react-hooks/exhaustive-deps */

  // כשהרשת חוזרת: ניסיון נוסף לשמירה שנכשלה
  useEffect(() => {
    const retry = () => saverRef.current?.retry()
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
  }, [])

  // בכניסה הראשונה אין עדיין מערכת בשרת: מתחילים מהמערכת האישית ושומרים אותה
  useEffect(() => {
    if (doc === null && !seeded.current) {
      seeded.current = true
      void save({ data: initialData, backup: null })
    }
  }, [doc, save])

  if (doc === undefined && !start) return <WaitOrOffline />
  if (!start) return <Loading />

  return (
    <App
      initialData={start.data}
      initialBackup={start.backup}
      initialToast={start.note}
      syncStamp={start.stamp}
      account={{ kind: 'owner', email, signOut, unsynced }}
      onPersist={persist}
    />
  )
}
