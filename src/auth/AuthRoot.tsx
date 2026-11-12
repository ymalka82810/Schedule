import { useEffect, useMemo, useRef, useState } from 'react'
import { clearOwnerCache, decideSync, loadOwnerCache, markSynced, saveOwnerCache } from './offlineCache'
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

/**
 * הבעלים: טוען את המערכת מהשרת ושומר אליו כל שינוי.
 * כל שינוי נשמר קודם במכשיר ומסומן כממתין, ורק כשהשרת מאשר הסימון יורד.
 * כך שינוי שנעשה בלי חיבור, או שהחיבור נפל באמצעו, נשלח בכניסה הבאה.
 */
function OwnerApp({ email, signOut }: { email: string; signOut: () => void }) {
  const doc = useQuery(anyApi.schedule.get, {}) as
    | { data: ScheduleData; backup: ScheduleData | null; updatedAt?: number }
    | null
    | undefined
  const save = useMutation(anyApi.schedule.save)
  const seeded = useRef(false)
  /** המערכת לפתיחה אחרי הסנכרון. null = עוד לא הוחלט */
  const [start, setStart] = useState<{ data: ScheduleData; backup: ScheduleData | null; note?: string } | null>(null)
  const [unsynced, setUnsynced] = useState(false)

  /** שומר במכשיר, שולח לשרת, ומוריד את הסימון כשהשרת אישר */
  const persist = (data: ScheduleData, backup: ScheduleData | null, serverUpdatedAt?: number) => {
    const prev = loadOwnerCache()
    const token = saveOwnerCache({
      email,
      data,
      backup,
      pending: true,
      serverUpdatedAt: serverUpdatedAt ?? prev?.serverUpdatedAt,
    })
    setUnsynced(true)
    void (save({ data, backup }) as Promise<number | null>)
      .then((updatedAt) => {
        if (typeof updatedAt === 'number') markSynced(token, updatedAt)
        setUnsynced(!!loadOwnerCache()?.pending)
      })
      .catch(() => setUnsynced(true))
  }

  // כשהמערכת מהשרת מגיעה: אם יש במכשיר שינויים שלא נשלחו, שולחים אותם (או שואלים, אם גם השרת השתנה).
  // זה סנכרון עם מערכות חיצוניות (המכשיר והשרת), ורץ פעם אחת בטעינה, ולכן setState כאן במקום
  /* oxlint-disable react/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!doc || start) return
    const decision = decideSync(loadOwnerCache(), email, doc.updatedAt)
    if (decision.action === 'none') {
      saveOwnerCache({ email, data: doc.data, backup: doc.backup, pending: false, serverUpdatedAt: doc.updatedAt })
      setStart({ data: doc.data, backup: doc.backup })
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
      persist(decision.data, backup, doc.updatedAt)
      setStart({
        data: decision.data,
        backup,
        note: decision.action === 'upload' ? 'השינויים שעשית בלי חיבור נשלחו לשרת.' : undefined,
      })
    } else {
      saveOwnerCache({ email, data: doc.data, backup: decision.data, pending: false, serverUpdatedAt: doc.updatedAt })
      void save({ data: doc.data, backup: decision.data })
      setStart({ data: doc.data, backup: decision.data })
    }
    // persist ו-save יציבים מספיק כאן: ההחלטה מתקבלת פעם אחת בטעינה
  }, [doc, start, email])
  /* oxlint-enable react/set-state-in-effect, react-hooks/exhaustive-deps */

  // בכניסה הראשונה אין עדיין מערכת בשרת: מתחילים מהמערכת האישית ושומרים אותה
  useEffect(() => {
    if (doc === null && !seeded.current) {
      seeded.current = true
      void save({ data: initialData, backup: null })
    }
  }, [doc, save])

  if (doc === undefined) return <WaitOrOffline />
  if (doc === null) return <Loading />
  if (!start) return <Loading />

  return (
    <App
      initialData={start.data}
      initialBackup={start.backup}
      initialToast={start.note}
      account={{ kind: 'owner', email, signOut, unsynced }}
      onPersist={(data, backup) => persist(data, backup)}
    />
  )
}
