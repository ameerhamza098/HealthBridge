import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { type Appointment } from '../api'
import { Alert, Avatar, EmptyState, fmtDay, PageHeader, SearchBox, SkeletonRows, StatusBadge, useFetch } from '../ui'

interface P { id: number; name: string; total: number; completed: number; last?: Appointment; next?: Appointment }
type SortKey = 'name' | 'last' | 'next' | 'total'

/** Patient directory built from the appointments the signed-in role is allowed to see. */
export default function Patients() {
  const nav = useNavigate()
  const appts = useFetch<Appointment[]>('/appointments')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 })

  const patients = useMemo(() => {
    const now = Date.now()
    const m = new Map<number, P>()
    for (const a of appts.data ?? []) {
      const p = m.get(a.patient.id) ?? { id: a.patient.id, name: a.patient.name, total: 0, completed: 0 }
      p.total++
      if (a.status === 'completed') p.completed++
      const t = new Date(a.slot.starts_at).getTime()
      if (['completed', 'confirmed', 'requested'].includes(a.status) && t <= now && (!p.last || t > new Date(p.last.slot.starts_at).getTime())) p.last = a
      if (['confirmed', 'requested'].includes(a.status) && t > now && (!p.next || t < new Date(p.next.slot.starts_at).getTime())) p.next = a
      m.set(p.id, p)
    }
    const s = search.trim().toLowerCase()
    const val = (p: P) => sort.key === 'name' ? p.name.toLowerCase() : sort.key === 'total' ? p.total : sort.key === 'last' ? p.last?.slot.starts_at ?? '' : p.next?.slot.starts_at ?? '9999'
    return [...m.values()]
      .filter(p => (!s || p.name.toLowerCase().includes(s)) && (!filter || (filter === 'upcoming' ? !!p.next : filter === 'completed' ? p.completed > 0 : !p.next)))
      .sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * sort.dir)
  }, [appts.data, search, filter, sort])

  const th = (key: SortKey, label: string) => (
    <th aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button className="th-sort" onClick={() => setSort(s => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}>{label} {sort.key === key ? (sort.dir === 1 ? '↑' : '↓') : ''}</button>
    </th>
  )

  return (
    <>
      <PageHeader title="Patients" subtitle="Patients you have appointments with. Open a profile to see their visit history and clinical notes." />
      {appts.error && <Alert kind="error">{appts.error}</Alert>}
      <section className="card" aria-label="Patient list">
        <div className="toolbar">
          <SearchBox value={search} onChange={setSearch} placeholder="Search patients by name…" />
          <select aria-label="Filter patients" value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="">All patients</option><option value="upcoming">With upcoming visit</option><option value="none">No upcoming visit</option><option value="completed">Has completed visits</option>
          </select>
        </div>
        {appts.loading && !appts.data ? <SkeletonRows rows={5} /> : !patients.length ? (
          <EmptyState icon="users" title={appts.data?.length ? 'No patients match' : 'No patients yet'}>{appts.data?.length ? 'Try a different search or filter.' : 'Patients appear here after they request an appointment.'}</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table stack">
              <caption className="sr">Patients</caption>
              <thead><tr>{th('name', 'Patient')}{th('last', 'Last visit')}{th('next', 'Next visit')}{th('total', 'Visits')}<th><span className="sr">Open</span></th></tr></thead>
              <tbody>{patients.map(p => (
                <tr key={p.id} className="clickable" onClick={() => nav(`/patients/${p.id}`)}>
                  <td data-label="Patient"><div className="cell-person"><Avatar name={p.name} /><div><b>{p.name}</b><small>Patient ID #{p.id}</small></div></div></td>
                  <td data-label="Last visit">{p.last ? <>{fmtDay(p.last.slot.starts_at)} <StatusBadge status={p.last.status} /></> : <span className="muted">—</span>}</td>
                  <td data-label="Next visit">{p.next ? <>{fmtDay(p.next.slot.starts_at)} <StatusBadge status={p.next.status} /></> : <span className="muted">None scheduled</span>}</td>
                  <td data-label="Visits">{p.total}<span className="muted small"> ({p.completed} completed)</span></td>
                  <td className="row-actions"><Link className="btn sm secondary" to={`/patients/${p.id}`} onClick={e => e.stopPropagation()}>View profile</Link></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
