import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { apiAuth, setCsrfToken, resetCsrfCache } from '../lib/apiCalendario'

const AuthContext = createContext(null)

function clearPrivateClientStorage() {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    const keysToRemove = []
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i)
      if (k && k.startsWith('agenda-chat-')) {
        keysToRemove.push(k)
      }
    }
    for (const k of keysToRemove) {
      window.localStorage.removeItem(k)
    }
  } catch {
    // ignore storage errors
  }
}

export function AuthProvider({ children }) {
  const [state, setState] = useState({
    loading: true,
    authenticated: false,
    user: null,
    error: null,
  })

  const refreshSession = useCallback(async () => {
    try {
      const data = await apiAuth.session()
      if (data && data.authenticated && data.user) {
        setCsrfToken(data.csrfToken || null)
        setState({ loading: false, authenticated: true, user: data.user, error: null })
      } else {
        resetCsrfCache()
        setState({ loading: false, authenticated: false, user: null, error: null })
      }
    } catch (err) {
      resetCsrfCache()
      setState({
        loading: false,
        authenticated: false,
        user: null,
        error: err?.message || 'No se pudo comprobar la sesión con el servidor.',
      })
    }
  }, [])

  useEffect(() => {
    refreshSession()
  }, [refreshSession])

  useEffect(() => {
    function handleUnauthorized() {
      resetCsrfCache()
      clearPrivateClientStorage()
      setState({ loading: false, authenticated: false, user: null, error: null })
    }
    window.addEventListener('agenda:unauthorized', handleUnauthorized)
    return () => window.removeEventListener('agenda:unauthorized', handleUnauthorized)
  }, [])

  const login = useCallback(async ({ username, password }) => {
    const res = await apiAuth.login({ username, password })
    if (res && res.authenticated && res.user) {
      setCsrfToken(res.csrfToken || null)
      setState({ loading: false, authenticated: true, user: res.user, error: null })
      return res
    }
    throw new Error('No se pudo iniciar sesión.')
  }, [])

  const logout = useCallback(async () => {
    try {
      await apiAuth.logout()
    } finally {
      resetCsrfCache()
      clearPrivateClientStorage()
      setState({ loading: false, authenticated: false, user: null, error: null })
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{
        loading: state.loading,
        authenticated: state.authenticated,
        user: state.user,
        error: state.error,
        login,
        logout,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth debe utilizarse dentro de AuthProvider')
  }
  return ctx
}
