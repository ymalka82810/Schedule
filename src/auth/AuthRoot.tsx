import { useEffect, useMemo, useRef } from 'react'
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

  if (isLoading || (isAuthenticated && me === undefined)) return <Loading />

  if (isAuthenticated && me?.isOwner && me.email) {
    return <OwnerApp email={me.email} signOut={() => void signOut()} />
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

/** הבעלים: טוען את המערכת מהשרת ושומר אליו כל שינוי */
function OwnerApp({ email, signOut }: { email: string; signOut: () => void }) {
  const doc = useQuery(anyApi.schedule.get, {}) as
    | { data: ScheduleData; backup: ScheduleData | null }
    | null
    | undefined
  const save = useMutation(anyApi.schedule.save)
  const seeded = useRef(false)

  // בכניסה הראשונה אין עדיין מערכת בשרת: מתחילים מהמערכת האישית ושומרים אותה
  useEffect(() => {
    if (doc === null && !seeded.current) {
      seeded.current = true
      void save({ data: initialData, backup: null })
    }
  }, [doc, save])

  if (doc === undefined) return <Loading />

  return (
    <App
      initialData={doc?.data ?? initialData}
      initialBackup={doc?.backup ?? null}
      account={{ kind: 'owner', email, signOut }}
      onPersist={(data, backup) => void save({ data, backup })}
    />
  )
}
