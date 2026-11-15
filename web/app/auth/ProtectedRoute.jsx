import { Navigate, useLocation } from 'react-router-dom'
import { getToken } from '../src/api.js'

/** Blocks application routes when no session token is stored. */
export default function ProtectedRoute({ children }) {
  const location = useLocation()

  if (!getToken()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return children
}
