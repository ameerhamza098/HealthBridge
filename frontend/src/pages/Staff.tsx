import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, fmt, type Appointment, type ScheduleRow } from '../api'
import { useAuth } from '../auth'
import { Alert, errMsg, StatusBadge, useFetch } from '../ui'

const today = () => new Date().toISOString().slice(0, 10)

/** Daily queue with approve / reject / cancel / complete. */
export function Queue() {
  const { user } = useAuth()
  const [date, setDate] = useState(today())
  const list = useFetch<Appointment[]>(`/queue?date=${date}`)
  const [msg, setMsg] = useState<{ k: 'ok' | 'error'; t: string } | null>(null)
  const act = async (id: number, verb: string) => {
    try { await api(`/appointments/${id}/${verb}`, { method: 'POST' }); setMsg({ k: 'ok', t: `Appointment ${verb} done.` }) } catch (e) { setMsg({ k: 'error', t: errMsg(e) }) }
    list.reload()
  }
  return (
    <>
      <h1>Daily queue</h1>
      <label>Date<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
      <div aria-live="polite">{msg && <Alert kind={msg.k}>{msg.t}</Alert>}</div>
      {list.error && <Alert kind="error">{list.error}</Alert>}
      <table className="card">
        <thead><tr><th>Time</th><th>Patient</th><th>Clinician</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {list.data?.map(a => (
            <tr key={a.id}>
              <td>{fmt(a.slot.starts_at)}</td><td>{a.patient.name}</td><td>{a.clinician.name}</td><td><StatusBadge status={a.status} /></td>
              <td className="actions">
                {a.status === 'requested' && <><button className="sm" onClick={() => act(a.id, 'approve')}>Approve</button>
                  {user?.role !== 'clinician' && <button className="sm danger" onClick={() => act(a.id, 'reject')}>Reject</button>}</>}
                {a.status === 'confirmed' && <button className="sm" onClick={() => act(a.id, 'complete')}>Complete</button>}
                <button className="sm danger" onClick={() => confirm('Cancel this appointment?') && act(a.id, 'cancel')}>Cancel</button>
                <Link className="sm btn" to={`/patients/${a.patient.id}`}>Timeline</Link>
              </td>
            </tr>
          ))}
          {list.data?.length === 0 && <tr><td colSpan={5}>Nothing queued for this day.</td></tr>}
        </tbody>
      </table>
    </>
  )
}

/** Clinician availability grid with conflict warnings. */
export function Schedule() {
  const [date, setDate] = useState(today())
  const [clin, setClin] = useState('')
  const clinicians = useFetch<{ id: number; name: string }[]>('/clinicians')
  const sched = useFetch<{ date: string; slots: ScheduleRow[] }>(`/schedule?date=${date}${clin ? `&clinician_id=${clin}` : ''}`)
  const [msg, setMsg] = useState<string | null>(null)

  const toggle = async (r: ScheduleRow) => {
    try {
      const res = await api<{ has_booking: boolean }>(`/slots/${r.slot_id}/block`, { method: 'POST', body: { blocked: r.slot_status !== 'blocked' } })
      setMsg(res.has_booking && r.slot_status !== 'blocked' ? 'Warning: this slot already has a booking that needs to be moved.' : null)
    } catch (e) { setMsg(errMsg(e)) }
    sched.reload()
  }
  const warnings = sched.data?.slots.filter(s => s.warnings.length) ?? []
  return (
    <>
      <h1>Schedule</h1>
      <div className="row">
        <label>Date<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
        <label>Clinician
          <select value={clin} onChange={e => setClin(e.target.value)}>
            <option value="">All</option>
            {clinicians.data?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      </div>
      {msg && <Alert kind="warn">{msg}</Alert>}
      {warnings.length > 0 && <Alert kind="warn"><b>{warnings.length} conflict warning(s)</b>
        <ul>{warnings.map(w => <li key={w.slot_id}>{fmt(w.starts_at)}, {w.clinician.name}: {w.warnings.join(' ')}</li>)}</ul></Alert>}
      {sched.error && <Alert kind="error">{sched.error}</Alert>}
      <table className="card">
        <caption className="sr">Slots for {date}</caption>
        <thead><tr><th>Time</th><th>Clinician</th><th>Slot</th><th>Booking</th><th></th></tr></thead>
        <tbody>
          {sched.data?.slots.map(r => (
            <tr key={r.slot_id} className={r.warnings.length ? 'warnrow' : ''}>
              <td>{new Date(r.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
              <td>{r.clinician.name}</td><td>{r.slot_status}</td>
              <td>{r.appointment ? <>{r.appointment.patient_name} <StatusBadge status={r.appointment.status} /></> : <span className="muted">free</span>}
                {r.warnings.length > 0 && <span role="img" aria-label="conflict warning"> ⚠</span>}</td>
              <td><button className="sm" onClick={() => toggle(r)}>{r.slot_status === 'blocked' ? 'Unblock' : 'Block'}</button></td>
            </tr>
          ))}
          {sched.data?.slots.length === 0 && <tr><td colSpan={5}>No slots on this day.</td></tr>}
        </tbody>
      </table>
    </>
  )
}
