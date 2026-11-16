import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { api, ApiError } from './api'

/** Accessible status/error banner; messages come from the server and are already generic. */
export function Alert({ kind, children }: { kind: 'error' | 'ok' | 'warn'; children: ReactNode }) {
  return <div className={`alert ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</div>
}

export function errMsg(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 403) return 'You do not have permission to do that.'
    if (e.status === 409) return `Conflict: ${e.message}`
    return e.message
  }
  return 'Something went wrong. Please try again.'
}

export function useFetch<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(!!path)
  const reload = useCallback(() => {
    if (!path) return
    setLoading(true)
    api<T>(path).then(d => { setData(d); setError(null) }).catch(e => setError(errMsg(e))).finally(() => setLoading(false))
  }, [path])
  useEffect(reload, [reload])
  return { data, error, loading, reload }
}

export const StatusBadge = ({ status }: { status: string }) => <span className={`badge b-${status}`}>{status}</span>
