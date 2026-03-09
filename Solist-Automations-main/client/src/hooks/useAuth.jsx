import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import axios from 'axios'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [credits, setCredits] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    axios.get('/api/auth/me', { withCredentials: true })
      .then(res => {
        setUser(res.data.user)
        setCredits(res.data.credits)
      })
      .catch(() => {
        setUser(null)
        setCredits(null)
      })
      .finally(() => setLoading(false))
  }, [])

  const login = async (email, password) => {
    const res = await axios.post('/api/auth/login', { email, password }, { withCredentials: true })
    setUser(res.data.user)
    setCredits(res.data.credits)
    return res.data
  }

  const logout = async () => {
    await axios.post('/api/auth/logout', {}, { withCredentials: true })
    setUser(null)
    setCredits(null)
  }

  /**
   * Deduct one credit from the server session and update local state.
   * Call this after any successful operation.
   */
  const deductCredit = useCallback(async () => {
    try {
      const res = await axios.post('/api/auth/deduct', {}, { withCredentials: true })
      setCredits(res.data.credits)
    } catch {
      // Non-critical — just update locally optimistically
      setCredits(c => (c !== null && c > 0 ? c - 1 : 0))
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, credits, loading, login, logout, deductCredit }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
