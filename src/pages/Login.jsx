import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Lock, LogIn, AlertCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { authenticated, loading, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from?.pathname || '/'

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    document.title = 'Iniciar sesión · Agenda Sami'
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50 p-6">
        <p className="text-sm text-gray-400">Verificando sesión…</p>
      </div>
    )
  }

  if (authenticated) {
    return <Navigate to={from} replace />
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!username.trim() || !password) {
      setError('Introduce tu usuario y contraseña.')
      return
    }
    setSubmitting(true)
    try {
      await login({ username: username.trim(), password })
      navigate(from, { replace: true })
    } catch (err) {
      setError(err?.message || 'Credenciales inválidas.')
      setPassword('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50 px-4 py-10">
      <div className="glass-card w-full max-w-sm p-7 space-y-6">
        <div className="flex flex-col items-center text-center space-y-2">
          <img src="/logo.png" alt="Agenda Sami" className="w-12 h-12 rounded-2xl shadow-md" />
          <h1 className="text-xl font-bold text-gray-900">Agenda Sami</h1>
          <p className="text-xs text-gray-500 flex items-center gap-1.5">
            <Lock size={13} className="text-primary-600" />
            Acceso privado protegido
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs text-rose-700 flex items-start gap-2"
          >
            <AlertCircle size={15} className="shrink-0 mt-0.5 text-rose-500" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="login-username" className="block text-xs font-semibold text-gray-700 mb-1">
              Usuario
            </label>
            <input
              id="login-username"
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="sami"
              className="input-field"
            />
          </div>

          <div>
            <label htmlFor="login-password" className="block text-xs font-semibold text-gray-700 mb-1">
              Contraseña
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="input-field"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary w-full text-sm py-2.5 disabled:opacity-60"
          >
            <LogIn size={16} />
            {submitting ? 'Accediendo…' : 'Iniciar sesión'}
          </button>
        </form>
      </div>
    </div>
  )
}
