export type Role = 'patient' | 'clinician' | 'receptionist' | 'administrator'
export interface User { id: number; name: string; email: string; role: Role }
export interface Slot { id: number; starts_at: string; ends_at: string; clinician: { id: number; name: string; specialty: string } }
export interface HistoryItem { from: string | null; to: string; note: string | null; actor: { name: string; role: string } | null; at: string }
export interface Appointment {
  id: number; status: string; reason: string | null
  patient: { id: number; name: string }
  clinician: { id: number; name: string; specialty: string; room: string | null }
  slot: { id: number; starts_at: string; ends_at: string }
  history?: HistoryItem[]
}
export interface ScheduleRow {
  slot_id: number; starts_at: string; ends_at: string; slot_status: string
  clinician: { id: number; name: string }
  appointment: { id: number; status: string; patient_name: string } | null
  warnings: string[]
}
export interface Note { id: number; appointment_id: number; body: string; clinician: string; created_at: string }

/** Error carrying only the server's generic message and a status. */
export class ApiError extends Error {
  status: number
  fields: Record<string, string[]>
  constructor(status: number, message: string, fields: Record<string, string[]> = {}) {
    super(message)
    this.status = status
    this.fields = fields
  }
}

let token: string | null = sessionStorage.getItem('token')
export const setToken = (t: string | null) => {
  token = t
  if (t) sessionStorage.setItem('token', t); else sessionStorage.removeItem('token')
}
export const hasToken = () => !!token

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch('/api' + path, {
    method: opts.method ?? 'GET',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401) { setToken(null); window.dispatchEvent(new Event('auth-expired')) }
    const first = data.errors ? Object.values<string[]>(data.errors)[0]?.[0] : undefined
    throw new ApiError(res.status, first ?? data.message ?? 'Request failed.', data.errors)
  }
  return data as T
}

export const fmt = (iso: string) =>
  new Date(iso).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
