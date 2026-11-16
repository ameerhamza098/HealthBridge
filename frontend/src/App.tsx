import { useEffect, useRef, useState, type ReactElement } from 'react'
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth'
import type { Appointment, Role } from './api'
import { fmt } from './api'
import { Icon } from './icons'
import { Avatar, EmptyState, FeedbackProvider, useFetch } from './ui'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Appointments from './pages/Appointments'
import Patients from './pages/Patients'
import { Queue, Schedule } from './pages/Staff'
import { Consents, Timeline } from './pages/Records'
import { AuditLog, Users } from './pages/Admin'
import Faq from './pages/Faq'

interface NavItem { to: string; label: string; icon: string }
const STAFF: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { to: '/appointments', label: 'Appointments', icon: 'calendar' },
  { to: '/patients', label: 'Patients', icon: 'users' },
  { to: '/queue', label: 'Daily queue', icon: 'queue' },
  { to: '/schedule', label: 'Schedule', icon: 'clock' },
]
const NAV: Record<Role, NavItem[]> = {
  patient: [
    { to: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { to: '/appointments', label: 'Appointments', icon: 'calendar' },
    { to: '/timeline', label: 'My records', icon: 'file' },
    { to: '/privacy', label: 'Privacy & consent', icon: 'shield' },
    { to: '/help', label: 'Help', icon: 'help' },
  ],
  receptionist: STAFF,
  clinician: STAFF,
  administrator: [...STAFF, { to: '/audit', label: 'Audit trail', icon: 'audit' }, { to: '/users', label: 'Users', icon: 'user' }],
}
const TITLES: [string, string][] = [
  ['/dashboard', 'Dashboard'], ['/appointments', 'Appointments'], ['/patients', 'Patients'], ['/timeline', 'My records'], ['/privacy', 'Privacy & consent'],
  ['/help', 'Help'], ['/queue', 'Daily queue'], ['/schedule', 'Schedule'], ['/audit', 'Audit trail'], ['/users', 'Users'],
]
const STAFF_ROLES: Role[] = ['receptionist', 'clinician', 'administrator']

/** Route guard. The API enforces the same rules; this only hides screens. */
function Guard({ roles, children }: { roles: Role[]; children: ReactElement }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/" replace />
  if (!roles.includes(user.role)) return <div className="card"><EmptyState icon="lock" title="Not permitted">Your role cannot open this page.</EmptyState></div>
  return children
}

function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const click = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) close() }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('mousedown', click); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', click); document.removeEventListener('keydown', key) }
  }, [open, close])
  return ref
}

/** Patients see their own notifications; staff see appointment requests awaiting review. */
function NotificationMenu() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const isPatient = user!.role === 'patient'
  const ref = useDismiss(open, () => setOpen(false))
  const notes = useFetch<{ id: number; payload: { message: string }; created_at: string }[]>(isPatient ? '/notifications' : null)
  const pending = useFetch<Appointment[]>(isPatient ? null : '/appointments?status=requested')
  const count = isPatient ? notes.data?.length ?? 0 : pending.data?.length ?? 0
  return (
    <div className="menu-wrap" ref={ref}>
      <button className="icon-btn" aria-label={`Notifications${count ? `, ${count}` : ''}`} aria-haspopup="true" aria-expanded={open}
        onClick={() => { setOpen(o => !o); notes.reload(); pending.reload() }}>
        <Icon name="bell" />{count > 0 && <span className="dot">{count > 9 ? '9+' : count}</span>}
      </button>
      {open && (
        <div className="popover">
          <div className="popover-head"><span>{isPatient ? 'Notifications' : 'Awaiting review'}</span></div>
          <div className="popover-list">
            {isPatient
              ? notes.data?.length ? notes.data.slice(0, 8).map(n => (
                <div className="popover-item" key={n.id}><Icon name="bell" size={16} /><div><div className="small">{n.payload.message}</div><div className="xs muted">{fmt(n.created_at)}</div></div></div>
              )) : <EmptyState icon="bell" title="You're all caught up">No notifications yet.</EmptyState>
              : pending.data?.length ? pending.data.slice(0, 8).map(a => (
                <Link className="popover-item" key={a.id} to="/queue" onClick={() => setOpen(false)}><Avatar name={a.patient.name} size="sm" /><div><div className="small"><b>{a.patient.name}</b> requested a visit</div><div className="xs muted">{fmt(a.slot.starts_at)} · {a.clinician.name}</div></div></Link>
              )) : <EmptyState icon="check" title="Nothing pending">No requests awaiting review.</EmptyState>}
          </div>
        </div>
      )}
    </div>
  )
}

function ProfileMenu() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useDismiss(open, () => setOpen(false))
  return (
    <div className="menu-wrap" ref={ref}>
      <button className="profile-btn" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <Avatar name={user!.name} tone={1} />
        <span className="who"><span className="small" style={{ fontWeight: 650, display: 'block' }}>{user!.name}</span><span className="xs muted" style={{ textTransform: 'capitalize' }}>{user!.role}</span></span>
        <Icon name="chevD" size={14} />
      </button>
      {open && (
        <div className="popover" style={{ width: 260 }}>
          <div className="popover-head" style={{ display: 'block' }}><div>{user!.name}</div><div className="xs muted" style={{ fontWeight: 400 }}>{user!.email}</div></div>
          <button className="popover-item" onClick={() => { setOpen(false); logout() }}><Icon name="logout" size={16} /> Sign out</button>
        </div>
      )}
    </div>
  )
}

function Shell() {
  const { user, loading } = useAuth()
  const [menu, setMenu] = useState(false)
  const loc = useLocation()
  useEffect(() => setMenu(false), [loc.pathname])
  if (loading) return <div className="center" role="status"><span className="spinner" /> <span className="muted">Loading…</span></div>
  if (!user) return <Login />
  const title = TITLES.find(([p]) => loc.pathname.startsWith(p))?.[1] ?? (loc.pathname.startsWith('/patients/') ? 'Patient profile' : '')
  return (
    <div className="shell">
      <a href="#main" className="skip">Skip to content</a>
      <aside className={`sidebar ${menu ? 'open' : ''}`} aria-label="Sidebar">
        <Link to="/" className="brand"><span className="brand-mark"><Icon name="pulse" size={20} /></span>HealthBridge</Link>
        <div className="nav-label">Menu</div>
        <nav className="nav" aria-label="Main">
          {NAV[user.role].map(n => <NavLink key={n.to} to={n.to}><Icon name={n.icon} />{n.label}</NavLink>)}
        </nav>
        <div className="sidebar-foot"><b style={{ color: '#fff' }}>Riverside Demo Clinic</b><br />Synthetic data only. Do not enter real personal or medical information.</div>
      </aside>
      <div className={`scrim ${menu ? 'open' : ''}`} onClick={() => setMenu(false)} />
      <div className="main-col">
        <header className="topbar">
          <button className="icon-btn menu-btn" aria-label="Open navigation" aria-expanded={menu} onClick={() => setMenu(true)}><Icon name="menu" /></button>
          <span className="crumb">{title}</span>
          <span className="spacer" />
          <NotificationMenu />
          <ProfileMenu />
        </header>
        <div className="banner">Demo environment: all data is fictional.</div>
        <main id="main" className="page" tabIndex={-1}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/appointments" element={<Appointments />} />
            <Route path="/timeline" element={<Guard roles={['patient']}><Timeline /></Guard>} />
            <Route path="/privacy" element={<Guard roles={['patient']}><Consents /></Guard>} />
            <Route path="/help" element={<Guard roles={['patient']}><Faq /></Guard>} />
            <Route path="/patients" element={<Guard roles={STAFF_ROLES}><Patients /></Guard>} />
            <Route path="/patients/:id" element={<Guard roles={STAFF_ROLES}><Timeline /></Guard>} />
            <Route path="/queue" element={<Guard roles={STAFF_ROLES}><Queue /></Guard>} />
            <Route path="/schedule" element={<Guard roles={STAFF_ROLES}><Schedule /></Guard>} />
            <Route path="/audit" element={<Guard roles={['administrator']}><AuditLog /></Guard>} />
            <Route path="/users" element={<Guard roles={['administrator']}><Users /></Guard>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return <BrowserRouter><AuthProvider><FeedbackProvider><Shell /></FeedbackProvider></AuthProvider></BrowserRouter>
}
