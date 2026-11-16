import { useState } from 'react'
import { api, fmt } from '../api'
import { Alert, errMsg, useFetch } from '../ui'

interface Log { id: number; actor_id: number | null; actor_role: string | null; action: string; resource_type: string; resource_id: number | null; subject_patient_id: number | null; created_at: string }

export function AuditLog() {
  const [action, setAction] = useState('')
  const logs = useFetch<{ data: Log[] }>(`/admin/audit-logs${action ? `?action=${action}` : ''}`)
  return (
    <>
      <h1>Audit trail</h1>
      <label>Action
        <select value={action} onChange={e => setAction(e.target.value)}>
          <option value="">All</option>
          {['read', 'create', 'update', 'denied', 'login', 'login_failed'].map(a => <option key={a}>{a}</option>)}
        </select>
      </label>
      {logs.error && <Alert kind="error">{logs.error}</Alert>}
      <table className="card">
        <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Resource</th><th>Patient</th></tr></thead>
        <tbody>
          {logs.data?.data.map(l => (
            <tr key={l.id}><td>{fmt(l.created_at)}</td><td>{l.actor_role ?? 'anon'} #{l.actor_id ?? '-'}</td><td>{l.action}</td>
              <td>{l.resource_type}{l.resource_id ? ` #${l.resource_id}` : ''}</td><td>{l.subject_patient_id ?? ''}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="muted">Entries record who did what and when. Clinical note content is never stored here.</p>
    </>
  )
}

interface U { id: number; name: string; email: string; role: string; is_active: boolean }
export function Users() {
  const users = useFetch<U[]>('/admin/users')
  const [err, setErr] = useState('')
  const flip = async (u: U) => {
    try { await api(`/admin/users/${u.id}/active`, { method: 'PATCH', body: { is_active: !u.is_active } }); setErr('') } catch (e) { setErr(errMsg(e)) }
    users.reload()
  }
  return (
    <>
      <h1>Users</h1>
      {err && <Alert kind="error">{err}</Alert>}
      <table className="card">
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Active</th></tr></thead>
        <tbody>{users.data?.map(u => (
          <tr key={u.id}><td>{u.name}</td><td>{u.email}</td><td>{u.role}</td>
            <td><button className="sm" onClick={() => flip(u)}>{u.is_active ? 'Deactivate' : 'Activate'}</button></td></tr>
        ))}</tbody>
      </table>
    </>
  )
}
