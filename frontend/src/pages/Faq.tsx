import { useState, type FormEvent } from 'react'
import { api } from '../api'
import { Alert, Button, errMsg, Field, PageHeader } from '../ui'

const SUGGESTIONS = ['How do I cancel an appointment?', 'Can I reschedule my visit?', 'What should I bring when I arrive?']

/** Policy FAQ helper. Answers come from approved, non-sensitive text only. */
export default function Faq() {
  const [q, setQ] = useState('')
  const [a, setA] = useState<{ answer: string; source: string; q: string } | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function ask(e?: FormEvent, text = q) {
    e?.preventDefault(); setErr(''); setBusy(true)
    try { setA({ ...(await api<{ answer: string; source: string }>('/faq', { method: 'POST', body: { question: text } })), q: text }) } catch (x) { setErr(errMsg(x)) } finally { setBusy(false) }
  }
  return (
    <>
      <PageHeader title="Appointment policy help" subtitle="Ask about booking, cancelling, rescheduling or arrival. This assistant cannot see anyone's records." />
      <div className="grid g-main">
        <section className="card card-pad">
          <form onSubmit={ask}>
            <Field label="Your question"><input required maxLength={300} value={q} onChange={e => setQ(e.target.value)} placeholder="e.g. How do I reschedule?" /></Field>
            <Button type="submit" loading={busy} icon="help">Ask</Button>
          </form>
          <div aria-live="polite" style={{ marginTop: '1rem' }}>
            {err && <Alert kind="error">{err}</Alert>}
            {a && <Alert kind={a.source === 'fallback' ? 'warn' : 'ok'}><b>{a.q}</b><div>{a.answer}</div></Alert>}
          </div>
        </section>
        <section className="card card-pad"><h3 style={{ marginBottom: '.6rem' }}>Common questions</h3>
          <div style={{ display: 'grid', gap: '.5rem' }}>{SUGGESTIONS.map(s => <Button key={s} variant="secondary" style={{ justifyContent: 'flex-start', textAlign: 'left' }} onClick={() => { setQ(s); ask(undefined, s) }}>{s}</Button>)}</div>
        </section>
      </div>
    </>
  )
}
