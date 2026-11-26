import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import ErrorBoundary from './components/ErrorBoundary'
import { MascotProvider } from './components/mascots/MascotProvider'
import Layout from './components/Layout'

// Code-splitting por ruta para reducir el bundle inicial
const Hoy = lazy(() => import('./pages/Hoy'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Universidad = lazy(() => import('./pages/Universidad'))
const Horario = lazy(() => import('./pages/Horario'))
const Calendario = lazy(() => import('./pages/Calendario'))
const Agenda = lazy(() => import('./pages/Agenda'))
const Trabajo = lazy(() => import('./pages/Trabajo'))
const MiSemana = lazy(() => import('./pages/MiSemana'))
const Companeros = lazy(() => import('./pages/Companeros'))
const AsesorIA = lazy(() => import('./pages/AsesorIA'))
const Ajustes = lazy(() => import('./pages/Ajustes'))
const NotFound = lazy(() => import('./pages/NotFound'))

function RouteFallback() {
  return (
    <div className="py-12 text-center text-sm text-zinc-500" role="status">
      Cargando vista…
    </div>
  )
}

function RequireAuth({ children }) {
  const { loading, error, refreshSession } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50 p-6">
        <p className="text-sm text-zinc-500" role="status">Cargando Agenda Sami…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50 p-6">
        <div className="surface-card max-w-sm w-full p-6 text-center space-y-3" role="alert">
          <p className="text-sm font-semibold text-zinc-900">No se pudo conectar con el servidor</p>
          <p className="text-xs text-zinc-500">{error}</p>
          <button type="button" onClick={refreshSession} className="btn-primary text-xs px-4 py-2">
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  return children
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route
              element={
                <RequireAuth>
                  <MascotProvider>
                    <Layout />
                  </MascotProvider>
                </RequireAuth>
              }
            >
              <Route path="/" element={<Hoy />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/universidad" element={<Universidad />} />
              <Route path="/horario" element={<Horario />} />
              <Route path="/calendario" element={<Calendario />} />
              <Route path="/agenda" element={<Agenda />} />
              <Route path="/trabajo" element={<Trabajo />} />
              <Route path="/semana" element={<MiSemana />} />
              <Route path="/companeros" element={<Companeros />} />
              <Route path="/ia" element={<AsesorIA />} />
              <Route path="/ajustes" element={<Ajustes />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </Suspense>
      </AuthProvider>
    </ErrorBoundary>
  )
}
