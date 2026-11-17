import { useState } from 'react'
import { api, fmt } from '../api'
import { Alert, Avatar, Button, EmptyState, errMsg, Field, Modal, PageHeader, SkeletonRows, useFeedback, useFetch } from '../ui'

interface App {
  id: number; name: string; email: string; phone: string; specialty: string; qualifications: string
  license_number: string; experience_years: number; status: 'pending' | 'approved' | 'rejected'
  decision_note: string | null; reviewed_at: string | null; created_at: string
}
const TABS = [['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected']] as const

/** Admin review queue for public "Join as a Doctor" requests. */
export default function DoctorApplications() {
  const { toast, confirm } = useFeedback()
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('pending')
  const list = useFetch<App[]>(`/admin/doctor-applications?status=${tab}`)
  const [busy, setBusy] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<App | null>(null)
  const [note, setNote] = useState('')

  const decide = async (a: App, verb: 'approve' | 'reject', body?: unknown) => {
    setBusy(`${a.id}:${verb}`)
    try {
      await api(`/admin/doctor-applications/${a.id}/${verb}`, { method: 'POST', body })
      toast('ok', verb === 'approve' ? `${a.name} approved. They can now sign in as a clinician.` : `Application from ${a.name} rejected.`)
      setRejecting(null); setNote('')
    } catch (e) { toast('error', errMsg(e)) }
    setBusy(null); list.reload()
  }
  const approve = async (a: App) => {
    if (await confirm({ title: `Approve ${a.name}?`, message: `This creates an active clinician account for ${a.email} with the ${a.specialty} specialty.`, confirmLabel: 'Approve and create account' })) decide(a, 'approve')
  }

  return (
    <>
      <PageHeader title="Doctor applications" subtitle="Review requests from doctors who want to join the clinic. Approving creates their clinician login." />
      {list.error && <Alert kind="error">{list.error}</Alert>}
      <section className="card">
        <div className="tabs" role="tablist" aria-label="Application status">
          {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}{tab === k && list.data ? ` (${list.data.length})` : ''}</button>)}
        </div>
        {list.loading && !list.data ? <SkeletonRows rows={3} /> : !list.data?.length ? (
          <EmptyState icon="stethoscope" title={`No ${tab} applications`}>{tab === 'pending' ? 'New requests from the public form will appear here.' : 'Nothing to show yet.'}</EmptyState>
        ) : (
          <ul className="list" style={{ opacity: list.loading ? 0.6 : 1 }}>
            {list.data.map(a => (
              <li key={a.id} style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <Avatar name={a.name} />
                <div style={{ flex: 1, minWidth: 240 }}>
                  <b>{a.name}</b> <span className="muted small">· {a.specialty} · {a.experience_years} yr{a.experience_years === 1 ? '' : 's'}</span>
                  <dl className="dl" style={{ marginTop: '.5rem', gridTemplateColumns: '110px minmax(0,1fr)' }}>
                    <dt>Email</dt><dd>{a.email}</dd><dt>Phone</dt><dd>{a.phone}</dd>
                    <dt>License</dt><dd>{a.license_number}</dd><dt>Qualifications</dt><dd>{a.qualifications}</dd>
                    <dt>Submitted</dt><dd>{fmt(a.created_at)}</dd>
                    {a.reviewed_at && <><dt>Reviewed</dt><dd>{fmt(a.reviewed_at)}{a.decision_note && ` · ${a.decision_note}`}</dd></>}
                  </dl>
                </div>
                {a.status === 'pending' && (
                  <div className="row-actions">
                    <Button variant="danger-outline" size="sm" disabled={!!busy} onClick={() => { setRejecting(a); setNote('') }}>Reject</Button>
                    <Button variant="teal" size="sm" icon="check" loading={busy === `${a.id}:approve`} disabled={!!busy} onClick={() => approve(a)}>Approve</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {rejecting && (
        <Modal title="Reject application" size="sm" onClose={() => setRejecting(null)} footer={<>
          <Button variant="secondary" onClick={() => setRejecting(null)}>Cancel</Button>
          <Button variant="danger" loading={busy === `${rejecting.id}:reject`} onClick={() => decide(rejecting, 'reject', { note: note || null })}>Reject application</Button>
        </>}>
          <p>Reject the application from <b>{rejecting.name}</b>? No account will be created.</p>
          <Field label="Reason (optional)"><input maxLength={200} value={note} onChange={e => setNote(e.target.value)} /></Field>
        </Modal>
      )}
    </>
  )
}
