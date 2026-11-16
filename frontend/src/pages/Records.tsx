import { useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { api, fmt, type Appointment, type Note } from '../api'
import { useAuth } from '../auth'
import { Alert, errMsg, StatusBadge, useFetch } from '../ui'

/** Role-restricted patient timeline. Notes load only for roles the API allows. */
export function Timeline() {
  const { user } = useAuth()
  const params = useParams()
  const pid = params.id ?? String(user!.id)
  const canTryNotes = user!.role === 'patient' || user!.role === 'clinician'
  const tl = useFetch<{ patient: { name: string }; appointments: Appointment[] }>(`/patients/${pid}/timeline`)
  const notes = useFetch<Note[]>(canTryNotes ? `/patients/${pid}/notes` : null)
  const [body, setBody] = useState('')
  const [target, setTarget] = useState('')
  const [msg, setMsg] = useState<{ k: 'ok' | 'error'; t: string } | null>(null)

  const eligible = tl.data?.appointments.filter(a => ['confirmed', 'completed'].includes(a.status)) ?? []
  async function add(e: FormEvent) {
    e.preventDefault()
    try {
      await api(`/appointments/${target}/notes`, { method: 'POST', body: { body } })
      setBody(''); setMsg({ k: 'ok', t: 'Demo note saved.' }); notes.reload()
    } catch (x) { setMsg({ k: 'error', t: errMsg(x) }) }
  }

  return (
    <>
      <h1>Timeline{tl.data ? `: ${tl.data.patient.name}` : ''}</h1>
      {tl.error && <Alert kind="error">{tl.error}</Alert>}
      <section className="card" aria-labelledby="visits">
        <h2 id="visits">Appointments</h2>
        <ol className="timeline">
          {tl.data?.appointments.map(a => (
            <li key={a.id}>
              <b>{fmt(a.slot.starts_at)}</b> with {a.clinician.name} <StatusBadge status={a.status} />
              <ul className="history">{a.history?.map((h, i) => <li key={i}>{fmt(h.at)}: {h.to}{h.actor && ` (${h.actor.name})`}</li>)}</ul>
            </li>
          ))}
        </ol>
      </section>

      {canTryNotes && (
        <section className="card" aria-labelledby="notes">
          <h2 id="notes">Clinician notes (demo)</h2>
          {notes.error && <Alert kind="warn">Notes are not available to you for this patient. This usually means consent has not been given or there is no treating relationship.</Alert>}
          {notes.data?.map(n => <article key={n.id} className="note"><small>{fmt(n.created_at)} · {n.clinician}</small><p>{n.body}</p></article>)}
          {notes.data?.length === 0 && <p className="muted">No notes yet.</p>}

          {user!.role === 'clinician' && (
            <form onSubmit={add}>
              <h3>Add a fictional note</h3>
              {msg && <Alert kind={msg.k}>{msg.t}</Alert>}
              <label>Appointment
                <select required value={target} onChange={e => setTarget(e.target.value)}>
                  <option value="">Select…</option>
                  {eligible.map(a => <option key={a.id} value={a.id}>{fmt(a.slot.starts_at)}</option>)}
                </select>
              </label>
              <label>Note (synthetic content only)<textarea required maxLength={2000} rows={3} value={body} onChange={e => setBody(e.target.value)} /></label>
              <button>Save note</button>
            </form>
          )}
        </section>
      )}
    </>
  )
}

interface Consent { type: string; granted: boolean }
const LABELS: Record<string, string> = {
  records_sharing: 'Let my treating clinician view my clinical notes',
  notifications: 'Send me minimal appointment notifications (no health details)',
}

export function Consents() {
  const c = useFetch<Consent[]>('/consents')
  const n = useFetch<{ id: number; type: string; payload: { message: string }; created_at: string }[]>('/notifications')
  const [err, setErr] = useState('')
  const toggle = async (x: Consent) => {
    try { await api('/consents', { method: 'PUT', body: { type: x.type, granted: !x.granted } }); setErr('') } catch (e) { setErr(errMsg(e)) }
    c.reload()
  }
  return (
    <>
      <h1>Privacy &amp; consent</h1>
      {err && <Alert kind="error">{err}</Alert>}
      <section className="card">
        <h2>Consents</h2>
        {c.data?.map(x => (
          <label key={x.type} className="check">
            <input type="checkbox" checked={x.granted} onChange={() => toggle(x)} /> {LABELS[x.type] ?? x.type}
          </label>
        ))}
        <p className="muted">You can withdraw consent at any time; access stops immediately.</p>
      </section>
      <section className="card">
        <h2>My notifications</h2>
        <ul>{n.data?.map(x => <li key={x.id}>{fmt(x.created_at)}: {x.payload.message}</li>)}</ul>
        {n.data?.length === 0 && <p className="muted">None yet.</p>}
      </section>
    </>
  )
}
