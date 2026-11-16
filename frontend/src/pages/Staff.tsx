import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type Appointment, type ScheduleRow } from '../api'
import { useAuth } from '../auth'
import { Alert, Avatar, Button, EmptyState, errMsg, Field, fmtLong, fmtTime, PageHeader, SkeletonRows, StatusBadge, useFeedback, useFetch, dateKey } from '../ui'
import { AppointmentDetail, BookingModal, useApptActions } from './AppointmentDialogs'

const today = () => dateKey(new Date())

function DateStepper({ date, setDate }: { date: string; setDate: (d: string) => void }) {
  const shift = (n: number) => { const d = new Date(date + 'T12:00:00'); d.setDate(d.getDate() + n); setDate(dateKey(d)) }
  return (
    <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}>
      <Button variant="secondary" size="sm" icon="chevL" aria-label="Previous day" onClick={() => shift(-1)} />
      <input type="date" aria-label="Date" value={date} onChange={e => e.target.value && setDate(e.target.value)} style={{ width: 'auto' }} />
      <Button variant="secondary" size="sm" icon="chevR" aria-label="Next day" onClick={() => shift(1)} />
      <Button variant="secondary" size="sm" onClick={() => setDate(today())}>Today</Button>
    </div>
  )
}

/** Daily queue with approve / reject / cancel / complete. */
export function Queue() {
  const { user } = useAuth()
  const [date, setDate] = useState(today())
  const list = useFetch<Appointment[]>(`/queue?date=${date}`)
  const { run, busy } = useApptActions(list.reload)
  const [selected, setSelected] = useState<Appointment | null>(null)
  const [resched, setResched] = useState<Appointment | null>(null)
  const items = list.data ?? []
  return (
    <>
      <PageHeader title="Daily queue" subtitle={`${fmtLong(date + 'T12:00:00')} · active appointments in time order`}><DateStepper date={date} setDate={setDate} /></PageHeader>
      {list.error && <Alert kind="error">{list.error}</Alert>}
      <section className="card" aria-label="Queue">
        {list.loading && !list.data ? <SkeletonRows rows={4} /> : !items.length ? <EmptyState icon="queue" title="Nothing queued for this day">Pending and confirmed appointments for the selected date appear here.</EmptyState> : (
          <div className="table-wrap">
            <table className="table stack">
              <caption className="sr">Queue for {date}</caption>
              <thead><tr><th>Time</th><th>Patient</th><th>Clinician</th><th>Status</th><th><span className="sr">Actions</span></th></tr></thead>
              <tbody>{items.map(a => (
                <tr key={a.id}>
                  <td data-label="Time" className="nowrap"><b>{fmtTime(a.slot.starts_at)}</b></td>
                  <td data-label="Patient"><div className="cell-person"><Avatar name={a.patient.name} /><div><b>{a.patient.name}</b><small>{a.reason || 'General visit'}</small></div></div></td>
                  <td data-label="Clinician">{a.clinician.name}<div className="small muted">{a.clinician.room}</div></td>
                  <td data-label="Status"><StatusBadge status={a.status} /></td>
                  <td className="row-actions">
                    {a.status === 'requested' && <Button size="sm" variant="teal" loading={busy === `${a.id}:approve`} onClick={() => run(a, 'approve')}>Approve</Button>}
                    {a.status === 'requested' && user?.role !== 'clinician' && <Button size="sm" variant="danger-outline" loading={busy === `${a.id}:reject`} onClick={() => run(a, 'reject')}>Reject</Button>}
                    {a.status === 'confirmed' && <Button size="sm" variant="teal" loading={busy === `${a.id}:complete`} onClick={() => run(a, 'complete')}>Complete</Button>}
                    <Button size="sm" variant="secondary" onClick={() => setSelected(a)}>Details</Button>
                    <Button size="sm" variant="danger-outline" loading={busy === `${a.id}:cancel`} onClick={() => run(a, 'cancel')}>Cancel</Button>
                    <Link className="btn sm ghost" to={`/patients/${a.patient.id}`}>Record</Link>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
      {selected && <AppointmentDetail appt={selected} onClose={() => setSelected(null)} onChange={list.reload} onReschedule={setResched} />}
      {resched && <BookingModal reschedule={resched} onClose={() => setResched(null)} onDone={list.reload} />}
    </>
  )
}

/** Clinician availability grid with conflict warnings. */
export function Schedule() {
  const { toast, confirm } = useFeedback()
  const [date, setDate] = useState(today())
  const [clin, setClin] = useState('')
  const [busy, setBusy] = useState<number | null>(null)
  const clinicians = useFetch<{ id: number; name: string }[]>('/clinicians')
  const sched = useFetch<{ date: string; slots: ScheduleRow[] }>(`/schedule?date=${date}${clin ? `&clinician_id=${clin}` : ''}`)

  const toggle = async (r: ScheduleRow) => {
    const blocking = r.slot_status !== 'blocked'
    if (blocking && r.appointment && !(await confirm({ title: 'Block a booked slot?', message: `${r.appointment.patient_name} has an active booking in this slot. It will need to be moved.`, confirmLabel: 'Block anyway', danger: true }))) return
    setBusy(r.slot_id)
    try {
      const res = await api<{ has_booking: boolean }>(`/slots/${r.slot_id}/block`, { method: 'POST', body: { blocked: blocking } })
      toast('ok', blocking ? (res.has_booking ? 'Slot blocked. It still has a booking that needs to be moved.' : 'Slot blocked.') : 'Slot reopened.')
    } catch (e) { toast('error', errMsg(e)) }
    setBusy(null); sched.reload()
  }
  const slots = sched.data?.slots ?? []
  const warnings = slots.filter(s => s.warnings.length)
  return (
    <>
      <PageHeader title="Schedule" subtitle={`${fmtLong(date + 'T12:00:00')} · slots, bookings and conflicts`}><DateStepper date={date} setDate={setDate} /></PageHeader>
      {warnings.length > 0 && <Alert kind="warn"><b>{warnings.length} conflict warning{warnings.length > 1 ? 's' : ''}</b>
        <ul>{warnings.map(w => <li key={w.slot_id}>{fmtTime(w.starts_at)}, {w.clinician.name}: {w.warnings.join(' ')}</li>)}</ul></Alert>}
      {sched.error && <Alert kind="error">{sched.error}</Alert>}
      <section className="card" aria-label="Schedule">
        <div className="toolbar">
          <Field label="Clinician"><select value={clin} onChange={e => setClin(e.target.value)}>
            <option value="">All clinicians</option>{clinicians.data?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></Field>
          <span className="spacer" />
          <span className="small muted">{slots.length} slots · {slots.filter(s => s.appointment).length} booked · {slots.filter(s => s.slot_status === 'blocked').length} blocked</span>
        </div>
        {sched.loading && !sched.data ? <SkeletonRows rows={4} /> : !slots.length ? <EmptyState icon="clock" title="No slots on this day">Try another date or clinician.</EmptyState> : (
          <div className="table-wrap">
            <table className="table stack">
              <caption className="sr">Slots for {date}</caption>
              <thead><tr><th>Time</th><th>Clinician</th><th>Slot</th><th>Booking</th><th><span className="sr">Actions</span></th></tr></thead>
              <tbody>{slots.map(r => (
                <tr key={r.slot_id} className={r.warnings.length ? 'warnrow' : ''}>
                  <td data-label="Time" className="nowrap"><b>{fmtTime(r.starts_at)}</b></td>
                  <td data-label="Clinician">{r.clinician.name}</td>
                  <td data-label="Slot"><span className={`badge b-${r.slot_status}`}>{r.slot_status}</span></td>
                  <td data-label="Booking">{r.appointment ? <>{r.appointment.patient_name} <StatusBadge status={r.appointment.status} /></> : <span className="muted">Free</span>}
                    {r.warnings.length > 0 && <span role="img" aria-label="conflict warning" title={r.warnings.join(' ')}> ⚠</span>}</td>
                  <td className="row-actions"><Button size="sm" variant="secondary" loading={busy === r.slot_id} onClick={() => toggle(r)}>{r.slot_status === 'blocked' ? 'Unblock' : 'Block'}</Button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
