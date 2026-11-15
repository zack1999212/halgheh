import { Navigate, Route, Routes } from 'react-router-dom'
import Login from '../auth/Login.jsx'
import Register from '../auth/Register.jsx'
import Dashboard from '../workspace/Dashboard.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
