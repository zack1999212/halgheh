import { useNavigate } from 'react-router-dom'

export default function Dashboard() {
  const navigate = useNavigate()

  function logout() {
    localStorage.removeItem('token')
    navigate('/login')
  }

  return (
    <div className="dashboard">
      <header>
        <h1>halgheh dashboard</h1>
        <button onClick={logout}>Logout</button>
      </header>
      <p>You are logged in. Docs, calendar, task and share sections come here.</p>
    </div>
  )
}
