import { createContext, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { api, ApiError } from './api'
import { Icon } from './icons'

/* ---------- helpers ---------- */
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

export const initials = (name: string) => name.replace(/^(Dr\.?|Mr\.?|Ms\.?|Mrs\.?)\s+/i, '').split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('')
export const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
export const fmtDay = (iso: string) => new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
export const fmtLong = (iso: string) => new Date(iso).toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

/* ---------- display ---------- */
export function Alert({ kind, children }: { kind: 'error' | 'ok' | 'warn' | 'info'; children: ReactNode }) {
  return <div className={`alert ${kind}`} role={kind === 'error' ? 'alert' : 'status'}><Icon name={kind === 'ok' ? 'check' : 'alert'} size={18} /><div>{children}</div></div>
}

export const StatusBadge = ({ status }: { status: string }) => <span className={`badge b-${status}`}>{status}</span>

export function Avatar({ name, size, tone }: { name: string; size?: 'sm' | 'lg'; tone?: number }) {
  const t = tone ?? [...name].reduce((s, c) => s + c.charCodeAt(0), 0) % 4
  return <span className={`avatar ${size ?? ''} ${t ? `t${t}` : ''}`} aria-hidden="true">{initials(name)}</span>
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  )
}

export function EmptyState({ icon = 'inbox', title, children, action }: { icon?: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="empty"><div className="empty-ico"><Icon name={icon} size={26} /></div><h3>{title}</h3>{children && <p>{children}</p>}{action}</div>
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div className="skel-row" key={i}><div className="skel" style={{ width: 36, height: 36, borderRadius: '50%' }} /><div style={{ flex: 1, display: 'grid', gap: 8 }}><div className="skel" style={{ width: '40%' }} /><div className="skel" style={{ width: '65%', height: 10 }} /></div></div>
      ))}
    </div>
  )
}

export function Stat({ icon, tone, value, label, loading }: { icon: string; tone?: 'teal' | 'amber' | 'green'; value: ReactNode; label: string; loading?: boolean }) {
  return (
    <div className="stat">
      <div className={`stat-ico ${tone ?? ''}`}><Icon name={icon} size={22} /></div>
      <div><div className="stat-val">{loading ? <div className="skel" style={{ width: 44, height: 26 }} /> : value}</div><div className="stat-label">{label}</div></div>
    </div>
  )
}

/* ---------- controls ---------- */
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'secondary' | 'teal' | 'danger' | 'danger-outline' | 'ghost'; size?: 'sm'; loading?: boolean; icon?: string }
export function Button({ variant, size, loading, icon, children, className = '', disabled, ...rest }: BtnProps) {
  return (
    <button type="button" {...rest} disabled={disabled || loading} aria-busy={loading || undefined} className={`btn ${variant ?? ''} ${size ?? ''} ${className}`}>
      {loading ? <span className="spinner" aria-hidden="true" /> : icon ? <Icon name={icon} size={size ? 15 : 17} /> : null}{children}
    </button>
  )
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return <label className="field"><span className="lbl">{label}</span>{children}{hint && !error && <span className="hint">{hint}</span>}{error && <span className="err" role="alert">{error}</span>}</label>
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return <div className="search"><Icon name="search" size={16} /><input type="search" aria-label={placeholder} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} /></div>
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" disabled={disabled} onClick={onChange} />
}

/* ---------- modal ---------- */
export function Modal({ title, onClose, children, footer, size }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'wide' }) {
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    const root = ref.current!
    const focusables = () => [...root.querySelectorAll<HTMLElement>('button:not(:disabled),[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')]
    ;(root.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[1] ?? focusables()[0])?.focus()
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current() }
      if (e.key === 'Tab') {
        const f = focusables(); if (!f.length) return
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus() }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus() }
      }
    }
    document.addEventListener('keydown', key)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', key); document.body.style.overflow = ''; prev?.focus() }
  }, [])
  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${size ?? ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="modal-head"><h2>{title}</h2><button className="icon-btn" style={{ width: 32, height: 32 }} aria-label="Close dialog" onClick={onClose}><Icon name="x" size={16} /></button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

/* ---------- toasts & confirm ---------- */
interface ToastItem { id: number; kind: 'ok' | 'error'; text: string }
interface ConfirmOpts { title: string; message: string; confirmLabel?: string; danger?: boolean }
interface FeedbackCtx { toast(kind: 'ok' | 'error', text: string): void; confirm(o: ConfirmOpts): Promise<boolean> }
const Ctx = createContext<FeedbackCtx>(null!)
export const useFeedback = () => useContext(Ctx)

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [dlg, setDlg] = useState<(ConfirmOpts & { resolve(v: boolean): void }) | null>(null)
  const seq = useRef(0)
  const dismiss = (id: number) => setToasts(t => t.filter(x => x.id !== id))
  const toast = useCallback((kind: 'ok' | 'error', text: string) => {
    const id = ++seq.current
    setToasts(t => [...t, { id, kind, text }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), kind === 'error' ? 7000 : 4500)
  }, [])
  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>(resolve => setDlg({ ...o, resolve })), [])
  const close = (v: boolean) => { dlg?.resolve(v); setDlg(null) }
  return (
    <Ctx.Provider value={{ toast, confirm }}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
            <span style={{ color: t.kind === 'ok' ? 'var(--ok)' : 'var(--danger)' }}><Icon name={t.kind === 'ok' ? 'check' : 'alert'} /></span>
            <div>{t.text}</div><button className="x" aria-label="Dismiss" onClick={() => dismiss(t.id)}>×</button>
          </div>
        ))}
      </div>
      {dlg && (
        <Modal title={dlg.title} size="sm" onClose={() => close(false)} footer={<>
          <Button variant="secondary" onClick={() => close(false)}>Keep it</Button>
          <Button variant={dlg.danger ? 'danger' : undefined} data-autofocus onClick={() => close(true)}>{dlg.confirmLabel ?? 'Confirm'}</Button>
        </>}><p>{dlg.message}</p></Modal>
      )}
    </Ctx.Provider>
  )
}
