import { useState } from 'react'
import axios from 'axios'
import Navbar from '../components/Navbar.jsx'
import { useAuth } from '../hooks/useAuth.jsx'
import {
  TrendingUp, Search, ExternalLink, AlertCircle,
  CheckCircle, TrendingDown, Star, Package, Link, Upload, Image
} from 'lucide-react'

const STEPS = ['Searching platforms', 'Fetching prices', 'Comparing results']
const STEP_INTERVAL_MS = 2500

function PriceRow({ item, isLowest, isHighest, rank }) {
  const rowBg = isLowest ? 'rgba(22,163,74,0.04)' : isHighest ? 'rgba(217,119,6,0.04)' : 'white'
  const leftBorder = isLowest ? '3px solid var(--success)' : isHighest ? '3px solid var(--warning)' : '3px solid transparent'

  return (
    <tr className="fade-in" style={{ background: rowBg, borderLeft: leftBorder }}>
      <td style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--grey-400)', width: 20 }}>
            #{rank}
          </span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--grey-800)' }}>{item.platform}</div>
            <div style={{ fontSize: 12, color: 'var(--grey-400)' }}>{item.domain}</div>
          </div>
          {isLowest && <span className="badge badge-green"><TrendingDown size={10} /> Best Price</span>}
          {isHighest && <span className="badge badge-amber"><TrendingUp size={10} /> Highest</span>}
        </div>
      </td>
      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
        <span style={{ fontSize: 16 }}>{item.region?.flag || '🌍'}</span>
        <div style={{ fontSize: 12, color: 'var(--grey-500)', marginTop: 2 }}>{item.region?.label}</div>
      </td>
      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
        {item.formattedLocal ? (
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--grey-900)' }}>{item.formattedLocal}</div>
            {item.formattedUsd && item.localCurrency !== 'USD' && (
              <div style={{ fontSize: 12, color: 'var(--grey-400)' }}>≈ {item.formattedUsd}</div>
            )}
          </div>
        ) : (
          <span style={{ fontSize: 13, color: 'var(--grey-300)' }}>{item.error ? 'Error fetching' : 'Not found'}</span>
        )}
      </td>
      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
        {item.inStock === true ? (
          <span className="badge badge-green"><CheckCircle size={10} /> In Stock</span>
        ) : item.inStock === false ? (
          <span className="badge badge-grey">Out of Stock</span>
        ) : (
          <span style={{ color: 'var(--grey-300)', fontSize: 12 }}>—</span>
        )}
      </td>
      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
        {item.rating ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
            <Star size={12} style={{ color: '#f59e0b', fill: '#f59e0b' }} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>{item.rating.toFixed(1)}</span>
            {item.reviewCount && <span style={{ fontSize: 11, color: 'var(--grey-400)' }}>({item.reviewCount})</span>}
          </div>
        ) : (
          <span style={{ color: 'var(--grey-300)', fontSize: 12 }}>—</span>
        )}
      </td>
      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
        <a href={item.url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
          <ExternalLink size={13} />
        </a>
      </td>
    </tr>
  )
}

export default function PricePage() {
  const { deductCredit } = useAuth()
  const [mode, setMode] = useState('url')
  const [url, setUrl] = useState('')
  const [brand, setBrand] = useState('')
  const [model, setModel] = useState('')
  const [image, setImage] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState(0)
  const [results, setResults] = useState(null)
  const [error, setError] = useState('')

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('Please select an image file'); return }
    if (file.size > 5 * 1024 * 1024) { setError('Image must be less than 5MB'); return }
    setImage(file)
    setError('')
    const reader = new FileReader()
    reader.onloadend = () => setImagePreview(reader.result)
    reader.readAsDataURL(file)
  }

  const handleSearch = async () => {
    setError('')
    setResults(null)
    setLoading(true)
    setStep(0)
    const stepInterval = setInterval(() => setStep(s => (s + 1) % STEPS.length), STEP_INTERVAL_MS)

    try {
      let payload
      if (mode === 'url') {
        payload = { url }
      } else {
        if (!image) throw new Error('Please select an image')
        setUploadingImage(true)
        const formData = new FormData()
        formData.append('image', image)
        formData.append('brand', brand)
        formData.append('model', model)
        const uploadRes = await axios.post('/api/aggregator/upload-image', formData, {
          withCredentials: true,
          headers: { 'Content-Type': 'multipart/form-data' }
        })
        setUploadingImage(false)
        payload = { imageUrl: uploadRes.data.imageUrl, brand, model }
      }

      const res = await axios.post('/api/price/compare', payload, { withCredentials: true })
      setResults(res.data)
      deductCredit()
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Something went wrong.')
    } finally {
      clearInterval(stepInterval)
      setLoading(false)
      setUploadingImage(false)
      setStep(0)
    }
  }

  const canSearch = mode === 'url' ? url.trim() : (brand.trim() && model.trim() && image)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--off-white)' }}>
      <Navbar />
      <div className="container" style={{ padding: '2.5rem 2rem', maxWidth: 1000 }}>
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700,
            color: 'var(--grey-900)', letterSpacing: '-0.5px', marginBottom: 8
          }}>
            Price Tracker
          </h1>
          <p style={{ fontSize: 15, color: 'var(--grey-500)' }}>
            Compare prices across luxury fashion platforms worldwide.
          </p>
        </div>

        {/* Input card */}
        <div className="card" style={{ padding: '1.75rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            {[
              { id: 'url', icon: Link, label: 'Paste URL' },
              { id: 'image', icon: Image, label: 'Upload Image' }
            ].map(m => (
              <button
                key={m.id}
                className={`btn btn-${mode === m.id ? 'primary' : 'secondary'} btn-sm`}
                onClick={() => setMode(m.id)}
              >
                <m.icon size={13} /> {m.label}
              </button>
            ))}
          </div>

          {mode === 'url' ? (
            <div>
              <label className="label">Product URL</label>
              <input
                className="input" type="url" value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://thesolist.com/products/brand-model-name"
                onKeyDown={e => e.key === 'Enter' && canSearch && handleSearch()}
              />
            </div>
          ) : (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label className="label">Brand *</label>
                  <input className="input" value={brand} onChange={e => setBrand(e.target.value)} placeholder="e.g. Patek Philippe" />
                </div>
                <div>
                  <label className="label">Model Name *</label>
                  <input className="input" value={model} onChange={e => setModel(e.target.value)} placeholder="e.g. Nautilus" />
                </div>
              </div>
              <div>
                <label className="label">Product Image *</label>
                <div style={{
                  border: '2px dashed var(--grey-200)', borderRadius: 8, padding: '2rem',
                  textAlign: 'center', background: imagePreview ? 'var(--grey-50)' : 'white',
                  cursor: 'pointer', transition: 'all 0.2s'
                }}
                onClick={() => document.getElementById('price-image-upload').click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleImageSelect({ target: { files: [f] } }) }}
                >
                  <input id="price-image-upload" type="file" accept="image/*" onChange={handleImageSelect} style={{ display: 'none' }} />
                  {imagePreview ? (
                    <div>
                      <img src={imagePreview} alt="Preview" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8, marginBottom: '1rem' }} />
                      <p style={{ fontSize: 13, color: 'var(--grey-500)' }}>Click to change image</p>
                    </div>
                  ) : (
                    <div>
                      <Upload size={32} style={{ color: 'var(--grey-300)', margin: '0 auto 1rem' }} />
                      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--grey-700)', marginBottom: 4 }}>Click to upload or drag and drop</p>
                      <p style={{ fontSize: 12, color: 'var(--grey-400)' }}>PNG, JPG, WEBP up to 5MB</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" onClick={handleSearch} disabled={loading || !canSearch} style={{ minWidth: 140, justifyContent: 'center' }}>
              {loading ? <span className="spinner" /> : <Search size={15} />}
              {uploadingImage ? 'Uploading...' : loading ? 'Comparing...' : 'Compare Prices'}
            </button>
          </div>
        </div>

        {/* Loading steps */}
        {loading && (
          <div className="card fade-in" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
              {STEPS.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {i < step ? <CheckCircle size={16} style={{ color: 'var(--success)' }} />
                    : i === step ? <span className="spinner spinner-orange" />
                    : <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--grey-200)' }} />}
                  <span style={{ fontSize: 13, fontWeight: i === step ? 600 : 400, color: i <= step ? 'var(--grey-700)' : 'var(--grey-400)' }}>{s}</span>
                  {i < STEPS.length - 1 && <div style={{ width: 24, height: 1, background: 'var(--grey-200)', marginLeft: 4 }} />}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="card fade-in" style={{
            padding: '1.25rem', marginBottom: '1.5rem',
            border: '1px solid #fecaca', background: 'var(--error-bg)',
            display: 'flex', gap: 10, alignItems: 'center', color: 'var(--error)'
          }}>
            <AlertCircle size={16} />
            <span style={{ fontSize: 14 }}>{error}</span>
          </div>
        )}

        {/* Results */}
        {results && (
          <div className="fade-in">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--grey-800)', marginBottom: 6 }}>
                  {results.count} prices found
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, color: 'var(--grey-400)' }}>Searched for:</span>
                  <span style={{
                    fontSize: 12, fontWeight: 600, color: 'var(--grey-700)',
                    background: 'var(--grey-200)', padding: '3px 8px', borderRadius: 4,
                    letterSpacing: '0.3px', fontFamily: 'monospace'
                  }}>
                    {results.query?.searchQuery || 'your product'}
                  </span>
                </div>
              </div>
            </div>

            {results.prices?.length === 0 ? (
              <div className="card" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--grey-400)' }}>
                <Package size={32} style={{ margin: '0 auto 1rem', color: 'var(--grey-300)' }} />
                <p style={{ fontSize: 15, fontWeight: 500 }}>No prices found.</p>
                <p style={{ fontSize: 13, marginTop: 6 }}>Try a different URL or product.</p>
              </div>
            ) : (
              <div className="card" style={{ overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--grey-50)', borderBottom: '1px solid var(--grey-100)' }}>
                      {['Platform', 'Region', 'Price', 'Stock', 'Rating', ''].map(h => (
                        <th key={h} style={{
                          padding: '12px 16px', fontSize: 11, fontWeight: 700,
                          color: 'var(--grey-400)', textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          textAlign: h === 'Price' ? 'right' : h === '' ? 'center' : h === 'Platform' ? 'left' : 'center'
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.prices.map((item, i) => (
                      <PriceRow
                        key={item.url + i}
                        item={item}
                        rank={i + 1}
                        isLowest={item.url === results.lowestUrl}
                        isHighest={item.url === results.highestUrl && results.count > 1}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
