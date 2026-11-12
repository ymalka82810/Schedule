import { useMemo, type ReactNode } from 'react'
import { ConvexReactClient, useConvexAuth, useQuery } from 'convex/react'
import { ConvexAuthProvider, useAuthActions } from '@convex-dev/auth/react'
import { anyApi } from 'convex/server'

/** כתובת האתר אליה חוזרים אחרי ההתחברות עם Google */
const siteUrl = () => new URL(import.meta.env.BASE_URL, window.location.origin).href.replace(/\/$/, '')

export function AuthRoot({ url, children }: { url: string; children: ReactNode }) {
  const client = useMemo(() => new ConvexReactClient(url), [url])
  return (
    <ConvexAuthProvider client={client}>
      <AuthGate>{children}</AuthGate>
    </ConvexAuthProvider>
  )
}

function AuthGate({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth()
  const { signIn, signOut } = useAuthActions()
  const me = useQuery(anyApi.users.me, isAuthenticated ? {} : 'skip') as
    | { email: string | null; isOwner: boolean }
    | null
    | undefined

  if (isLoading || (isAuthenticated && me === undefined)) {
    return (
      <main className="auth-screen">
        <p className="muted" role="status">
          טוען…
        </p>
      </main>
    )
  }

  if (!isAuthenticated) {
    return (
      <main className="auth-screen">
        <div className="auth-card">
          <h1>המערכת שלי</h1>
          <p className="muted">האתר פרטי. הכניסה רק עם חשבון Google של הבעלים.</p>
          <button type="button" className="btn btn-primary" onClick={() => void signIn('google', { redirectTo: siteUrl() })}>
            כניסה עם Google
          </button>
        </div>
      </main>
    )
  }

  if (!me?.isOwner) {
    return (
      <main className="auth-screen">
        <div className="auth-card">
          <h1>אין הרשאה</h1>
          <p className="muted">
            {me?.email ? (
              <>
                החשבון <bdi dir="ltr">{me.email}</bdi> לא מורשה להיכנס לאתר.
              </>
            ) : (
              'החשבון הזה לא מורשה להיכנס לאתר.'
            )}
          </p>
          <button type="button" className="btn" onClick={() => void signOut()}>
            התנתקות
          </button>
        </div>
      </main>
    )
  }

  return (
    <>
      {children}
      <button type="button" className="link-btn auth-out" onClick={() => void signOut()}>
        התנתקות
      </button>
    </>
  )
}
