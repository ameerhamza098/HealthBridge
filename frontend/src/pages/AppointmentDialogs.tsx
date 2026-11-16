import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, fmt, type Appointment, type Slot } from '../api'
import { useAuth } from '../auth'
import { Alert, Avatar, Button, EmptyState, errMsg, Field, fmtDay, fmtLong, fmtTime, Modal, SkeletonRows, StatusBadge, useFeedback, useFetch } from '../ui'

export const isActive = (s: string) => s === 'requested' || s === 'confirmed'

/** Status-changing actions shared by every screen. The API remains the source of truth for permissions. */
export function useApptActions(onChange: () => void) {
  const { toast, confirm } = useFeedback()
  const [busy, setBusy] = useState<string | null>(null)
  const MSG: Record<string, string> = { approve: 'Appointment confirmed.', reject: 'Appointment rejected.', complete: 'Appointment marked as completed.', cancel: 'Appointment cancelled.' }
  const run = async (a: Appointment, verb: 'approve' | 'reject' | 'complete' | 'cancel') => {
    if (verb === 'cancel' || verb === 'reject') {
      const ok = await confirm({
        title: verb === 'cancel' ? 'Cancel this appointment?' : 'Reject this request?',
        message: `${fmt(a.slot.starts_at)} with ${a.clinician.name}${a.patient ? ` for ${a.patient.name}` : ''}. The time slot will be released and the patient notified.`,
        confirmLabel: verb === 'cancel' ? 'Cancel appointment' : 'Reject request', danger: true,
      })
      if (!ok) return false
    }
    setBusy(`${a.id}:${verb}`)
    try { await api(`/appointments/${a.id}/${verb}`, { method: 'POST' }); toast('ok', MSG[verb]); onChange(); return true }
    catch (e) { toast('error', errMsg(e)); onChange(); return false }
    finally { setBusy(null) }
  }
  return { run, busy }
}

/** Book a new appointment, or (with `reschedule`) pick a new slot for an existing one. */
export function BookingModal({ reschedule, patients, onClose, onDone }: {
  reschedule?: Appointment; patients?: { id: number; name: string }[]; onClose: () => void; onDone: () => void
}) {
  const { user } = useAuth()
  const { toast } = useFeedback()
  const staff = user!.role !== 'patient'
  const clinicians = useFetch<{ id: number; name: string; specialty: string }[]>('/clinicians')
  const [clinician, setClinician] = useState(reschedule ? String(reschedule.clinician.id) : '')
  const [from, setFrom] = useState('')
  const [reason, setReason] = useState('')
  const [patient, setPatient] = useState('')
  const [slotId, setSlotId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const q = new URLSearchParams({ ...(clinician && { clinician_id: clinician }), ...(from && { from }) }).toString()
  const slots = useFetch<Slot[]>(`/slots?${q}`)

  const groups = new Map<string, Slot[]>()
  slots.data?.forEach(s => { const k = fmtLong(s.starts_at); groups.set(k, [...(groups.get(k) ?? []), s]) })

  async function submit() {
    if (!slotId) return setErr('Choose a time slot first.')
    if (!reschedule && staff && !patient) return setErr('Choose a patient.')
    setBusy(true); setErr('')
    try {
      if (reschedule) await api(`/appointments/${reschedule.id}/reschedule`, { method: 'POST', body: { slot_id: slotId } })
      else await api('/appointments', { method: 'POST', body: { slot_id: slotId, reason: reason || null, ...(staff && { patient_id: Number(patient) }) } })
      toast('ok', reschedule ? 'Appointment rescheduled.' : staff ? 'Appointment requested for the patient.' : 'Request submitted. The clinic will confirm it.')
      onDone(); onClose()
    } catch (e) { setErr(errMsg(e)); slots.reload(); setSlotId(null) } finally { setBusy(false) }
  }

  return (
    <Modal title={reschedule ? 'Reschedule appointment' : 'New appointment'} size="wide" onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Close</Button><Button loading={busy} disabled={!slotId} onClick={submit}>{reschedule ? 'Confirm new time' : 'Request appointment'}</Button></>}>
      {reschedule && <Alert kind="info">Currently <b>{fmt(reschedule.slot.starts_at)}</b> with {reschedule.clinician.name}. Choose a new time below.</Alert>}
      {err && <Alert kind="error">{err}</Alert>}
      {!reschedule && staff && (
        <Field label="Patient" hint={patients?.length ? undefined : 'No known patients yet. A patient needs an account and a first appointment request before staff can book for them.'}>
          <select required value={patient} onChange={e => setPatient(e.target.value)}>
            <option value="">Select a patient…</option>
            {patients?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
      )}
      <div className="form-row">
        <Field label="Clinician">
          <select value={clinician} onChange={e => { setClinician(e.target.value); setSlotId(null) }}>
            <option value="">Any clinician</option>
            {clinicians.data?.map(c => <option key={c.id} value={c.id}>{c.name} ({c.specialty})</option>)}
          </select>
        </Field>
        <Field label="On or after"><input type="date" value={from} onChange={e => { setFrom(e.target.value); setSlotId(null) }} /></Field>
      </div>
      {!reschedule && <Field label="Reason for visit (optional)" hint="Keep it general: no medical details."><input maxLength={200} value={reason} onChange={e => setReason(e.target.value)} /></Field>}

      <h3 style={{ marginTop: '.5rem' }}>Available times</h3>
      {slots.loading && !slots.data ? <SkeletonRows rows={2} /> : slots.error ? <Alert kind="error">{slots.error}</Alert>
        : !groups.size ? <EmptyState icon="calendar" title="No open slots">Try another clinician or a different date.</EmptyState>
        : [...groups].map(([day, list]) => (
          <div key={day}>
            <div className="slot-day">{day}</div>
            <div className="slots" role="group" aria-label={`Slots on ${day}`}>
              {list.map(s => (
                <button key={s.id} type="button" className="slot" aria-pressed={slotId === s.id} onClick={() => setSlotId(s.id)}>
                  <b>{fmtTime(s.starts_at)}</b><small>{s.clinician.name}</small>
                </button>
              ))}
            </div>
          </div>
        ))}
    </Modal>
  )
}

/** Full appointment detail with status history and the actions the current role may take. */
export function AppointmentDetail({ appt, onClose, onChange, onReschedule }: {
  appt: Appointment; onClose: () => void; onChange: () => void; onReschedule: (a: Appointment) => void
}) {
  const { user } = useAuth()
  const detail = useFetch<Appointment>(`/appointments/${appt.id}`)
  const { run, busy } = useApptActions(() => { onChange(); detail.reload() })
  const a = detail.data ?? appt
  const staff = user!.role !== 'patient'
  const act = async (v: Parameters<typeof run>[1]) => { if (await run(a, v) && v !== 'approve' && v !== 'complete') onClose() }
  return (
    <Modal title="Appointment details" onClose={onClose} footer={<>
      {staff && <Link className="btn ghost" to={`/patients/${a.patient.id}`} onClick={onClose}>Patient record</Link>}
      <span className="spacer" />
      {isActive(a.status) && <Button variant="danger-outline" loading={busy === `${a.id}:cancel`} onClick={() => act('cancel')}>Cancel</Button>}
      {isActive(a.status) && <Button variant="secondary" onClick={() => { onClose(); onReschedule(a) }}>Reschedule</Button>}
      {staff && a.status === 'requested' && user!.role !== 'clinician' && <Button variant="danger-outline" loading={busy === `${a.id}:reject`} onClick={() => act('reject')}>Reject</Button>}
      {staff && a.status === 'requested' && <Button variant="teal" icon="check" loading={busy === `${a.id}:approve`} onClick={() => act('approve')}>Approve</Button>}
      {staff && a.status === 'confirmed' && <Button variant="teal" icon="check" loading={busy === `${a.id}:complete`} onClick={() => act('complete')}>Mark completed</Button>}
    </>}>
      <div className="cell-person" style={{ marginBottom: '1rem' }}>
        <Avatar name={a.patient.name} size="lg" />
        <div><h3 style={{ fontSize: '1.1rem' }}>{a.patient.name}</h3><StatusBadge status={a.status} /></div>
      </div>
      <dl className="dl">
        <dt>Date</dt><dd>{fmtLong(a.slot.starts_at)}</dd>
        <dt>Time</dt><dd>{fmtTime(a.slot.starts_at)} – {fmtTime(a.slot.ends_at)}</dd>
        <dt>Clinician</dt><dd>{a.clinician.name} · {a.clinician.specialty}</dd>
        {a.clinician.room && <><dt>Room</dt><dd>{a.clinician.room}</dd></>}
        <dt>Reason</dt><dd>{a.reason || <span className="muted">Not provided</span>}</dd>
      </dl>
      <h3 style={{ margin: '1.25rem 0 .5rem' }}>Status history</h3>
      {detail.loading && !detail.data ? <SkeletonRows rows={2} /> : detail.error ? <Alert kind="error">{detail.error}</Alert> : (
        <ol className="history" aria-label="Status history">
          {detail.data?.history?.map((h, i) => (
            <li key={i}>{fmtDay(h.at)} {fmtTime(h.at)}: {h.from ? `${h.from} → ` : ''}<b>{h.to}</b>{h.actor && ` by ${h.actor.name}`}{h.note && ` (${h.note})`}</li>
          ))}
        </ol>
      )}
    </Modal>
  )
}
