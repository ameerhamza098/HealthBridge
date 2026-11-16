import { useState } from 'react'
import { api, fmt, type Appointment, type Slot } from '../api'
import { Alert, errMsg, StatusBadge, useFetch } from '../ui'

interface Clin { id: number; name: string; specialty: string }

/** Search open slots, request, reschedule, cancel, and view status history. */
export default function PatientAppointments() {
  const clinicians = useFetch<Clin[]>('/clinicians')
  const [clinician, setClinician] = useState('')
  const [from, setFrom] = useState('')
  const q = new URLSearchParams({ ...(clinician && { clinician_id: clinician }), ...(from && { from }) }).toString()
  const slots = useFetch<Slot[]>(`/slots?${q}`)
  const appts = useFetch<Appointment[]>('/appointments')
  const [reason, setReason] = useState('')
  const [resched, setResched] = useState<Appointment | null>(null)
  const [msg, setMsg] = useState<{ k: 'ok' | 'error'; t: string } | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const [detail, setDetail] = useState<Appointment | null>(null)

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); setMsg({ k: 'ok', t: ok }); setResched(null) } catch (e) { setMsg({ k: 'error', t: errMsg(e) }) }
    slots.reload(); appts.reload()
  }
  const pick = (s: Slot) => resched
    ? act(() => api(`/appointments/${resched.id}/reschedule`, { method: 'POST', body: { slot_id: s.id } }), 'Appointment rescheduled.')
    : act(() => api('/appointments', { method: 'POST', body: { slot_id: s.id, reason: reason || null } }), 'Request submitted. The clinic will confirm it.')
  const showHistory = async (a: Appointment) => {
    if (open === a.id) return setOpen(null)
    setDetail(await api<Appointment>(`/appointments/${a.id}`)); setOpen(a.id)
  }

  return (
    <>
      <h1>Appointments</h1>
      <div aria-live="polite">{msg && <Alert kind={msg.k}>{msg.t}</Alert>}</div>

      <section className="card" aria-labelledby="find">
        <h2 id="find">{resched ? `Reschedule appointment #${resched.id}: choose a new time` : 'Find and request a time'}</h2>
        {resched && <button className="link" onClick={() => setResched(null)}>Cancel rescheduling</button>}
        <div className="row">
          <label>Clinician
            <select value={clinician} onChange={e => setClinician(e.target.value)}>
              <option value="">Any</option>
              {clinicians.data?.map(c => <option key={c.id} value={c.id}>{c.name} ({c.specialty})</option>)}
            </select>
          </label>
          <label>On or after<input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
          {!resched && <label>Reason (optional, no medical details)<input maxLength={200} value={reason} onChange={e => setReason(e.target.value)} /></label>}
        </div>
        {slots.loading ? <p>Loading…</p> : slots.error ? <Alert kind="error">{slots.error}</Alert> :
          !slots.data?.length ? <p>No open slots match.</p> : (
            <ul className="slots">
              {slots.data.slice(0, 40).map(s => (
                <li key={s.id}>
                  <button onClick={() => pick(s)}>{fmt(s.starts_at)}<br /><small>{s.clinician.name}</small></button>
                </li>
              ))}
            </ul>
          )}
      </section>

      <section className="card" aria-labelledby="mine">
        <h2 id="mine">My appointments</h2>
        {appts.error && <Alert kind="error">{appts.error}</Alert>}
        <table>
          <thead><tr><th>When</th><th>Clinician</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {appts.data?.map(a => (
              <>
                <tr key={a.id}>
                  <td>{fmt(a.slot.starts_at)}</td><td>{a.clinician.name}</td><td><StatusBadge status={a.status} /></td>
                  <td className="actions">
                    <button className="sm" aria-expanded={open === a.id} onClick={() => showHistory(a)}>History</button>
                    {['requested', 'confirmed'].includes(a.status) && <>
                      <button className="sm" onClick={() => { setResched(a); window.scrollTo({ top: 0 }) }}>Reschedule</button>
                      <button className="sm danger" onClick={() => confirm('Cancel this appointment?') && act(() => api(`/appointments/${a.id}/cancel`, { method: 'POST' }), 'Appointment cancelled.')}>Cancel</button>
                    </>}
                  </td>
                </tr>
                {open === a.id && detail && (
                  <tr key={a.id + 'h'}><td colSpan={4}>
                    <ol className="history" aria-label={`Status history for appointment ${a.id}`}>
                      {detail.history?.map((h, i) => <li key={i}>{fmt(h.at)}: {h.from ? `${h.from} → ` : ''}<b>{h.to}</b>{h.actor && ` by ${h.actor.name}`}{h.note && ` (${h.note})`}</li>)}
                    </ol>
                  </td></tr>
                )}
              </>
            ))}
            {appts.data?.length === 0 && <tr><td colSpan={4}>No appointments yet.</td></tr>}
          </tbody>
        </table>
      </section>
    </>
  )
}
