import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth'
import { Icon } from '../icons'
import { Alert, Button, errMsg, Field } from '../ui'

const DEMO = [['Patient (consented)', 'patient1@demo.test'], ['Patient (no consent)', 'patient2@demo.test'], ['Receptionist', 'reception@demo.test'], ['Clinician', 'clinician1@demo.test'], ['Administrator', 'admin@demo.test']]

export default function Login() {
  const { login, register } = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [f, setF] = useState({ name: '', email: '', password: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true)
    try { mode === 'login' ? await login(f.email, f.password) : await register(f.name, f.email, f.password) }
    catch (x) { setErr(errMsg(x)) } finally { setBusy(false) }
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })

  return (
    <div className="auth">
      <aside className="auth-side">
        <div className="brand" style={{ padding: 0 }}><span className="brand-mark"><Icon name="pulse" size={20} /></span>HealthBridge</div>
        <div>
          <h2>Appointments and records, coordinated.</h2>
          <ul>
            <li><Icon name="calendar" />Book, reschedule and track visits</li>
            <li><Icon name="file" />Clinical notes shared only with your consent</li>
            <li><Icon name="shield" />Every access is audited</li>
          </ul>
        </div>
        <small style={{ color: '#9db3d1' }}>Riverside Demo Clinic · fictional data only</small>
      </aside>
      <main className="auth-main">
        <div className="auth-box">
          <h1>{mode === 'login' ? 'Welcome back' : 'Create patient account'}</h1>
          <p className="muted">{mode === 'login' ? 'Sign in to manage your appointments.' : 'Register to request appointments online.'} Synthetic data only: never enter real personal or medical information.</p>
          <form onSubmit={submit} style={{ marginTop: '1.25rem' }}>
            {err && <Alert kind="error">{err}</Alert>}
            {mode === 'register' && <Field label="Full name"><input required value={f.name} onChange={set('name')} autoComplete="name" /></Field>}
            <Field label="Email"><input required type="email" value={f.email} onChange={set('email')} autoComplete="email" /></Field>
            <Field label="Password" hint={mode === 'register' ? 'At least 8 characters.' : undefined}><input required type="password" minLength={mode === 'register' ? 8 : undefined} value={f.password} onChange={set('password')} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></Field>
            <Button type="submit" loading={busy} style={{ width: '100%' }}>{mode === 'login' ? 'Sign in' : 'Register'}</Button>
          </form>
          <p style={{ marginTop: '1rem', textAlign: 'center' }}>
            <button className="link-btn" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setErr('') }}>
              {mode === 'login' ? 'New patient? Create an account' : 'Have an account? Sign in'}
            </button>
          </p>
          <p className="small muted" style={{ textAlign: 'center' }}>Are you a doctor? <Link to="/join-doctor">Join as a doctor</Link></p>
          <details className="demo">
            <summary>Demo accounts (password: Password123!)</summary>
            <ul style={{ margin: '.5rem 0 0', paddingLeft: '1.1rem' }}>
              {DEMO.map(([l, e]) => <li key={e}>{l}: <button type="button" onClick={() => { setMode('login'); setF({ ...f, email: e, password: 'Password123!' }) }}>{e}</button></li>)}
            </ul>
          </details>
        </div>
      </main>
    </div>
  )
}
