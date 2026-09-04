import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { getLlmStatus, verifyOpenRouterKey, saveOpenRouterKey, type LlmStatus } from '../api/llm'
import { useToast } from './Toast'

interface Props {
  isOpen: boolean
  onClose: () => void
  onUpdated?: () => void
}

const POPULAR_MODELS = [
  { id: 'nvidia/nemotron-3.5-lightning:free', name: 'Nvidia Nemotron 3.5 (Free)', desc: 'Fast, free tier, no credits required' },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (Free)', desc: 'High intelligence open model, free tier' },
  { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash', desc: 'Ultra-fast multimodal, exceptional reasoning' },
  { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1 (Free)', desc: 'Advanced step-by-step reasoning, free tier' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', desc: 'Standard fast lightweight model' },
]

export default function OpenRouterModal({ isOpen, onClose, onUpdated }: Props) {
  const [status, setStatus] = useState<LlmStatus | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [selectedModel, setSelectedModel] = useState('nvidia/nemotron-3.5-lightning:free')
  const [showKey, setShowKey] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [saving, setSaving] = useState(false)
  const [verifyResult, setVerifyResult] = useState<{ valid: boolean; text: string } | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    if (isOpen) {
      getLlmStatus()
        .then((s) => {
          setStatus(s)
          if (s.model) setSelectedModel(s.model)
        })
        .catch(() => undefined)
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleTest = async () => {
    const keyToTest = apiKey.trim() || undefined
    setVerifying(true)
    setVerifyResult(null)
    try {
      const res = await verifyOpenRouterKey(keyToTest || '')
      if (res.valid) {
        setVerifyResult({ valid: true, text: `Key verified! ${res.label || 'Active'} (Limit: ${res.limit ?? 'None'})` })
        toast('OpenRouter API key verified successfully!', 'success')
      } else {
        setVerifyResult({ valid: false, text: res.error || 'Verification failed. Please check key.' })
        toast('Key verification failed', 'error')
      }
    } catch (e: any) {
      setVerifyResult({ valid: false, text: e.message || 'Could not verify key' })
      toast('Verification error', 'error')
    } finally {
      setVerifying(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveOpenRouterKey(apiKey.trim(), selectedModel)
      toast('OpenRouter configuration saved!', 'success')
      const updated = await getLlmStatus()
      setStatus(updated)
      setApiKey('')
      onUpdated?.()
      onClose()
    } catch (e: any) {
      toast(e.message || 'Failed to save configuration', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-white/15 bg-stone-950/90 p-6 text-stone-100 shadow-[0_0_80px_rgba(43,166,160,0.25)] backdrop-blur-2xl"
        >
          {/* Header glow */}
          <div className="pointer-events-none absolute -top-24 -left-24 h-48 w-48 rounded-full bg-[#2BA6A0]/20 blur-3xl" />
          <div className="pointer-events-none absolute -top-24 -right-24 h-48 w-48 rounded-full bg-[#C17EF9]/20 blur-3xl" />

          <div className="flex items-center justify-between pb-4 border-b border-white/10">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-[#2BA6A0] to-[#C17EF9] text-white shadow-[0_0_16px_rgba(193,126,249,0.5)]">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m13 2-2 2.5h3L11 8" />
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </span>
              <div>
                <h3 className="font-display text-base font-bold tracking-tight text-white">OpenRouter AI Integration</h3>
                <p className="text-xs text-stone-400">Power universal URL analysis, documents, notes, & chat</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1.5 text-stone-400 hover:bg-white/10 hover:text-white transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>

          {/* Current Status Badge */}
          <div className="mt-4 flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] p-3.5">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-2.5 w-2.5">
                {status?.has_openrouter_key ? (
                  <>
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#2BA6A0] opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#2BA6A0]" />
                  </>
                ) : (
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-400" />
                )}
              </span>
              <span className="text-xs font-medium text-stone-200">
                {status?.has_openrouter_key ? (
                  <>Connected <span className="font-mono text-stone-400">({status.masked_key})</span></>
                ) : (
                  'No key active — using template fallback'
                )}
              </span>
            </div>
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 font-mono text-[10px] text-[#73CEC2]">
              {status?.model || 'nvidia/nemotron-3.5-lightning:free'}
            </span>
          </div>

          {/* API Key Input */}
          <div className="mt-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label className="font-medium text-stone-300">OpenRouter API Key</label>
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noreferrer"
                className="text-[#73CEC2] hover:underline flex items-center gap-1"
              >
                Get free key ↗
              </a>
            </div>
            <div className="relative flex items-center">
              <input
                type={showKey ? 'text' : 'password'}
                placeholder={status?.has_openrouter_key ? 'Enter new key to replace active key...' : 'sk-or-v1-...'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-black/50 py-2.5 pl-3.5 pr-20 text-xs font-mono text-stone-100 placeholder:text-stone-500 focus:border-[#2BA6A0] focus:outline-none focus:ring-1 focus:ring-[#2BA6A0]"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 px-2 py-1 text-[11px] text-stone-400 hover:text-stone-200"
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {/* Model Selector */}
          <div className="mt-4 space-y-1.5">
            <label className="text-xs font-medium text-stone-300">AI Model</label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full rounded-xl border border-white/15 bg-black/50 py-2.5 px-3 text-xs text-stone-100 focus:border-[#2BA6A0] focus:outline-none focus:ring-1 focus:ring-[#2BA6A0]"
            >
              {POPULAR_MODELS.map((m) => (
                <option key={m.id} value={m.id} className="bg-stone-900 text-stone-100">
                  {m.name} — {m.desc}
                </option>
              ))}
            </select>
          </div>

          {/* Verification feedback */}
          {verifyResult && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className={`mt-3 rounded-xl p-2.5 text-xs ${
                verifyResult.valid
                  ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border border-rose-500/30 bg-rose-500/10 text-rose-300'
              }`}
            >
              {verifyResult.text}
            </motion.div>
          )}

          {/* Actions */}
          <div className="mt-6 flex items-center justify-end gap-2.5 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={handleTest}
              disabled={verifying}
              className="rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2 text-xs font-semibold text-stone-200 hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              {verifying ? 'Verifying…' : 'Test Connection'}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-xl bg-gradient-to-r from-[#2BA6A0] to-[#C17EF9] px-5 py-2 text-xs font-semibold text-white shadow-[0_0_20px_rgba(193,126,249,0.35)] hover:opacity-95 transition-opacity disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save & Activate'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
