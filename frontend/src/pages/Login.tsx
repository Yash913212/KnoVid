import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { errorMessage } from '../utils'
import AuthShell, { AuthField } from '../components/AuthShell'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await login(email, password)
      navigate('/app')
    } catch (err) {
      setError(errorMessage(err, 'Invalid email or password'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      mode="login"
      eyebrow="KnoVid"
      title="Welcome back"
      subtitle="Sign in to keep turning videos into searchable insight."
      error={error}
      submitLabel="Sign in"
      busy={busy}
      onSubmit={handleSubmit}
      footer={
        <>
          Don't have an account?{' '}
          <Link
            to="/register"
            className="font-semibold text-[#7E3AF2] hover:text-[#A855F7] hover:underline dark:text-[#E6C9FF] dark:hover:text-[#E3C4FF]"
          >
            Create one
          </Link>
        </>
      }
    >
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
        placeholder="Your password"
        autoComplete="current-password"
      />
    </AuthShell>
  )
}
