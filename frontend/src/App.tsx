import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { ToastProvider } from './components/Toast'
import PageFade from './components/PageFade'
import CommandPalette from './components/CommandPalette'
import AppShell from './components/layout/AppShell'
import AuroraBackground from './components/layout/AuroraBackground'
import CursorGlow from './components/CursorGlow'
import ScrollProgress from './components/ScrollProgress'
import LoadingPage from './components/LoadingPage'
import ErrorBoundary from './components/ErrorBoundary'

const Login = lazy(() => import('./pages/Login'))
const Register = lazy(() => import('./pages/Register'))
const Landing = lazy(() => import('./pages/Landing'))
const NotFound = lazy(() => import('./pages/NotFound'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const VideoDetail = lazy(() => import('./pages/VideoDetail'))

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token, ready } = useAuth()
  if (!ready) return <LoadingPage />
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <AuroraBackground />
          <CursorGlow />
          <ScrollProgress />
          <div aria-hidden className="grain-overlay" />
          <Suspense fallback={<LoadingPage />}>
            <ErrorBoundary>
              <Routes>
              <Route
                path="/"
                element={<PageFade><Landing /></PageFade>}
              />
              <Route
                path="/login"
                element={<PageFade><Login /></PageFade>}
              />
              <Route
                path="/register"
                element={<PageFade><Register /></PageFade>}
              />
              <Route element={<AppShell />}>
                <Route
                  path="/app"
                  element={
                    <ProtectedRoute>
                      <PageFade><Dashboard /></PageFade>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/video/:id"
                  element={
                    <ProtectedRoute>
                      <PageFade><VideoDetail /></PageFade>
                    </ProtectedRoute>
                  }
                />
              </Route>
              <Route path="*" element={<PageFade><NotFound /></PageFade>} />
              </Routes>
              <CommandPalette />
            </ErrorBoundary>
          </Suspense>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  )
}

export default App
