import { useState } from 'react'
import axios from 'axios'
import Navbar from '../components/Navbar.jsx'
import CopyButton from '../components/CopyButton.jsx'
import { useAuth } from '../hooks/useAuth.jsx'
import {
  Search, Link, Tag, ExternalLink, ChevronDown, ChevronUp,
  Package, AlertCircle, CheckCircle, Loader, Upload, Image
} from 'lucide-react'

const STEPS = ['Searching platforms', 'Analysing listings', 'Ranking results']
// Step interval loops so the indicator never freezes on long requests
const STEP_INTERVAL_MS = 2500

function ResultCard({ result, index, onDetailLoaded, onUnavailable }) {
  const [expanded, setExpanded] = useState(false)
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [hidden, setHidden] = useState(false)

  const fetchDetail = async () => {
    if (detail) { setExpanded(!expanded); return }
    setExpanded(true)
    setLoading(true)
    setError('')
    try {
      const res = await axios.post('/api/aggregator/detail', { url: result.url }, { withCredentials: true })
      if (res.data.listing?.status === 'unavailable') {
        setHidden(true)
        if (onUnavailable) onUnavailable(result.url)
        return
      }
      setDetail(res.data.listing)
      if (onDetailLoaded) onDetailLoaded()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch listing details.')
    } finally {
      setLoading(false)
    }
  }

  if (hidden) return null

  const copyAll = () => {
    if (!detail) return
    const priceStr = detail.priceSellingDisplay || detail.price
    const text = [
      `Platform: ${detail.platform}`,
      `URL: ${detail.url}`,
      detail.title && `Title: ${detail.title}`,
      detail.brand && `Brand: ${detail.brand}`,
      priceStr && `Price: ${priceStr}`,
      detail.description && `\nDescription:\n${detail.description}`,
      Object.keys(detail.specs || {}).length > 0 && `\nSpecifications:\n${Object.entries(detail.specs).map(([k, v]) => `${k}: ${v}`).join('\n')}`
    ].filter(Boolean).join('\n')
    navigator.clipboard.writeText(text)
  }

  return (
    <div className="card fade-in" style={{ overflow: 'hidden', marginBottom: '1rem' }}>
      {/* Header row */}
      <div
        style={{
          padding: '1.25rem 1.5rem',
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          background: expanded ? 'var(--grey-50)' : 'white'
        }}
        onClick={fetchDetail}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1, minWidth: 0 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'var(--orange-faint)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-display)', fontWeight: 700,
            fontSize: 13, color: 'var(--orange)', flexShrink: 0
          }}>
            {index + 1}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--orange)' }}>
                {result.platform}
              </span>
              {result.platform === 'The Solist' && (
                <span className="badge badge-orange">Source</span>
              )}
              {result.relevanceTier && result.platform !== 'The Solist' && (
                <span className={`badge badge-${result.relevanceTier === 'exact' ? 'orange' : 'grey'}`}>
                  {result.relevanceTier === 'exact' ? 'Exact match' : result.relevanceTier === 'strong' ? 'Strong match' : result.relevanceTier === 'partial' ? 'Partial match' : 'Weak match'}
                </span>
              )}
            </div>
            <p style={{
              fontSize: 14, fontWeight: 500, color: 'var(--grey-800)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
            }}>
              {result.title || result.snippet || result.url}
            </p>
            <p style={{ fontSize: 12, color: 'var(--grey-400)', marginTop: 2 }}>
              {result.domain}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0, marginLeft: '1rem' }}>
          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost btn-sm"
            onClick={e => e.stopPropagation()}
          >
            <ExternalLink size={13} />
          </a>
          {expanded ? <ChevronUp size={16} color="var(--grey-400)" /> : <ChevronDown size={16} color="var(--grey-400)" />}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--grey-100)' }}>
          {loading && (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--grey-400)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <Loader size={16} className="spin" style={{ animation: 'spin 0.7s linear infinite' }} />
                <span style={{ fontSize: 14 }}>Fetching full listing...</span>
              </div>
            </div>
          )}

          {error && (
            <div style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: 10, color: 'var(--error)' }}>
              <AlertCircle size={16} />
              <span style={{ fontSize: 14 }}>{error}</span>
            </div>
          )}

          {detail && (
            <div style={{ padding: '1.5rem' }}>
              {/* Unavailable page warning */}
              {detail.status === 'unavailable' && (
                <div style={{
                  padding: '1.5rem',
                  background: '#FEF3C7',
                  border: '1px solid #F59E0B',
                  borderRadius: 8,
                  marginBottom: '1.5rem',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '1rem'
                }}>
                  <AlertCircle size={20} style={{ color: '#F59E0B', flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#92400E', marginBottom: 4 }}>
                      Page Unavailable
                    </p>
                    <p style={{ fontSize: 13, color: '#78350F' }}>
                      {detail.reason || 'This product listing is no longer available or has been removed.'}
                    </p>
                    <p style={{ fontSize: 12, color: '#78350F', marginTop: 8 }}>
                      The product may have been sold, removed by the seller, or the page may have moved.
                    </p>
                  </div>
                </div>
              )}

              {/* Show content only if page is available */}
              {detail.status !== 'unavailable' && (
                <>
              {/* Images */}
              {detail.images?.length > 0 && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <p className="label" style={{ marginBottom: '0.75rem' }}>Images</p>
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    {detail.images.slice(0, 5).map((img, i) => {
                      const src = typeof img === 'string' ? img : img?.url
                      if (!src) return null
                      return (
                        <a key={i} href={src} target="_blank" rel="noopener noreferrer">
                          <img
                            src={src}
                            alt={typeof img === 'object' ? img.alt : ''}
                            style={{
                              width: 80, height: 80,
                              objectFit: 'cover',
                              borderRadius: 8,
                              border: '1px solid var(--grey-100)'
                            }}
                            onError={e => e.target.style.display = 'none'}
                          />
                        </a>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Price block */}
              {(detail.priceSellingDisplay || detail.price) && (
                <div style={{
                  padding: '0.75rem 0',
                  borderBottom: '1px solid var(--grey-50)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  flexWrap: 'wrap'
                }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--grey-400)', width: 90, flexShrink: 0 }}>
                    PRICE
                  </span>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--grey-900)' }}>
                      {detail.priceSellingDisplay || detail.price}
                    </span>
                    {detail.priceMrpDisplay && (
                      <span style={{ fontSize: 14, color: 'var(--grey-400)', textDecoration: 'line-through' }}>
                        Was {detail.priceMrpDisplay}
                      </span>
                    )}
                    {detail.discountPercent != null && detail.discountPercent > 0 && (
                      <span style={{
                        fontSize: 11, fontWeight: 600,
                        background: 'var(--success)', color: 'white',
                        padding: '2px 6px', borderRadius: 4
                      }}>
                        {detail.discountPercent}% off
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Fields */}
              {[
                { label: 'Title', value: detail.title },
                { label: 'Brand', value: detail.brand },
                { label: 'Rating', value: detail.rating ? `${detail.rating} / 5${detail.reviewCount ? ` (${detail.reviewCount} reviews)` : ''}` : null },
                { label: 'Description', value: detail.description, multiline: true }
              ].map(({ label, value, multiline }) => value ? (
                <div key={label} style={{
                  display: 'flex', gap: '1rem',
                  alignItems: multiline ? 'flex-start' : 'center',
                  padding: '0.75rem 0',
                  borderBottom: '1px solid var(--grey-50)'
                }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--grey-400)', width: 90, flexShrink: 0, paddingTop: multiline ? 2 : 0 }}>
                    {label.toUpperCase()}
                  </span>
                  <span style={{
                    fontSize: 14, color: 'var(--grey-700)',
                    flex: 1,
                    whiteSpace: multiline ? 'pre-wrap' : 'normal',
                    maxHeight: multiline ? 120 : 'none',
                    overflow: multiline ? 'auto' : 'visible'
                  }}>
                    {value}
                  </span>
                  <CopyButton text={value} />
                </div>
              ) : null)}

              {/* Specs with source attribution */}
              {Object.keys(detail.specs || {}).length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                  <p className="label">Specifications</p>
                  {Object.entries(detail.specs).slice(0, 10).map(([k, v]) => {
                    const source = detail.specSources?.[k];
                    return (
                      <div key={k} style={{
                        display: 'flex', gap: '1rem', alignItems: 'center',
                        padding: '0.5rem 0', borderBottom: '1px solid var(--grey-50)'
                      }}>
                        <span style={{ fontSize: 12, color: 'var(--grey-400)', width: 90, flexShrink: 0 }}>
                          {k}
                        </span>
                        <span style={{ fontSize: 14, color: 'var(--grey-700)', flex: 1 }}>{v}</span>
                        {source && (
                          <span style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: 'var(--orange)',
                            background: 'var(--orange-faint)',
                            padding: '2px 6px',
                            borderRadius: 4,
                            flexShrink: 0
                          }}>
                            {source.platform}
                          </span>
                        )}
                        <CopyButton text={v} />
                      </div>
                    );
                  })}
                </div>
              )}

              {Object.keys(detail.specs || {}).length === 0 && (
                <div style={{ marginTop: '1rem', padding: '1.5rem', textAlign: 'center', color: 'var(--grey-400)' }}>
                  <p style={{ fontSize: 14 }}>No specifications available</p>
                </div>
              )}

              {/* Copy All */}
              <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary btn-sm" onClick={copyAll}>
                  <CheckCircle size={14} />
                  Copy All Fields
                </button>
              </div>
              </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function AggregatorPage() {
  const { deductCredit } = useAuth()
  const [mode, setMode] = useState('url') // 'url' or 'manual' or 'image'
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
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file')
      return
    }
    
    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be less than 5MB')
      return
    }
    
    setImage(file)
    setError('')
    
    // Create preview
    const reader = new FileReader()
    reader.onloadend = () => {
      setImagePreview(reader.result)
    }
    reader.readAsDataURL(file)
  }

  const handleSearch = async () => {
    setError('')
    setResults(null)
    setLoading(true)
    setStep(0)

    // Loop the step indicator so it never freezes on long requests
    const stepInterval = setInterval(() => {
      setStep(s => (s + 1) % STEPS.length)
    }, STEP_INTERVAL_MS)

    try {
      let payload
      
      if (mode === 'url') {
        payload = { url }
      } else {
        // Upload image first
        if (!image) {
          throw new Error('Please select an image')
        }
        
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
      
      const res = await axios.post('/api/aggregator/search', payload, { withCredentials: true })
      setResults(res.data)
      deductCredit()
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Something went wrong. Please try again.')
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
      <div className="container" style={{ padding: '2.5rem 2rem', maxWidth: 900 }}>

        {/* Header */}
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 28, fontWeight: 700,
            color: 'var(--grey-900)', letterSpacing: '-0.5px',
            marginBottom: 8
          }}>
            Listing Aggregator
          </h1>
          <p style={{ fontSize: 15, color: 'var(--grey-500)' }}>
            Find where your product is listed across luxury fashion platforms worldwide.
          </p>
        </div>

        {/* Input card */}
        <div className="card" style={{ padding: '1.75rem', marginBottom: '1.5rem' }}>
          {/* Mode toggle */}
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
              <label className="label">Product URL (thesolist.com)</label>
              <input
                className="input"
                type="url"
                value={url}
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
                  <input
                    className="input"
                    value={brand}
                    onChange={e => setBrand(e.target.value)}
                    placeholder="e.g. Patek Philippe"
                  />
                </div>
                <div>
                  <label className="label">Model Name *</label>
                  <input
                    className="input"
                    value={model}
                    onChange={e => setModel(e.target.value)}
                    placeholder="e.g. Nautilus"
                  />
                </div>
              </div>
              
              <div>
                <label className="label">Product Image *</label>
                <div style={{
                  border: '2px dashed var(--grey-200)',
                  borderRadius: 8,
                  padding: '2rem',
                  textAlign: 'center',
                  background: imagePreview ? 'var(--grey-50)' : 'white',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onClick={() => document.getElementById('image-upload').click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const file = e.dataTransfer.files[0]
                  if (file) {
                    const fakeEvent = { target: { files: [file] } }
                    handleImageSelect(fakeEvent)
                  }
                }}
                >
                  <input
                    id="image-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleImageSelect}
                    style={{ display: 'none' }}
                  />
                  
                  {imagePreview ? (
                    <div>
                      <img
                        src={imagePreview}
                        alt="Preview"
                        style={{
                          maxWidth: '100%',
                          maxHeight: 200,
                          borderRadius: 8,
                          marginBottom: '1rem'
                        }}
                      />
                      <p style={{ fontSize: 13, color: 'var(--grey-500)' }}>
                        Click to change image
                      </p>
                    </div>
                  ) : (
                    <div>
                      <Upload size={32} style={{ color: 'var(--grey-300)', margin: '0 auto 1rem' }} />
                      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--grey-700)', marginBottom: 4 }}>
                        Click to upload or drag and drop
                      </p>
                      <p style={{ fontSize: 12, color: 'var(--grey-400)' }}>
                        PNG, JPG, WEBP up to 5MB
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              className="btn btn-primary"
              onClick={handleSearch}
              disabled={loading || !canSearch}
              style={{ minWidth: 140, justifyContent: 'center' }}
            >
              {loading ? <span className="spinner" /> : <Search size={15} />}
              {uploadingImage ? 'Uploading...' : loading ? 'Searching...' : 'Search Platforms'}
            </button>
          </div>
        </div>

        {/* Loading steps */}
        {loading && (
          <div className="card fade-in" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
              {STEPS.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {i < step ? (
                    <CheckCircle size={16} style={{ color: 'var(--success)' }} />
                  ) : i === step ? (
                    <span className="spinner spinner-orange" />
                  ) : (
                    <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--grey-200)' }} />
                  )}
                  <span style={{
                    fontSize: 13, fontWeight: i === step ? 600 : 400,
                    color: i <= step ? 'var(--grey-700)' : 'var(--grey-400)'
                  }}>{s}</span>
                  {i < STEPS.length - 1 && (
                    <div style={{ width: 24, height: 1, background: 'var(--grey-200)', marginLeft: 4 }} />
                  )}
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
                  {results.results.length} listings found
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, color: 'var(--grey-400)' }}>Searched for:</span>
                  <span style={{
                    fontSize: 12, fontWeight: 600, color: 'var(--grey-700)',
                    background: 'var(--grey-200)', padding: '3px 8px', borderRadius: 4,
                    letterSpacing: '0.3px', fontFamily: 'monospace'
                  }}>
                    {results.query.searchQuery || [results.query.brand, results.query.model, results.query.sku].filter(Boolean).join(' ') || 'your product'}
                  </span>
                </div>
              </div>
            </div>

            {results.results.length === 0 ? (
              <div className="card" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--grey-400)' }}>
                <Package size={32} style={{ margin: '0 auto 1rem', color: 'var(--grey-300)' }} />
                <p style={{ fontSize: 15, fontWeight: 500 }}>No listings found on tracked platforms.</p>
                <p style={{ fontSize: 13, marginTop: 6 }}>Try a different brand, model name, or URL.</p>
              </div>
            ) : (
              results.results.map((r, i) => (
                <ResultCard key={r.url + i} result={r} index={i} onDetailLoaded={deductCredit} onUnavailable={() => {}} />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
