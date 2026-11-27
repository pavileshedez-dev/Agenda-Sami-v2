import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  Sun,
  CalendarDays,
  CheckSquare,
  GraduationCap,
  Clock,
  Briefcase,
  CalendarRange,
  Heart,
  Settings,
  Menu,
  X,
  Wifi,
  WifiOff,
  LogOut,
  MoreHorizontal,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import MascotStage from './mascots/MascotStage'

const navGroups = [
  {
    id: 'diario',
    label: 'Diario',
    items: [
      { to: '/', icon: Sun, label: 'Hoy' },
      { to: '/calendario', icon: CalendarDays, label: 'Calendario' },
      { to: '/agenda', icon: CheckSquare, label: 'Agenda' },
    ],
  },
  {
    id: 'universidad',
    label: 'Universidad',
    items: [
      { to: '/universidad', icon: GraduationCap, label: 'Asignaturas y Tareas' },
      { to: '/horario', icon: Clock, label: 'Horario' },
    ],
  },
  {
    id: 'trabajo',
    label: 'Trabajo y Balance',
    items: [
      { to: '/trabajo', icon: Briefcase, label: 'Trabajo' },
      { to: '/semana', icon: CalendarRange, label: 'Mi Semana' },
    ],
  },
  {
    id: 'herramientas',
    label: 'Asistentes y Sistema',
    items: [
      { to: '/companeros', icon: Heart, label: 'Compañeros e IA' },
      { to: '/ajustes', icon: Settings, label: 'Ajustes' },
    ],
  },
]

const mobilePrimaryItems = [
  { to: '/', icon: Sun, label: 'Hoy' },
  { to: '/calendario', icon: CalendarDays, label: 'Calendario' },
  { to: '/universidad', icon: GraduationCap, label: 'Universidad' },
  { to: '/trabajo', icon: Briefcase, label: 'Trabajo' },
]

const mobileOverflowPaths = ['/agenda', '/horario', '/semana', '/companeros', '/ia', '/ajustes', '/dashboard']

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true))
  const [reconnectedNotice, setReconnectedNotice] = useState(false)
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const isOverflowActive = mobileOverflowPaths.some((p) => location.pathname.startsWith(p))

  async function handleLogout() {
    setSidebarOpen(false)
    await logout()
    navigate('/login', { replace: true })
  }

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true)
      setReconnectedNotice(true)
      setTimeout(() => setReconnectedNotice(false), 4000)
    }
    function handleOffline() {
      setIsOnline(false)
      setReconnectedNotice(false)
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Cerrar el cajón móvil con Escape
  useEffect(() => {
    if (!sidebarOpen) return
    function onKeyDown(e) {
      if (e.key === 'Escape') setSidebarOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [sidebarOpen])

  return (
    <div className="min-h-screen w-full overflow-x-clip flex flex-col lg:flex-row bg-surface-50">
      {/* Skip link accesible (WCAG 2.4.1) */}
      <a href="#main-content" className="skip-link">
        Saltar al contenido principal
      </a>

      {/* ── Cabecera Móvil ── */}
      <header className="lg:hidden w-full flex items-center justify-between px-4 h-14 bg-white border-b border-surface-200 sticky top-0 z-30">
        <NavLink to="/" className="flex items-center gap-2.5 min-h-[44px]" aria-label="Ir a Hoy">
          <img src="/logo.png" alt="" aria-hidden="true" className="w-7 h-7 rounded-lg" />
          <span className="font-semibold text-zinc-900 text-sm tracking-tight">Agenda Sami</span>
        </NavLink>
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="btn-ghost p-2 min-w-[44px] min-h-[44px]"
          aria-label="Abrir menú de navegación"
          aria-expanded={sidebarOpen}
          aria-controls="app-sidebar"
        >
          <Menu size={20} aria-hidden="true" />
        </button>
      </header>

      {/* ── Fondo del cajón móvil ── */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-zinc-950/35 backdrop-blur-[2px] animate-fade-in"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar Escritorio + Cajón Móvil ── */}
      <aside
        id="app-sidebar"
        className={`
          fixed lg:sticky top-0 left-0 z-50 h-dvh w-64 shrink-0
          bg-white border-r border-surface-200
          flex flex-col py-5 px-3
          transition-transform duration-200 ease-out
          ${sidebarOpen ? 'translate-x-0 shadow-elevated' : '-translate-x-full'}
          lg:translate-x-0 lg:shadow-none
        `}
      >
        {/* Marca (sin <h1> para respetar un único H1 por página) */}
        <div className="flex items-center justify-between gap-2 px-2.5 mb-6">
          <NavLink
            to="/"
            onClick={() => setSidebarOpen(false)}
            className="flex items-center gap-2.5 min-w-0"
          >
            <img src="/logo.png" alt="" aria-hidden="true" className="w-9 h-9 rounded-xl border border-surface-200" />
            <div className="min-w-0">
              <div className="font-semibold text-zinc-900 text-sm leading-tight truncate">Agenda Sami</div>
              <div className="text-xs text-zinc-500 truncate">UCM y Trabajo</div>
            </div>
          </NavLink>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden btn-ghost p-1.5 min-w-[40px] min-h-[40px] text-zinc-500"
            aria-label="Cerrar menú"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Navegación principal agrupada */}
        <nav aria-label="Navegación principal" className="flex flex-col gap-5 flex-1 overflow-y-auto pr-0.5">
          {navGroups.map((group) => (
            <div key={group.id} className="space-y-1">
              <p className="px-2.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                {group.label}
              </p>
              <div className="flex flex-col gap-0.5">
                {group.items.map(({ to, icon: Icon, label }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === '/'}
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13.5px] font-medium transition-colors duration-150
                      ${
                        isActive
                          ? 'bg-primary-50 text-primary-700'
                          : 'text-zinc-600 hover:bg-surface-100 hover:text-zinc-900'
                      }`
                    }
                  >
                    <Icon size={17} strokeWidth={1.85} aria-hidden="true" className="shrink-0" />
                    <span className="truncate">{label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Pie del sidebar */}
        <div className="px-2 pt-3 mt-3 border-t border-surface-200 space-y-2">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-zinc-500 hover:bg-rose-50 hover:text-rose-700 transition-colors min-h-[38px]"
          >
            <LogOut size={14} aria-hidden="true" />
            <span>Cerrar sesión{user?.username ? ` (${user.username})` : ''}</span>
          </button>
        </div>
      </aside>

      {/* ── Contenido principal ── */}
      <main id="main-content" tabIndex={-1} className="flex-1 min-w-0 min-h-screen pb-24 lg:pb-12 flex flex-col focus:outline-none">
        {!isOnline && (
          <div role="alert" className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2 text-xs flex items-center justify-between gap-2 sticky top-14 lg:top-0 z-20">
            <div className="flex items-center gap-2 font-medium">
              <WifiOff size={15} className="text-amber-600 shrink-0" aria-hidden="true" />
              <span>Sin conexión: se requiere conexión con el servidor para consultar o guardar cambios.</span>
            </div>
            <span className="text-[10px] bg-amber-200/80 px-2 py-0.5 rounded font-bold uppercase text-amber-800 shrink-0">Offline</span>
          </div>
        )}
        {reconnectedNotice && (
          <div role="status" aria-live="polite" className="bg-emerald-50 border-b border-emerald-200 text-emerald-900 px-4 py-2 text-xs flex items-center gap-2 font-medium sticky top-14 lg:top-0 z-20">
            <Wifi size={15} className="text-emerald-600 shrink-0" aria-hidden="true" />
            <span>Conexión con el servidor restablecida.</span>
          </div>
        )}

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full flex-1">
          <Outlet />
        </div>
      </main>

      {/* ── Navegación inferior móvil (5 pilares diarios) ── */}
      <nav
        aria-label="Navegación rápida móvil"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-sm border-t border-surface-200 px-1 pt-1 safe-area-bottom"
      >
        <div className="grid grid-cols-5">
          {mobilePrimaryItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0.5 min-h-[48px] px-1 py-1 rounded-lg text-[11px] font-medium transition-colors
                ${isActive ? 'text-primary-600' : 'text-zinc-500 hover:text-zinc-800'}`
              }
            >
              <Icon size={19} strokeWidth={1.85} aria-hidden="true" />
              <span className="truncate max-w-full">{label}</span>
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Más secciones"
            aria-expanded={sidebarOpen}
            className={`flex flex-col items-center justify-center gap-0.5 min-h-[48px] px-1 py-1 rounded-lg text-[11px] font-medium transition-colors
              ${isOverflowActive || sidebarOpen ? 'text-primary-600' : 'text-zinc-500 hover:text-zinc-800'}`}
          >
            <MoreHorizontal size={19} strokeWidth={1.85} aria-hidden="true" />
            <span>Más</span>
          </button>
        </div>
      </nav>

      {/* ── Barra inferior interactiva y ocultable de mascotas pixel art ── */}
      <MascotStage />
    </div>
  )
}
