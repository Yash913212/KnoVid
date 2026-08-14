import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AuthShell, { AuthField } from '../components/AuthShell'

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await register(email, password, name)
      navigate('/app')
    } catch (err: any) {
      setError(err.message || err.response?.data?.error || 'Registration failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      mode="register"
      eyebrow="Build your library"
      title="Start thinking"
      subtitle="Create your account and begin extracting transcripts, speakers, and graphs from every video."
      error={error}
      submitLabel="Create account"
      busy={busy}
      onSubmit={handleSubmit}
      footer={
        <>
          Already have an account?{' '}
          <Link
            to="/login"
            className="font-semibold text-[#4555C4] hover:text-[#586BE3] hover:underline dark:text-[#B8C1FF] dark:hover:text-[#8793F2]"
          >
            Sign in
          </Link>
        </>
      }
    >
      <AuthField
        label="Name"
        type="text"
        value={name}
        onChange={setName}
        placeholder="Ada Lovelace"
        autoComplete="name"
      />
      <AuthField
        label="Email"
        type="email"
        value={email}
        onChange={setEmail}
        placeholder="you@example.com"
        autoComplete="email"
      />
      <AuthField
        label="Password"
        type="password"
        value={password}
        onChange={setPassword}
        placeholder="Create a password"
        autoComplete="new-password"
      />
    </AuthShell>
  )
}
