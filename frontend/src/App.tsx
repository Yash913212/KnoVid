import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { ToastProvider } from './components/Toast'
import PageFade from './components/PageFade'
import CommandPalette from './components/CommandPalette'
import AppShell from './components/layout/AppShell'
import AuroraBackground from './components/layout/AuroraBackground'

const Login = lazy(() => import('./pages/Login'))
const Register = lazy(() => import('./pages/Register'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const VideoDetail = lazy(() => import('./pages/VideoDetail'))

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAuth()
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

function PageLoader() {
  return <div className="app-atmosphere min-h-screen" />
}

function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <AuroraBackground />
          <Suspense fallback={<PageLoader />}>
            <Routes>
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
                  path="/"
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
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <CommandPalette />
          </Suspense>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  )
}

export default App