import { BrowserRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom'
import type { ReactElement } from 'react'
import { AuthProvider, useAuth } from './auth'
import type { Role } from './api'
import Login from './pages/Login'
import PatientAppointments from './pages/PatientAppointments'
import { Queue, Schedule } from './pages/Staff'
import { Consents, Timeline } from './pages/Records'
import { AuditLog, Users } from './pages/Admin'
import Faq from './pages/Faq'

const NAV: Record<Role, [string, string][]> = {
  patient: [['/appointments', 'Appointments'], ['/timeline', 'My timeline'], ['/privacy', 'Privacy'], ['/help', 'Help']],
  receptionist: [['/queue', 'Queue'], ['/schedule', 'Schedule']],
  clinician: [['/queue', 'Queue'], ['/schedule', 'Schedule']],
  administrator: [['/queue', 'Queue'], ['/schedule', 'Schedule'], ['/audit', 'Audit'], ['/users', 'Users']],
}
const HOME: Record<Role, string> = { patient: '/appointments', receptionist: '/queue', clinician: '/queue', administrator: '/queue' }

/** Route guard. The API enforces the same rules; this only hides screens. */
function Guard({ roles, children }: { roles: Role[]; children: ReactElement }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/" replace />
  if (!roles.includes(user.role)) return <main className="card"><h1>Not permitted</h1><p>Your role cannot open this page.</p></main>
  return children
}

function Shell() {
  const { user, loading, logout } = useAuth()
  if (loading) return <p className="center">Loading…</p>
  if (!user) return <Login />
  return (
    <>
      <a href="#main" className="skip">Skip to content</a>
      <header>
        <strong>Riverside Demo Clinic</strong>
        <nav aria-label="Main">{NAV[user.role].map(([to, label]) => <NavLink key={to} to={to}>{label}</NavLink>)}</nav>
        <span className="who">{user.name} · {user.role} <button className="sm" onClick={logout}>Sign out</button></span>
      </header>
      <div className="banner">Demo environment: all data is fictional.</div>
      <div id="main" className="page">
        <Routes>
          <Route path="/" element={<Navigate to={HOME[user.role]} replace />} />
          <Route path="/appointments" element={<Guard roles={['patient']}><PatientAppointments /></Guard>} />
          <Route path="/timeline" element={<Guard roles={['patient']}><Timeline /></Guard>} />
          <Route path="/privacy" element={<Guard roles={['patient']}><Consents /></Guard>} />
          <Route path="/help" element={<Guard roles={['patient']}><Faq /></Guard>} />
          <Route path="/queue" element={<Guard roles={['receptionist', 'clinician', 'administrator']}><Queue /></Guard>} />
          <Route path="/schedule" element={<Guard roles={['receptionist', 'clinician', 'administrator']}><Schedule /></Guard>} />
          <Route path="/patients/:id" element={<Guard roles={['receptionist', 'clinician', 'administrator']}><Timeline /></Guard>} />
          <Route path="/audit" element={<Guard roles={['administrator']}><AuditLog /></Guard>} />
          <Route path="/users" element={<Guard roles={['administrator']}><Users /></Guard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </>
  )
}

export default function App() {
  return <BrowserRouter><AuthProvider><Shell /></AuthProvider></BrowserRouter>
}
