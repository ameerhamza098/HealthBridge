import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, fmt, type Appointment, type Note } from '../api'
import { useAuth } from '../auth'
import { Icon } from '../icons'
import { Alert, Avatar, Button, EmptyState, errMsg, Field, fmtDay, fmtTime, Modal, PageHeader, SkeletonRows, StatusBadge, Switch, useFeedback, useFetch } from '../ui'

type Tab = 'all' | 'appointments' | 'notes'
type Entry = { kind: 'appt'; at: string; a: Appointment } | { kind: 'note'; at: string; n: Note }

/** Patient profile + chronological record. Notes load only for roles the API allows. */
export function Timeline() {
  const { user } = useAuth()
  const { toast } = useFeedback()
  const params = useParams()
  const pid = params.id ?? String(user!.id)
  const own = user!.role === 'patient'
  const canTryNotes = own || user!.role === 'clinician'
  const tl = useFetch<{ patient: { id: number; name: string }; appointments: Appointment[] }>(`/patients/${pid}/timeline`)
  const notes = useFetch<Note[]>(canTryNotes ? `/patients/${pid}/notes` : null)
  const [tab, setTab] = useState<Tab>('all')
  const [adding, setAdding] = useState(false)

  const appts = tl.data?.appointments ?? []
  const now = Date.now()
  const upcoming = appts.filter(a => isUp(a) && new Date(a.slot.starts_at).getTime() > now).sort((a, b) => a.slot.starts_at.localeCompare(b.slot.starts_at))
  const entries: Entry[] = [
    ...(tab !== 'notes' ? appts.map(a => ({ kind: 'appt' as const, at: a.slot.starts_at, a })) : []),
    ...(tab !== 'appointments' ? (notes.data ?? []).map(n => ({ kind: 'note' as const, at: n.created_at, n })) : []),
  ].sort((x, y) => y.at.localeCompare(x.at))
  const name = tl.data?.patient.name ?? ''

  return (
    <>
      <PageHeader title={own ? 'My records' : 'Patient profile'} subtitle={own ? 'Your visits and clinician notes in one place.' : undefined}>
        {!own && <Link className="btn secondary" to="/patients"><Icon name="chevL" size={16} />All patients</Link>}
        {user!.role === 'clinician' && <Button icon="note" onClick={() => setAdding(true)} disabled={!appts.some(a => ['confirmed', 'completed'].includes(a.status))}>Add note</Button>}
      </PageHeader>
      {tl.error && <Alert kind="error">{tl.error}</Alert>}

      <div className="grid g-profile">
        <aside>
          <section className="card profile-card" aria-label="Patient summary">
            {tl.loading && !tl.data ? <div className="skel" style={{ height: 120 }} /> : <>
              <Avatar name={name || '?'} size="lg" />
              <h2 style={{ fontSize: '1.2rem' }}>{name}</h2>
              <p className="muted small">Patient ID #{pid}</p>
            </>}
          </section>
          <section className="card card-pad" aria-label="Summary">
            <h3 style={{ marginBottom: '.75rem' }}>Overview</h3>
            <dl className="dl" style={{ gridTemplateColumns: '1fr auto' }}>
              <dt>Total visits</dt><dd>{appts.length}</dd>
              <dt>Completed</dt><dd>{appts.filter(a => a.status === 'completed').length}</dd>
              <dt>Upcoming</dt><dd>{upcoming.length}</dd>
              {canTryNotes && <><dt>Clinical notes</dt><dd>{notes.data?.length ?? '—'}</dd></>}
            </dl>
          </section>
          <section className="card card-pad" aria-label="Next appointment">
            <h3 style={{ marginBottom: '.6rem' }}>Next appointment</h3>
            {upcoming[0] ? <><b>{fmt(upcoming[0].slot.starts_at)}</b><div className="small muted">{upcoming[0].clinician.name} · {upcoming[0].clinician.specialty}</div><div style={{ marginTop: '.5rem' }}><StatusBadge status={upcoming[0].status} /></div></>
              : <p className="muted small">None scheduled.</p>}
          </section>
        </aside>

        <section className="card" aria-label="Medical record">
          <div className="tabs" role="tablist" aria-label="Record sections">
            {([['all', 'All activity'], ['appointments', 'Appointments'], ...(canTryNotes ? [['notes', 'Clinician notes']] : [])] as [Tab, string][]).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>
          <div className="card-body">
            {canTryNotes && notes.error && tab !== 'appointments' && <Alert kind="warn">Clinician notes are not available for this patient. This usually means consent has not been given or there is no treating relationship.</Alert>}
            {(tl.loading && !tl.data) || (notes.loading && !notes.data && !notes.error && canTryNotes) ? <SkeletonRows rows={3} /> : !entries.length ? (
              <EmptyState icon="file" title="No records yet">{tab === 'notes' ? 'No clinician notes have been recorded.' : 'Appointments and notes will be listed here in date order.'}</EmptyState>
            ) : (
              <ol className="tl" aria-label="Record timeline">
                {entries.map(e => e.kind === 'appt' ? (
                  <li key={`a${e.a.id}`}>
                    <span className={`tl-ico ${e.a.status === 'completed' ? 'done' : ['cancelled', 'rejected'].includes(e.a.status) ? 'bad' : ''}`}><Icon name="calendar" size={15} /></span>
                    <div className="tl-card">
                      <div className="tl-meta"><b style={{ color: 'var(--fg)' }}>Appointment</b><span>{fmtDay(e.a.slot.starts_at)} · {fmtTime(e.a.slot.starts_at)}</span><StatusBadge status={e.a.status} /></div>
                      <div>with <b>{e.a.clinician.name}</b> <span className="muted">({e.a.clinician.specialty})</span></div>
                      {e.a.reason && <div className="small muted">Reason: {e.a.reason}</div>}
                      {!!e.a.history?.length && <details style={{ marginTop: '.4rem' }}><summary className="small muted" style={{ cursor: 'pointer' }}>Status history</summary>
                        <ul className="history">{e.a.history.map((h, i) => <li key={i}>{fmt(h.at)}: {h.to}{h.actor && ` (${h.actor.name})`}</li>)}</ul></details>}
                    </div>
                  </li>
                ) : (
                  <li key={`n${e.n.id}`}>
                    <span className="tl-ico note"><Icon name="note" size={15} /></span>
                    <div className="tl-card note">
                      <div className="tl-meta"><b style={{ color: 'var(--fg)' }}>Clinician note</b><span>{fmt(e.n.created_at)}</span><span>{e.n.clinician}</span></div>
                      <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{e.n.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      </div>

      {adding && <NoteModal appts={appts.filter(a => ['confirmed', 'completed'].includes(a.status))} onClose={() => setAdding(false)} onSaved={() => { toast('ok', 'Note saved.'); notes.reload() }} />}
    </>
  )
}
const isUp = (a: Appointment) => a.status === 'requested' || a.status === 'confirmed'

function NoteModal({ appts, onClose, onSaved }: { appts: Appointment[]; onClose: () => void; onSaved: () => void }) {
  const [target, setTarget] = useState(appts[0] ? String(appts[0].id) : '')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr('')
    try { await api(`/appointments/${target}/notes`, { method: 'POST', body: { body } }); onSaved(); onClose() }
    catch (x) { setErr(errMsg(x)) } finally { setBusy(false) }
  }
  return (
    <Modal title="Add clinical note" onClose={onClose}>
      <form onSubmit={save}>
        {err && <Alert kind="error">{err}</Alert>}
        <Field label="Appointment"><select required value={target} onChange={e => setTarget(e.target.value)}>
          <option value="">Select…</option>{appts.map(a => <option key={a.id} value={a.id}>{fmt(a.slot.starts_at)} ({a.status})</option>)}
        </select></Field>
        <Field label="Note" hint={`Synthetic content only. ${body.length}/2000`}><textarea required maxLength={2000} rows={5} value={body} onChange={e => setBody(e.target.value)} /></Field>
        <div className="modal-foot" style={{ margin: '0 -1.25rem -1.1rem', borderRadius: 0 }}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" loading={busy}>Save note</Button>
        </div>
      </form>
    </Modal>
  )
}

interface Consent { type: string; granted: boolean }
const LABELS: Record<string, [string, string]> = {
  records_sharing: ['Share clinical notes with my treating clinician', 'Lets clinicians you have seen read the notes written about your visits.'],
  notifications: ['Appointment notifications', 'Minimal reminders and status updates. They never include health details.'],
}

export function Consents() {
  const { toast } = useFeedback()
  const c = useFetch<Consent[]>('/consents')
  const n = useFetch<{ id: number; type: string; payload: { message: string }; created_at: string }[]>('/notifications')
  const [busy, setBusy] = useState('')
  const toggle = async (x: Consent) => {
    setBusy(x.type)
    try { await api('/consents', { method: 'PUT', body: { type: x.type, granted: !x.granted } }); toast('ok', `Consent ${x.granted ? 'withdrawn' : 'granted'}.`) } catch (e) { toast('error', errMsg(e)) }
    c.reload(); setBusy('')
  }
  return (
    <>
      <PageHeader title="Privacy & consent" subtitle="You decide who can see your clinical notes. Changes take effect immediately." />
      {c.error && <Alert kind="error">{c.error}</Alert>}
      <div className="grid g2">
        <section className="card" aria-labelledby="cs">
          <div className="card-head"><h2 id="cs">Your consents</h2></div>
          {c.loading && !c.data ? <SkeletonRows rows={2} /> : c.data?.map(x => (
            <div key={x.type} className="skel-row" style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}><b>{LABELS[x.type]?.[0] ?? x.type}</b><div className="small muted">{LABELS[x.type]?.[1]}</div></div>
              <Switch checked={x.granted} disabled={busy === x.type} label={LABELS[x.type]?.[0] ?? x.type} onChange={() => toggle(x)} />
            </div>
          ))}
          <div className="card-body small muted">You can withdraw consent at any time; access stops immediately.</div>
        </section>
        <section className="card" aria-labelledby="ns">
          <div className="card-head"><h2 id="ns">My notifications</h2></div>
          {n.loading && !n.data ? <SkeletonRows rows={2} /> : n.data?.length ? <ul className="feed">{n.data.map(x => <li key={x.id}>{x.payload.message}<div className="xs muted">{fmt(x.created_at)}</div></li>)}</ul>
            : <EmptyState icon="bell" title="No notifications yet" />}
        </section>
      </div>
    </>
  )
}
