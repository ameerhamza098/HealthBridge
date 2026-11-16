import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, hasToken, setToken, type User } from './api'

interface Ctx { user: User | null; loading: boolean; login(e: string, p: string): Promise<void>; register(n: string, e: string, p: string): Promise<void>; logout(): Promise<void> }
const AuthCtx = createContext<Ctx>(null!)
export const useAuth = () => useContext(AuthCtx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(hasToken())

  useEffect(() => {
    if (hasToken()) api<User>('/me').then(setUser).catch(() => setToken(null)).finally(() => setLoading(false))
    const expired = () => setUser(null)
    window.addEventListener('auth-expired', expired)
    return () => window.removeEventListener('auth-expired', expired)
  }, [])

  const accept = (r: { token: string; user: User }) => { setToken(r.token); setUser(r.user) }
  return (
    <AuthCtx.Provider value={{
      user, loading,
      login: async (email, password) => accept(await api('/auth/login', { method: 'POST', body: { email, password } })),
      register: async (name, email, password) => accept(await api('/auth/register', { method: 'POST', body: { name, email, password } })),
      logout: async () => { try { await api('/auth/logout', { method: 'POST' }) } finally { setToken(null); setUser(null) } },
    }}>{children}</AuthCtx.Provider>
  )
}
