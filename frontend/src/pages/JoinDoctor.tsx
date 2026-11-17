import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../api'
import { Icon } from '../icons'
import { Alert, Button, errMsg, Field } from '../ui'

const EMPTY = { name: '', email: '', phone: '', specialty: '', qualifications: '', license_number: '', experience_years: '', password: '' }

/** Public "Join as a Doctor" application. Submitting creates a pending request only, never an account. */
export default function JoinDoctor() {
  const [f, setF] = useState(EMPTY)
  const [fields, setFields] = useState<Record<string, string[]>>({})
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })
  const fe = (k: string) => fields[k]?.[0]

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(''); setFields({}); setBusy(true)
    try { await api('/doctor-applications', { method: 'POST', body: { ...f, experience_years: Number(f.experience_years) } }); setDone(true) }
    catch (x) { setErr(errMsg(x)); if (x instanceof ApiError) setFields(x.fields ?? {}) } finally { setBusy(false) }
  }

  return (
    <div className="auth">
      <aside className="auth-side">
        <Link to="/" className="brand" style={{ padding: 0 }}><span className="brand-mark"><Icon name="pulse" size={20} /></span>HealthBridge</Link>
        <div>
          <h2>Join our clinic as a doctor.</h2>
          <ul>
            <li><Icon name="file" />Submit your credentials for review</li>
            <li><Icon name="shield" />An administrator verifies every application</li>
            <li><Icon name="stethoscope" />Approved doctors get their own dashboard</li>
          </ul>
        </div>
        <small style={{ color: '#9db3d1' }}>Riverside Demo Clinic · fictional data only</small>
      </aside>
      <main className="auth-main" style={{ alignItems: 'start' }}>
        <div className="auth-box" style={{ width: 'min(520px,100%)' }}>
          {done ? (
            <div className="empty">
              <div className="empty-ico"><Icon name="check" size={26} /></div>
              <h1 style={{ fontSize: '1.3rem' }}>Application submitted</h1>
              <p>Thank you. Your application is <b>pending</b> review. You will be able to sign in with the email and password you chose once an administrator approves it.</p>
              <Link className="btn" to="/">Back to sign in</Link>
            </div>
          ) : (
            <>
              <h1>Join as a doctor</h1>
              <p className="muted">Tell us about your practice. Synthetic data only: do not enter real licence numbers or personal details.</p>
              <form onSubmit={submit} style={{ marginTop: '1.25rem' }} noValidate={false}>
                {err && <Alert kind="error">{err}</Alert>}
                <Field label="Full name" error={fe('name')}><input required maxLength={100} value={f.name} onChange={set('name')} autoComplete="name" aria-invalid={!!fe('name')} /></Field>
                <div className="form-row">
                  <Field label="Email" error={fe('email')}><input required type="email" maxLength={150} value={f.email} onChange={set('email')} autoComplete="email" aria-invalid={!!fe('email')} /></Field>
                  <Field label="Phone" error={fe('phone')}><input required type="tel" maxLength={30} value={f.phone} onChange={set('phone')} autoComplete="tel" aria-invalid={!!fe('phone')} /></Field>
                </div>
                <div className="form-row">
                  <Field label="Specialty" error={fe('specialty')}><input required maxLength={80} value={f.specialty} onChange={set('specialty')} placeholder="e.g. Cardiology" aria-invalid={!!fe('specialty')} /></Field>
                  <Field label="Years of experience" error={fe('experience_years')}><input required type="number" min={0} max={70} value={f.experience_years} onChange={set('experience_years')} aria-invalid={!!fe('experience_years')} /></Field>
                </div>
                <Field label="License number" error={fe('license_number')}><input required maxLength={50} value={f.license_number} onChange={set('license_number')} aria-invalid={!!fe('license_number')} /></Field>
                <Field label="Qualifications" hint={`Degrees, certifications. ${f.qualifications.length}/500`} error={fe('qualifications')}><textarea required rows={3} maxLength={500} value={f.qualifications} onChange={set('qualifications')} aria-invalid={!!fe('qualifications')} /></Field>
                <Field label="Choose a password" hint="At least 8 characters. You will use it to sign in after approval." error={fe('password')}><input required type="password" minLength={8} value={f.password} onChange={set('password')} autoComplete="new-password" aria-invalid={!!fe('password')} /></Field>
                <Button type="submit" loading={busy} style={{ width: '100%' }}>Submit application</Button>
              </form>
              <p style={{ marginTop: '1rem', textAlign: 'center' }}><Link to="/">Back to sign in</Link></p>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
