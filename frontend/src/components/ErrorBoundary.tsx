import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

// Ohne diese Boundary führt jede unbehandelte Exception beim Rendern (z.B. nach einem
// Vite-HMR-Vollreload mit inkonsistentem Modul-Graph) zu einer komplett leeren Seite ohne
// jede Fehlermeldung - der einzige "Fix" war bisher Ab-/Anmelden oder Browser neu starten,
// weil das eine echte Vollnavigation erzwingt. Diese Boundary macht den Fehler sichtbar und
// bietet einen Reload-Button als denselben Recovery-Weg, ohne dass man sich neu einloggen muss.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unbehandelter Fehler beim Rendern:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-slate-50 px-6 text-center dark:bg-slate-900">
          <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Etwas ist schiefgelaufen.
          </h1>
          <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">
            {this.state.error.message}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-semibold text-white shadow-md hover:bg-brand-accent-light"
          >
            Seite neu laden
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
