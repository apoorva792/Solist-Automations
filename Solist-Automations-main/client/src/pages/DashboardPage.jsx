import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import Navbar from '../components/Navbar.jsx'
import { Search, TrendingUp, ShoppingBag, ArrowRight, Zap } from 'lucide-react'

const MODULES = [
  {
    id: 'aggregator',
    path: '/aggregator',
    icon: Search,
    title: 'Listing Aggregator',
    tagline: 'See how your product is listed across the web — in one place',
    description: 'Paste a thesolist.com link or enter a brand + model to instantly find all listings across luxury fashion platforms worldwide.',
    color: '#E8621A',
    gradient: 'linear-gradient(135deg, #FFF3EC 0%, #FFE8D6 100%)',
    stats: 'Searches 25+ platforms'
  },
  {
    id: 'price',
    path: '/price',
    icon: TrendingUp,
    title: 'Price Tracker',
    tagline: 'Track your exact SKU\'s price across regions and platforms',
    description: 'Enter a brand and model to instantly compare prices across all major luxury resale and retail sites. Highlights the most competitive price.',
    color: '#16a34a',
    gradient: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
    stats: 'Multi-region pricing'
  },
  {
    id: 'shopify',
    path: '/shopify',
    icon: ShoppingBag,
    title: 'Shopify Generator',
    tagline: 'Turn a brand + model name into a complete Shopify listing',
    description: 'AI-powered listing generation. Input brand and model — get a complete, SEO-optimised Shopify product listing ready to copy-paste.',
    color: '#7c3aed',
    gradient: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
    stats: 'AI-enriched with web research'
  }
]

export default function DashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  return (
    <div style={{ minHeight: '100vh', background: 'var(--off-white)' }}>
      <Navbar />

      <div className="container" style={{ padding: '3rem 2rem' }}>
        {/* Welcome header */}
        <div style={{ marginBottom: '3rem' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'var(--orange-faint)', border: '1px solid var(--orange-subtle)',
            borderRadius: 999, padding: '4px 14px',
            marginBottom: '1rem'
          }}>
            <Zap size={13} style={{ color: 'var(--orange)' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--orange)' }}>
              Enterprise Intelligence Portal
            </span>
          </div>

          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 36, fontWeight: 700,
            color: 'var(--grey-900)',
            letterSpacing: '-0.8px',
            marginBottom: '0.5rem',
            lineHeight: 1.2
          }}>
            Welcome back, {user?.name?.split(' ')[0] || 'there'} 👋
          </h1>
          <p style={{ fontSize: 16, color: 'var(--grey-500)', maxWidth: 500 }}>
            {user?.company} · Choose a module below to get started.
          </p>
        </div>

        {/* Module cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: '1.5rem',
          maxWidth: 1100
        }}>
          {MODULES.map(mod => {
            const Icon = mod.icon
            return (
              <div
                key={mod.id}
                className="card"
                style={{
                  padding: '2rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  position: 'relative',
                  overflow: 'hidden'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-4px)'
                  e.currentTarget.style.boxShadow = 'var(--shadow-lg)'
                  e.currentTarget.style.borderColor = mod.color + '30'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.boxShadow = 'var(--shadow-sm)'
                  e.currentTarget.style.borderColor = 'var(--grey-100)'
                }}
                onClick={() => navigate(mod.path)}
              >
                {/* Background accent */}
                <div style={{
                  position: 'absolute', top: 0, right: 0,
                  width: 120, height: 120,
                  background: mod.gradient,
                  borderRadius: '0 16px 0 60%',
                  opacity: 0.6
                }} />

                {/* Icon */}
                <div style={{
                  width: 48, height: 48,
                  background: mod.gradient,
                  borderRadius: 14,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: '1.25rem',
                  position: 'relative'
                }}>
                  <Icon size={22} style={{ color: mod.color }} />
                </div>

                <h2 style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 20, fontWeight: 700,
                  color: 'var(--grey-900)',
                  marginBottom: '0.5rem',
                  letterSpacing: '-0.3px'
                }}>
                  {mod.title}
                </h2>

                <p style={{
                  fontSize: 13, fontWeight: 500,
                  color: mod.color,
                  marginBottom: '0.75rem'
                }}>
                  {mod.tagline}
                </p>

                <p style={{
                  fontSize: 14, color: 'var(--grey-500)',
                  lineHeight: 1.6, marginBottom: '1.5rem'
                }}>
                  {mod.description}
                </p>

                <div style={{
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <span style={{
                    fontSize: 12, color: 'var(--grey-400)',
                    fontWeight: 500
                  }}>
                    {mod.stats}
                  </span>
                  <button
                    className="btn btn-primary btn-sm"
                    style={{ background: mod.color, boxShadow: 'none' }}
                  >
                    Try Now <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer hint */}
        <div style={{
          marginTop: '3rem', paddingTop: '2rem',
          borderTop: '1px solid var(--grey-100)',
          display: 'flex', alignItems: 'center', gap: '0.75rem'
        }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: 'var(--success)', flexShrink: 0
          }} />
          <p style={{ fontSize: 13, color: 'var(--grey-400)' }}>
            All modules are powered by Bright Data web intelligence + Claude AI. Results are fetched live.
          </p>
        </div>
      </div>
    </div>
  )
}
