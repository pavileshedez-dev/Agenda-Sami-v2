import { Component } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error) {
    // Registro interno mínimo sin exponer detalles técnicos ni trazas en la interfaz
    console.error('[UI ErrorBoundary]', error?.name || 'Error')
  }

  handleReload = () => {
    this.setState({ hasError: false })
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-surface-50 p-6">
          <div className="glass-card max-w-md w-full p-8 text-center space-y-4">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center">
              <AlertTriangle size={24} />
            </div>
            <h1 className="text-xl font-bold text-gray-900">Algo no ha salido bien</h1>
            <p className="text-sm text-gray-500 leading-relaxed">
              Se produjo un error inesperado al mostrar esta pantalla. Tus datos en el servidor siguen intactos.
            </p>
            <div className="pt-2 flex justify-center gap-3">
              <button onClick={this.handleReload} className="btn-primary text-sm">
                <RotateCcw size={15} /> Recargar aplicación
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
