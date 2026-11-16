import { useMemo, useState } from 'react'
import { api, fmt } from '../api'
import { useAuth } from '../auth'
import { Alert, Avatar, Button, EmptyState, errMsg, PageHeader, SearchBox, SkeletonRows, useFeedback, useFetch } from '../ui'

interface Log { id: number; actor_id: number | null; actor_role: string | null; action: string; resource_type: string; resource_id: number | null; subject_patient_id: number | null; created_at: string }
const ACT_TONE: Record<string, string> = { read: 'b-info', create: 'b-ok', update: 'b-warn', denied: 'b-cancelled', login: 'b-open', login_failed: 'b-cancelled' }

export function AuditLog() {
  const [action, setAction] = useState('')
  const [search, setSearch] = useState('')
  const logs = useFetch<{ data: Log[] }>(`/admin/audit-logs${action ? `?action=${action}` : ''}`)
  const rows = useMemo(() => {
    const s = search.trim().toLowerCase()
    return (logs.data?.data ?? []).filter(l => !s || `${l.actor_role} ${l.actor_id} ${l.resource_type} ${l.resource_id} ${l.subject_patient_id}`.toLowerCase().includes(s))
  }, [logs.data, search])
  return (
    <>
      <PageHeader title="Audit trail" subtitle="Who did what and when. Clinical note content is never stored here." />
      {logs.error && <Alert kind="error">{logs.error}</Alert>}
      <section className="card">
        <div className="toolbar">
          <SearchBox value={search} onChange={setSearch} placeholder="Filter by actor, resource or patient…" />
          <select aria-label="Action" value={action} onChange={e => setAction(e.target.value)}>
            <option value="">All actions</option>{['read', 'create', 'update', 'denied', 'login', 'login_failed'].map(a => <option key={a}>{a}</option>)}
          </select>
        </div>
        {logs.loading && !logs.data ? <SkeletonRows rows={5} /> : !rows.length ? <EmptyState icon="audit" title="No log entries match" /> : (
          <div className="table-wrap">
            <table className="table stack">
              <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Resource</th><th>Patient</th></tr></thead>
              <tbody>{rows.map(l => (
                <tr key={l.id}>
                  <td data-label="Time" className="nowrap">{fmt(l.created_at)}</td>
                  <td data-label="Actor"><span className="role-chip">{l.actor_role ?? 'anon'}</span> <span className="muted">#{l.actor_id ?? '-'}</span></td>
                  <td data-label="Action"><span className={`badge ${ACT_TONE[l.action] ?? ''}`}>{l.action.replace('_', ' ')}</span></td>
                  <td data-label="Resource">{l.resource_type}{l.resource_id ? ` #${l.resource_id}` : ''}</td>
                  <td data-label="Patient">{l.subject_patient_id ? `#${l.subject_patient_id}` : <span className="muted">—</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}

interface U { id: number; name: string; email: string; role: string; is_active: boolean }
export function Users() {
  const { user } = useAuth()
  const { toast, confirm } = useFeedback()
  const users = useFetch<U[]>('/admin/users')
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [busy, setBusy] = useState<number | null>(null)
  const flip = async (u: U) => {
    if (u.is_active && !(await confirm({ title: `Deactivate ${u.name}?`, message: 'They will no longer be able to sign in until reactivated.', confirmLabel: 'Deactivate', danger: true }))) return
    setBusy(u.id)
    try { await api(`/admin/users/${u.id}/active`, { method: 'PATCH', body: { is_active: !u.is_active } }); toast('ok', `${u.name} ${u.is_active ? 'deactivated' : 'activated'}.`) } catch (e) { toast('error', errMsg(e)) }
    setBusy(null); users.reload()
  }
  const s = search.trim().toLowerCase()
  const rows = (users.data ?? []).filter(u => (!role || u.role === role) && (!s || `${u.name} ${u.email}`.toLowerCase().includes(s)))
  return (
    <>
      <PageHeader title="Users" subtitle="Manage who can sign in to the clinic system." />
      {users.error && <Alert kind="error">{users.error}</Alert>}
      <section className="card">
        <div className="toolbar">
          <SearchBox value={search} onChange={setSearch} placeholder="Search name or email…" />
          <select aria-label="Role" value={role} onChange={e => setRole(e.target.value)}>
            <option value="">All roles</option>{['patient', 'clinician', 'receptionist', 'administrator'].map(r => <option key={r}>{r}</option>)}
          </select>
        </div>
        {users.loading && !users.data ? <SkeletonRows rows={5} /> : !rows.length ? <EmptyState icon="users" title="No users match" /> : (
          <div className="table-wrap">
            <table className="table stack">
              <thead><tr><th>Name</th><th>Role</th><th>Status</th><th><span className="sr">Actions</span></th></tr></thead>
              <tbody>{rows.map(u => (
                <tr key={u.id}>
                  <td data-label="Name"><div className="cell-person"><Avatar name={u.name} /><div><b>{u.name}</b><small>{u.email}</small></div></div></td>
                  <td data-label="Role"><span className="role-chip">{u.role}</span></td>
                  <td data-label="Status"><span className={`badge ${u.is_active ? 'b-ok' : 'b-blocked'}`}>{u.is_active ? 'Active' : 'Inactive'}</span></td>
                  <td className="row-actions"><Button size="sm" variant={u.is_active ? 'danger-outline' : 'teal'} loading={busy === u.id} disabled={u.id === user?.id} title={u.id === user?.id ? 'You cannot change your own account' : undefined} onClick={() => flip(u)}>{u.is_active ? 'Deactivate' : 'Activate'}</Button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
