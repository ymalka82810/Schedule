import { useEffect, useState, type FormEvent } from 'react'

interface Props {
  sendCode: (email: string) => Promise<void>
  verifyCode: (email: string, code: string) => Promise<boolean>
  onClose: () => void
}

/** כניסת הבעלים: מייל, ואז קוד חד-פעמי שנשלח אליו */
export function LoginDialog({ sendCode, verifyCode, onClose }: Props) {
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const submitEmail = async (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setBusy(true)
    setError(null)
    try {
      await sendCode(email.trim())
      setStep('code')
    } catch (err) {
      console.error(err)
      setError('לא הצלחתי לשלוח קוד. ודא שזה המייל של הבעלים ושהשרת מחובר.')
    } finally {
      setBusy(false)
    }
  }

  const submitCode = async (e: FormEvent) => {
    e.preventDefault()
    if (!code.trim()) return
    setBusy(true)
    setError(null)
    try {
      const ok = await verifyCode(email.trim(), code.trim())
      if (!ok) setError('הקוד שגוי או שפג תוקפו.')
    } catch (err) {
      console.error(err)
      setError('הקוד שגוי או שפג תוקפו.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog dialog-compact" role="dialog" aria-modal="true" aria-labelledby="login-title">
        <header className="dialog-head">
          <h2 id="login-title">כניסה (בעלים)</h2>
          <button type="button" className="btn btn-icon" aria-label="סגירה" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="dialog-body">
          {step === 'email' ? (
            <form className="login-form" onSubmit={(e) => void submitEmail(e)}>
              <p className="muted">נשלח קוד חד-פעמי למייל של הבעלים. רק הוא יכול להיכנס.</p>
              <label className="field">
                <span>המייל שלך</span>
                <input
                  type="email"
                  dir="ltr"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>
              {error && (
                <p className="import-error" role="alert">
                  {error}
                </p>
              )}
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? 'שולח…' : 'שליחת קוד'}
              </button>
            </form>
          ) : (
            <form className="login-form" onSubmit={(e) => void submitCode(e)}>
              <p className="muted">
                שלחנו קוד ל-<bdi dir="ltr">{email}</bdi>. הכנס אותו כאן.
              </p>
              <label className="field">
                <span>קוד</span>
                <input
                  type="text"
                  dir="ltr"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={8}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  required
                />
              </label>
              {error && (
                <p className="import-error" role="alert">
                  {error}
                </p>
              )}
              <div className="import-actions">
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? 'בודק…' : 'כניסה'}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setStep('email')
                    setCode('')
                    setError(null)
                  }}
                >
                  מייל אחר או קוד חדש
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
