import { useState, type FormEvent } from 'react'
import { api } from '../api'
import { Alert, errMsg } from '../ui'

/** Policy FAQ helper. Answers come from approved, non-sensitive text only. */
export default function Faq() {
  const [q, setQ] = useState('')
  const [a, setA] = useState<{ answer: string; source: string } | null>(null)
  const [err, setErr] = useState('')
  async function ask(e: FormEvent) {
    e.preventDefault(); setErr('')
    try { setA(await api('/faq', { method: 'POST', body: { question: q } })) } catch (x) { setErr(errMsg(x)) }
  }
  return (
    <>
      <h1>Appointment policy help</h1>
      <p className="muted">Ask about booking, cancelling, rescheduling or arrival. This assistant cannot see anyone's records.</p>
      <form onSubmit={ask} className="card">
        <label>Your question<input required maxLength={300} value={q} onChange={e => setQ(e.target.value)} /></label>
        <button>Ask</button>
      </form>
      <div aria-live="polite">
        {err && <Alert kind="error">{err}</Alert>}
        {a && <Alert kind={a.source === 'fallback' ? 'warn' : 'ok'}>{a.answer}</Alert>}
      </div>
    </>
  )
}
