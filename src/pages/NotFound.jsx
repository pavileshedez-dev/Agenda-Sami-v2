import { Link } from 'react-router-dom'
import { Compass, ArrowLeft } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="glass-card max-w-md w-full p-8 text-center space-y-4">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-primary-50 text-primary-600 flex items-center justify-center">
          <Compass size={24} />
        </div>
        <h1 className="text-xl font-bold text-gray-900">Página no encontrada</h1>
        <p className="text-sm text-gray-500">
          La dirección que buscas no existe dentro de Agenda Sami.
        </p>
        <div className="pt-2">
          <Link to="/" className="btn-primary text-sm">
            <ArrowLeft size={15} /> Volver a Hoy
          </Link>
        </div>
      </div>
    </div>
  )
}
