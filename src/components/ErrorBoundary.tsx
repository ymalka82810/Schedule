import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** מה להציג במקום החלק שנפל. reset מנסה לצייר אותו שוב */
  fallback: (reset: () => void, error: unknown) => ReactNode
}

/** תופס שגיאה בציור של חלק מהאתר, כדי שלא כל הדף יהפוך לבן */
export class ErrorBoundary extends Component<Props, { error: unknown; failed: boolean }> {
  state = { error: null as unknown, failed: false }

  static getDerivedStateFromError(error: unknown) {
    return { error, failed: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('שגיאה בציור', error, info.componentStack)
  }

  reset = () => this.setState({ error: null, failed: false })

  render() {
    return this.state.failed ? this.props.fallback(this.reset, this.state.error) : this.props.children
  }
}

/** מסך שלם, כשכל האתר נפל */
export function CrashScreen({ error }: { error: unknown }) {
  return (
    <main className="auth-screen" role="alert">
      <div className="crash">
        <h1>משהו השתבש</h1>
        <p>האתר נתקל בשגיאה ולא הצליח להציג את הלוח. טעינה מחדש בדרך כלל פותרת את זה.</p>
        <p className="muted">מה שנשמר בשרת או במכשיר לא נפגע.</p>
        <button type="button" className="btn btn-primary" onClick={() => location.reload()}>
          טעינה מחדש
        </button>
        <details>
          <summary>פרטי השגיאה</summary>
          <pre dir="ltr">{error instanceof Error ? `${error.name}: ${error.message}` : String(error)}</pre>
        </details>
      </div>
    </main>
  )
}
