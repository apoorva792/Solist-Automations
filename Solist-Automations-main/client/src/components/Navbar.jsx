import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { LogOut, ChevronLeft, Zap } from 'lucide-react'

const MODULE_NAMES = {
  '/aggregator': 'Listing Aggregator',
  '/price': 'Price Tracker',
  '/shopify': 'Shopify Generator'
}

export default function Navbar() {
  const { user, credits, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const isModule = location.pathname !== '/'
  const moduleName = MODULE_NAMES[location.pathname]

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const creditsExhausted = credits !== null && credits <= 0
  const creditsLow = credits !== null && credits > 0 && credits <= 10

  return (
    <nav style={{
      background: 'white',
      borderBottom: '1px solid var(--grey-100)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
      boxShadow: 'var(--shadow-sm)'
    }}>
      <div style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '0 2rem',
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        {/* Left: Logo + breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {isModule && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => navigate('/')}
              style={{ padding: '6px 8px' }}
            >
              <ChevronLeft size={18} />
            </button>
          )}
          <div
            style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
            onClick={() => navigate('/')}
          >
            <div style={{
              width: 36, height: 36,
              background: 'var(--orange)',
              borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <span style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 800,
                color: 'white',
                fontSize: 15,
                letterSpacing: '-0.5px'
              }}>aL</span>
            </div>
            <span style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: 18,
              color: 'var(--grey-900)',
              letterSpacing: '-0.3px'
            }}>
              a<span style={{ color: 'var(--orange)' }}>Lister</span>
            </span>
          </div>

          {isModule && moduleName && (
            <>
              <span style={{ color: 'var(--grey-300)', fontSize: 18 }}>/</span>
              <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--grey-600)' }}>
                {moduleName}
              </span>
            </>
          )}
        </div>

        {/* Right: Credits + User + logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>

          {/* Credits badge */}
          {credits !== null && (
            creditsExhausted ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: '#fef2f2', border: '1px solid #fecaca',
                borderRadius: 999, padding: '5px 14px',
                fontSize: 12, fontWeight: 600, color: 'var(--error)'
              }}>
                <Zap size={12} />
                No credits — <span style={{ textDecoration: 'underline', cursor: 'pointer' }}>Talk to us</span>
              </div>
            ) : (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: creditsLow ? '#fffbeb' : 'var(--orange-faint)',
                border: `1px solid ${creditsLow ? '#fde68a' : 'var(--orange-subtle)'}`,
                borderRadius: 999, padding: '5px 14px',
                cursor: 'default'
              }}>
                <Zap size={12} style={{ color: creditsLow ? 'var(--warning)' : 'var(--orange)' }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: creditsLow ? 'var(--warning)' : 'var(--orange)' }}>
                  {credits}
                </span>
                <span style={{ fontSize: 11, color: creditsLow ? '#92400e' : 'var(--orange-dark)', fontWeight: 500 }}>
                  credits
                </span>
              </div>
            )
          )}

          {user && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--grey-800)' }}>
                {user.name}
              </div>
              <div style={{ fontSize: 12, color: 'var(--grey-400)' }}>
                {user.company}
              </div>
            </div>
          )}
          <div style={{
            width: 36, height: 36,
            background: 'var(--orange-faint)',
            borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 14, color: 'var(--orange)'
          }}>
            {user?.name?.charAt(0) || 'U'}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={handleLogout}>
            <LogOut size={15} />
            Logout
          </button>
        </div>
      </div>
    </nav>
  )
}
