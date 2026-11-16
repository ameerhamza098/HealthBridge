import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth'
import { Alert, errMsg } from '../ui'

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
    <main className="card narrow">
      <h1>Riverside Demo Clinic</h1>
      <p className="muted">Fictional clinic. Synthetic data only: never enter real personal or medical information.</p>
      <form onSubmit={submit} aria-labelledby="mode">
        <h2 id="mode">{mode === 'login' ? 'Sign in' : 'Create patient account'}</h2>
        {err && <Alert kind="error">{err}</Alert>}
        {mode === 'register' && <label>Name<input required value={f.name} onChange={set('name')} autoComplete="name" /></label>}
        <label>Email<input required type="email" value={f.email} onChange={set('email')} autoComplete="email" /></label>
        <label>Password<input required type="password" minLength={mode === 'register' ? 8 : undefined} value={f.password} onChange={set('password')} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
        <button disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Register'}</button>
      </form>
      <button className="link" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setErr('') }}>
        {mode === 'login' ? 'New patient? Create an account' : 'Have an account? Sign in'}
      </button>
      <details>
        <summary>Demo accounts (password: Password123!)</summary>
        <ul>
          <li>patient1@demo.test (consented), patient2@demo.test (no consent)</li>
          <li>reception@demo.test, clinician1@demo.test, admin@demo.test</li>
        </ul>
      </details>
    </main>
  )
}
