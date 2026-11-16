import { useMemo, useState } from 'react'
import { type Appointment } from '../api'
import { useAuth } from '../auth'
import { Icon } from '../icons'
import { Alert, Avatar, Button, dateKey, EmptyState, fmtDay, fmtTime, PageHeader, SearchBox, SkeletonRows, StatusBadge, useFetch } from '../ui'
import { AppointmentDetail, BookingModal, isActive, useApptActions } from './AppointmentDialogs'

type View = 'list' | 'day' | 'week' | 'month'
type SortKey = 'date' | 'patient' | 'clinician' | 'status'
const STATUSES = ['requested', 'confirmed', 'completed', 'cancelled', 'rejected', 'rescheduled']

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const startOfWeek = (d: Date) => addDays(startOfDay(d), -d.getDay())

export default function Appointments() {
  const { user } = useAuth()
  const staff = user!.role !== 'patient'
  const appts = useFetch<Appointment[]>('/appointments')
  const [view, setView] = useState<View>('list')
  const [cursor, setCursor] = useState(() => startOfDay(new Date()))
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [clin, setClin] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'date', dir: -1 })
  const [selected, setSelected] = useState<Appointment | null>(null)
  const [booking, setBooking] = useState(false)
  const [resched, setResched] = useState<Appointment | null>(null)
  const { run, busy } = useApptActions(appts.reload)

  const all = useMemo(() => appts.data ?? [], [appts.data])
  const clinicians = useMemo(() => [...new Map(all.map(a => [a.clinician.id, a.clinician.name])).entries()], [all])
  const patients = useMemo(() => [...new Map(all.map(a => [a.patient.id, a.patient.name])).entries()].map(([id, name]) => ({ id, name })), [all])

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase()
    const list = all.filter(a =>
      (!status || a.status === status) && (!clin || String(a.clinician.id) === clin) &&
      (!s || [a.patient.name, a.clinician.name, a.clinician.specialty, a.reason ?? '', a.status].some(v => v.toLowerCase().includes(s))))
    const val = (a: Appointment) => sort.key === 'date' ? a.slot.starts_at : sort.key === 'patient' ? a.patient.name : sort.key === 'clinician' ? a.clinician.name : a.status
    return [...list].sort((x, y) => (val(x) < val(y) ? -1 : val(x) > val(y) ? 1 : 0) * sort.dir)
  }, [all, search, status, clin, sort])

  const byDay = useMemo(() => {
    const m = new Map<string, Appointment[]>()
    filtered.forEach(a => { const k = dateKey(new Date(a.slot.starts_at)); m.set(k, [...(m.get(k) ?? []), a]) })
    m.forEach(v => v.sort((a, b) => a.slot.starts_at.localeCompare(b.slot.starts_at)))
    return m
  }, [filtered])

  const sortBy = (key: SortKey) => setSort(s => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))
  const th = (key: SortKey, label: string) => (
    <th aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button className="th-sort" onClick={() => sortBy(key)}>{label} {sort.key === key ? (sort.dir === 1 ? '↑' : '↓') : ''}</button>
    </th>
  )

  const step = (n: number) => setCursor(c => view === 'month' ? new Date(c.getFullYear(), c.getMonth() + n, 1) : addDays(c, n * (view === 'week' ? 7 : 1)))
  const title = view === 'month' ? cursor.toLocaleDateString([], { month: 'long', year: 'numeric' })
    : view === 'week' ? `${startOfWeek(cursor).toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${addDays(startOfWeek(cursor), 6).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`
    : cursor.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  const todayKey = dateKey(new Date())

  const chip = (a: Appointment) => (
    <button key={a.id} className={`chip ${a.status}`} onClick={() => setSelected(a)} title={`${a.patient.name} · ${a.clinician.name} · ${a.status}`}>
      <b className="nowrap">{fmtTime(a.slot.starts_at)}</b><span className="truncate">{staff ? a.patient.name : a.clinician.name}</span>
    </button>
  )
  const card = (a: Appointment) => (
    <button key={a.id} className={`appt-card ${a.status}`} onClick={() => setSelected(a)}>
      <Avatar name={staff ? a.patient.name : a.clinician.name} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <b className="truncate" style={{ display: 'block' }}>{staff ? a.patient.name : a.clinician.name}</b>
        <span className="small muted truncate" style={{ display: 'block' }}>{staff ? `${a.clinician.name} · ` : `${a.clinician.specialty} · `}{a.reason || 'General visit'}</span>
      </div>
      <StatusBadge status={a.status} />
    </button>
  )

  const calendar = () => {
    if (view === 'day') {
      const items = byDay.get(dateKey(cursor)) ?? []
      return items.length ? <div className="agenda">{items.map(a => (
        <div className="agenda-row" key={a.id}><div className="agenda-time">{fmtTime(a.slot.starts_at)}<div className="xs muted">{fmtTime(a.slot.ends_at)}</div></div><div className="agenda-body">{card(a)}</div></div>
      ))}</div> : <EmptyState icon="calendar" title="No appointments this day" action={<Button icon="plus" onClick={() => setBooking(true)}>Book appointment</Button>}>Nothing matches your filters for this date.</EmptyState>
    }
    if (view === 'week') {
      return <div className="week">{Array.from({ length: 7 }, (_, i) => {
        const d = addDays(startOfWeek(cursor), i), k = dateKey(d), items = byDay.get(k) ?? []
        return (
          <div key={k} className={`col ${k === todayKey ? 'today' : ''}`}>
            <button className="col-head" onClick={() => { setCursor(d); setView('day') }} aria-label={`Open ${d.toDateString()}`}>{d.toLocaleDateString([], { weekday: 'short' })}<b>{d.getDate()}</b></button>
            {items.map(a => (
              <button key={a.id} className={`chip ${a.status}`} onClick={() => setSelected(a)}>
                <b>{fmtTime(a.slot.starts_at)}</b><span className="truncate" style={{ maxWidth: '100%' }}>{staff ? a.patient.name : a.clinician.name}</span>
              </button>
            ))}
            {!items.length && <span className="xs muted" style={{ textAlign: 'center' }}>—</span>}
          </div>
        )
      })}</div>
    }
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const gridStart = addDays(first, -first.getDay())
    const weeks = Math.ceil((first.getDay() + new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()) / 7)
    return (
      <div className="month">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div className="dow" key={d}>{d}</div>)}
        {Array.from({ length: weeks * 7 }, (_, i) => {
          const d = addDays(gridStart, i), k = dateKey(d), items = byDay.get(k) ?? []
          return (
            <div key={k} role="button" tabIndex={0} aria-label={`${d.toDateString()}, ${items.length} appointments`}
              className={`day ${d.getMonth() !== cursor.getMonth() ? 'out' : ''} ${k === todayKey ? 'today' : ''}`}
              onClick={() => { setCursor(d); setView('day') }} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setCursor(d), setView('day'))}>
              <span className="day-num">{d.getDate()}</span>
              {items.slice(0, 2).map(a => <span key={a.id} onClick={e => e.stopPropagation()}>{chip(a)}</span>)}
              {items.length > 2 && <span className="more">+{items.length - 2} more</span>}
              {items.length > 0 && <span className="count">{items.length}</span>}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <>
      <PageHeader title="Appointments" subtitle={staff ? 'Manage requests, bookings and cancellations across the clinic.' : 'Request, reschedule or cancel your visits.'}>
        <Button variant="secondary" icon="refresh" onClick={appts.reload} aria-label="Refresh" loading={appts.loading && !!appts.data} />
        <Button icon="plus" onClick={() => setBooking(true)}>New appointment</Button>
      </PageHeader>
      {appts.error && <Alert kind="error">{appts.error}</Alert>}

      <section className="card" aria-label="Appointments">
        <div className="toolbar">
          <SearchBox value={search} onChange={setSearch} placeholder={staff ? 'Search patient, clinician or reason…' : 'Search clinician or reason…'} />
          <select aria-label="Filter by status" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">All statuses</option>{STATUSES.map(s => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </select>
          {user!.role !== 'clinician' && (
            <select aria-label="Filter by clinician" value={clin} onChange={e => setClin(e.target.value)}>
              <option value="">All clinicians</option>{clinicians.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
            </select>
          )}
          <div className="seg" role="group" aria-label="View">
            {(['list', 'day', 'week', 'month'] as View[]).map(v => <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>{v[0].toUpperCase() + v.slice(1)}</button>)}
          </div>
        </div>

        {view !== 'list' && (
          <div className="cal-nav">
            <Button size="sm" variant="secondary" aria-label="Previous" icon="chevL" onClick={() => step(-1)} />
            <Button size="sm" variant="secondary" onClick={() => setCursor(startOfDay(new Date()))}>Today</Button>
            <Button size="sm" variant="secondary" aria-label="Next" icon="chevR" onClick={() => step(1)} />
            <h2 className="cal-title" aria-live="polite">{title}</h2>
          </div>
        )}

        {appts.loading && !appts.data ? <SkeletonRows rows={5} /> : view !== 'list' ? calendar() : !filtered.length ? (
          <EmptyState icon="calendar" title={all.length ? 'No appointments match your filters' : 'No appointments yet'}
            action={all.length ? <Button variant="secondary" onClick={() => { setSearch(''); setStatus(''); setClin('') }}>Clear filters</Button> : <Button icon="plus" onClick={() => setBooking(true)}>Book your first appointment</Button>}>
            {all.length ? 'Try adjusting the search or filters.' : 'Appointments you request will appear here.'}
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table stack">
              <caption className="sr">Appointments</caption>
              <thead><tr>{th('date', 'When')}{staff ? th('patient', 'Patient') : null}{th('clinician', 'Clinician')}{th('status', 'Status')}<th><span className="sr">Actions</span></th></tr></thead>
              <tbody>
                {filtered.map(a => (
                  <tr key={a.id}>
                    <td data-label="When"><b>{fmtDay(a.slot.starts_at)}</b><div className="small muted">{fmtTime(a.slot.starts_at)} – {fmtTime(a.slot.ends_at)}</div></td>
                    {staff && <td data-label="Patient"><div className="cell-person"><Avatar name={a.patient.name} /><b>{a.patient.name}</b></div></td>}
                    <td data-label="Clinician"><div className="cell-person">{!staff && <Avatar name={a.clinician.name} tone={1} />}<div><b>{a.clinician.name}</b><small>{a.clinician.specialty}</small></div></div></td>
                    <td data-label="Status"><StatusBadge status={a.status} /></td>
                    <td className="row-actions">
                      {staff && a.status === 'requested' && <Button size="sm" variant="teal" loading={busy === `${a.id}:approve`} onClick={() => run(a, 'approve')}>Approve</Button>}
                      {staff && a.status === 'confirmed' && <Button size="sm" variant="teal" loading={busy === `${a.id}:complete`} onClick={() => run(a, 'complete')}>Complete</Button>}
                      {isActive(a.status) && <Button size="sm" variant="secondary" onClick={() => setResched(a)}>Reschedule</Button>}
                      <Button size="sm" variant="ghost" icon="chevR" onClick={() => setSelected(a)} aria-label={`View appointment details for ${a.patient.name}`}>Details</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {view === 'list' && filtered.length > 0 && <div className="card-body small muted" style={{ borderTop: '1px solid var(--line)' }}><Icon name="calendar" size={14} /> Showing {filtered.length} of {all.length} appointments</div>}
      </section>

      {selected && <AppointmentDetail appt={selected} onClose={() => setSelected(null)} onChange={appts.reload} onReschedule={setResched} />}
      {booking && <BookingModal patients={patients} onClose={() => setBooking(false)} onDone={appts.reload} />}
      {resched && <BookingModal reschedule={resched} onClose={() => setResched(null)} onDone={appts.reload} />}
    </>
  )
}
