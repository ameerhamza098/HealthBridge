import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fmt, type Appointment } from '../api'
import { useAuth } from '../auth'
import { Icon } from '../icons'
import { Alert, Avatar, dateKey, EmptyState, fmtTime, SkeletonRows, Stat, StatusBadge, useFetch } from '../ui'

const COLORS: Record<string, string> = { requested: '#d97706', confirmed: '#1269c4', completed: '#15803d', cancelled: '#dc2626', rejected: '#f87171', rescheduled: '#7c5cd6' }

function Donut({ counts }: { counts: [string, number][] }) {
  const total = counts.reduce((s, [, n]) => s + n, 0)
  const R = 15.9155
  let offset = 25
  return (
    <div className="donut-wrap">
      <svg width="150" height="150" viewBox="0 0 36 36" role="img" aria-label={`Appointments by status: ${counts.map(([s, n]) => `${n} ${s}`).join(', ')}`}>
        <circle cx="18" cy="18" r={R} fill="none" stroke="#eef2f6" strokeWidth="4" />
        {counts.map(([s, n]) => {
          const len = (n / total) * 100
          const el = <circle key={s} cx="18" cy="18" r={R} fill="none" stroke={COLORS[s]} strokeWidth="4" strokeDasharray={`${len} ${100 - len}`} strokeDashoffset={offset} />
          offset -= len
          return el
        })}
        <text x="18" y="18.8" textAnchor="middle" fontSize="6" fontWeight="700" fill="#0f1f38">{total}</text>
        <text x="18" y="23" textAnchor="middle" fontSize="2.4" fill="#64748b">TOTAL</text>
      </svg>
      <ul className="legend">{counts.map(([s, n]) => <li key={s}><i style={{ background: COLORS[s] }} />{s[0].toUpperCase() + s.slice(1)}<b>{n}</b></li>)}</ul>
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const nav = useNavigate()
  const staff = user!.role !== 'patient'
  const appts = useFetch<Appointment[]>('/appointments')
  const notes = useFetch<{ id: number; payload: { message: string }; created_at: string }[]>(staff ? null : '/notifications')
  const all = useMemo(() => appts.data ?? [], [appts.data])

  const m = useMemo(() => {
    const now = Date.now()
    const active = all.filter(a => a.status === 'requested' || a.status === 'confirmed')
    const upcoming = active.filter(a => new Date(a.slot.ends_at).getTime() >= now).sort((a, b) => a.slot.starts_at.localeCompare(b.slot.starts_at))
    const patients = new Set(all.map(a => a.patient.id))
    const week = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - d.getDay() + i); return d })
    const perDay = week.map(d => ({ d, n: all.filter(a => dateKey(new Date(a.slot.starts_at)) === dateKey(d) && a.status !== 'cancelled' && a.status !== 'rejected').length }))
    const statusCounts = Object.keys(COLORS).map(s => [s, all.filter(a => a.status === s).length] as [string, number]).filter(([, n]) => n > 0)
    return { upcoming, patients: patients.size, perDay, statusCounts, completed: all.filter(a => a.status === 'completed').length, pending: all.filter(a => a.status === 'requested').length }
  }, [all])
  const maxDay = Math.max(1, ...m.perDay.map(x => x.n))
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const first = user!.name.replace(/^Dr\.?\s+/i, 'Dr. ').split(' ').slice(0, user!.name.startsWith('Dr') ? 2 : 1).join(' ')
  const recent = all.slice(0, 6)

  return (
    <>
      <div className="hero">
        <div>
          <h1>{greeting}, {first}</h1>
          <p>{staff ? (m.pending ? `${m.pending} appointment request${m.pending > 1 ? 's' : ''} waiting for review.` : 'No requests waiting. Here is your clinic overview.') : (m.upcoming[0] ? `Your next visit is ${fmt(m.upcoming[0].slot.starts_at)} with ${m.upcoming[0].clinician.name}.` : 'You have no upcoming visits. Book one whenever you are ready.')}</p>
        </div>
        <div className="page-actions">
          <Link className="btn" to="/appointments"><Icon name="calendar" size={17} />{staff ? 'Manage appointments' : 'Book appointment'}</Link>
          {staff && m.pending > 0 && <Link className="btn ghost" to="/queue">Review requests</Link>}
        </div>
      </div>
      {appts.error && <Alert kind="error">{appts.error}</Alert>}

      <div className="stats">
        {staff ? <Stat icon="users" value={m.patients} label="Total patients" loading={appts.loading && !appts.data} /> : <Stat icon="alert" tone="amber" value={m.pending} label="Awaiting confirmation" loading={appts.loading && !appts.data} />}
        <Stat icon="calendar" tone="teal" value={all.length} label="Total appointments" loading={appts.loading && !appts.data} />
        <Stat icon="clock" tone="amber" value={m.upcoming.length} label="Upcoming appointments" loading={appts.loading && !appts.data} />
        <Stat icon="check" tone="green" value={m.completed} label="Completed consultations" loading={appts.loading && !appts.data} />
      </div>

      <div className="grid g-main">
        <div>
          <section className="card" aria-labelledby="wk">
            <div className="card-head"><h2 id="wk">Appointments this week</h2><span className="small muted">Excludes cancelled and rejected</span></div>
            <div className="card-body">
              <div className="bars" role="img" aria-label={`Appointments this week: ${m.perDay.map(x => `${x.d.toLocaleDateString([], { weekday: 'long' })} ${x.n}`).join(', ')}`}>
                {m.perDay.map(({ d, n }) => (
                  <div className="bar-col" key={dateKey(d)}>
                    <span className="bar-val">{n}</span>
                    <div className={`bar ${dateKey(d) === dateKey(new Date()) ? 'today' : ''}`} style={{ height: `${(n / maxDay) * 100}%` }} />
                    <span className="bar-lbl">{d.toLocaleDateString([], { weekday: 'short' })}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="card" aria-labelledby="rec">
            <div className="card-head"><h2 id="rec">Recent appointments</h2><Link to="/appointments" className="small">View all</Link></div>
            {appts.loading && !appts.data ? <SkeletonRows rows={4} /> : !recent.length ? (
              <EmptyState icon="calendar" title="No appointments yet">Requests will show up here as soon as they are made.</EmptyState>
            ) : (
              <div className="table-wrap">
                <table className="table stack">
                  <thead><tr><th>{staff ? 'Patient' : 'Clinician'}</th><th>When</th><th className="hide-sm">Reason</th><th>Status</th></tr></thead>
                  <tbody>{recent.map(a => (
                    <tr key={a.id} className="clickable" onClick={() => nav('/appointments')}>
                      <td data-label={staff ? 'Patient' : 'Clinician'}><div className="cell-person"><Avatar name={staff ? a.patient.name : a.clinician.name} /><div><b>{staff ? a.patient.name : a.clinician.name}</b><small>{staff ? a.clinician.name : a.clinician.specialty}</small></div></div></td>
                      <td data-label="When" className="nowrap">{fmt(a.slot.starts_at)}</td>
                      <td data-label="Reason" className="hide-sm muted">{a.reason || '—'}</td>
                      <td data-label="Status"><StatusBadge status={a.status} /></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <div>
          <section className="card" aria-labelledby="qa">
            <div className="card-head"><h2 id="qa">Quick actions</h2></div>
            <div className="quick">
              <Link to="/appointments"><Icon name="plus" />New appointment</Link>
              {staff ? <><Link to="/queue"><Icon name="queue" />Daily queue</Link><Link to="/patients"><Icon name="users" />Patients</Link><Link to="/schedule"><Icon name="clock" />Schedule</Link></>
                : <><Link to="/timeline"><Icon name="file" />My records</Link><Link to="/privacy"><Icon name="shield" />Privacy</Link><Link to="/help"><Icon name="help" />Get help</Link></>}
            </div>
          </section>

          <section className="card" aria-labelledby="up">
            <div className="card-head"><h2 id="up">Upcoming</h2><Link to="/appointments" className="small">Calendar</Link></div>
            {appts.loading && !appts.data ? <SkeletonRows rows={3} /> : !m.upcoming.length ? <EmptyState icon="calendar" title="Nothing scheduled">Upcoming confirmed and requested visits appear here.</EmptyState> : (
              <ul className="list">{m.upcoming.slice(0, 5).map(a => {
                const d = new Date(a.slot.starts_at)
                return (
                  <li key={a.id}>
                    <div className="date-chip"><small>{d.toLocaleDateString([], { month: 'short' })}</small><b>{d.getDate()}</b></div>
                    <div style={{ minWidth: 0, flex: 1 }}><b className="truncate" style={{ display: 'block' }}>{staff ? a.patient.name : a.clinician.name}</b><span className="small muted">{fmtTime(a.slot.starts_at)} · {staff ? a.clinician.name : a.clinician.specialty}</span></div>
                    <StatusBadge status={a.status} />
                  </li>
                )
              })}</ul>
            )}
          </section>

          {m.statusCounts.length > 0 && (
            <section className="card" aria-labelledby="st"><div className="card-head"><h2 id="st">Status breakdown</h2></div><div className="card-body"><Donut counts={m.statusCounts} /></div></section>
          )}

          <section className="card" aria-labelledby="act">
            <div className="card-head"><h2 id="act">{staff ? 'Recent activity' : 'Notifications'}</h2></div>
            {staff ? (
              recent.length ? <ul className="feed">{recent.slice(0, 5).map(a => <li key={a.id}><b>{a.patient.name}</b> — appointment <b>{a.status}</b> with {a.clinician.name}<div className="xs muted">{fmt(a.slot.starts_at)}</div></li>)}</ul>
                : <EmptyState icon="pulse" title="No activity yet" />
            ) : notes.data?.length ? <ul className="feed">{notes.data.slice(0, 5).map(n => <li key={n.id}>{n.payload.message}<div className="xs muted">{fmt(n.created_at)}</div></li>)}</ul>
              : <EmptyState icon="bell" title="No notifications yet">Appointment updates will appear here.</EmptyState>}
          </section>
        </div>
      </div>
    </>
  )
}
