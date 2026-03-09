import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { Eye, EyeOff, ArrowRight } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid credentials. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--off-white)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem'
    }}>
      {/* Background decoration */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        overflow: 'hidden', pointerEvents: 'none', zIndex: 0
      }}>
        <div style={{
          position: 'absolute', top: -120, right: -120,
          width: 500, height: 500,
          background: 'radial-gradient(circle, rgba(232,98,26,0.08) 0%, transparent 70%)',
          borderRadius: '50%'
        }} />
        <div style={{
          position: 'absolute', bottom: -80, left: -80,
          width: 400, height: 400,
          background: 'radial-gradient(circle, rgba(232,98,26,0.05) 0%, transparent 70%)',
          borderRadius: '50%'
        }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 420 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 56, height: 56,
            background: 'var(--orange)',
            borderRadius: 16,
            marginBottom: '1rem',
            boxShadow: 'var(--shadow-orange)'
          }}>
            <span style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 800, color: 'white', fontSize: 20
            }}>aL</span>
          </div>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 28, fontWeight: 700,
            color: 'var(--grey-900)',
            letterSpacing: '-0.5px',
            marginBottom: 6
          }}>
            Welcome to a<span style={{ color: 'var(--orange)' }}>Lister</span>
          </h1>
          <p style={{ color: 'var(--grey-500)', fontSize: 14 }}>
            Sign in to your enterprise portal
          </p>
        </div>

        {/* Card */}
        <div className="card" style={{ padding: '2rem' }}>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1.25rem' }}>
              <label className="label">Email address</label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                autoFocus
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label className="label">Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  className="input"
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  style={{ paddingRight: 42 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  style={{
                    position: 'absolute', right: 12, top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none', border: 'none',
                    color: 'var(--grey-400)', cursor: 'pointer',
                    display: 'flex', padding: 0
                  }}
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div style={{
                background: 'var(--error-bg)', border: '1px solid #fecaca',
                borderRadius: 'var(--radius-md)', padding: '10px 14px',
                fontSize: 13, color: 'var(--error)', marginBottom: '1.25rem'
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary btn-lg"
              disabled={loading}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {loading
                ? <span className="spinner" />
                : <><span>Sign in</span><ArrowRight size={16} /></>
              }
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: 12, color: 'var(--grey-400)' }}>
          aLister Enterprise · Alaiy Technovation · Confidential
        </p>
      </div>
    </div>
  )
}
