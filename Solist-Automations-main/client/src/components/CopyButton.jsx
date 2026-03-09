import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

export default function CopyButton({ text, label = '', size = 'sm', variant = 'ghost' }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      console.error('Copy failed', e)
    }
  }

  return (
    <button
      className={`btn btn-${variant} btn-${size}`}
      onClick={handleCopy}
      title="Copy to clipboard"
      style={copied ? { color: 'var(--success)' } : {}}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {label && <span>{copied ? 'Copied!' : label}</span>}
    </button>
  )
}
