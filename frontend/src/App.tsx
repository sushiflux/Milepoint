import { type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import LoginPage from './pages/LoginPage'
import ProjectsPage from './pages/ProjectsPage'
import ProjectPage from './pages/ProjectPage'
import SettingsPage from './pages/SettingsPage'
import AdminPage from './pages/AdminPage'

// Not logged in (or the session expired): go to the normal login page and come back to this exact
// page afterwards. `expired` lets the login page say why the user is there.
function RequireAuth({ children }: { children: ReactNode }) {
  const { token, sessionExpired } = useAuth()
  const location = useLocation()
  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search, expired: sessionExpired }} />
  }
  return <>{children}</>
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { token, isAdmin, sessionExpired } = useAuth()
  const location = useLocation()
  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search, expired: sessionExpired }} />
  }
  if (!isAdmin) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <ProjectsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireAuth>
              <SettingsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireAdmin>
              <AdminPage />
            </RequireAdmin>
          }
        />
        <Route path="/projects/:projectId" element={<Navigate to="timeline" replace />} />
        <Route
          path="/projects/:projectId/:tab"
          element={
            <RequireAuth>
              <ProjectPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
