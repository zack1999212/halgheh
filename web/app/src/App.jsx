import { Navigate, Route, Routes } from 'react-router-dom'
import Login from '../auth/Login.jsx'
import Register from '../auth/Register.jsx'
import ProtectedRoute from '../auth/ProtectedRoute.jsx'
import AppLayout from '../workspace/AppLayout.jsx'
import WorkspaceLayout from '../workspace/layouts/WorkspaceLayout.jsx'
import CalendarLayout from '../workspace/layouts/CalendarLayout.jsx'
import TasksLayout from '../workspace/layouts/TasksLayout.jsx'
import DocumentsLayout from '../workspace/layouts/DocumentsLayout.jsx'
import WorkspacePage from '../workspace/WorkspacePage.jsx'
import CalendarPage from '../calendar/CalendarPage.jsx'
import TasksPage from '../task/TasksPage.jsx'
import DocumentsPage from '../features/documents/DocumentsPage.jsx'
import AISettingsPage from '../ai/AISettingsPage.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/workspace" element={<WorkspaceLayout />}>
          <Route index element={<WorkspacePage />} />
        </Route>
        <Route path="/calendar" element={<CalendarLayout />}>
          <Route index element={<CalendarPage />} />
        </Route>
        <Route path="/tasks" element={<TasksLayout />}>
          <Route index element={<TasksPage />} />
        </Route>
        <Route path="/documents" element={<DocumentsLayout />}>
          <Route index element={<DocumentsPage />} />
          <Route path=":documentId" element={<DocumentsPage />} />
        </Route>
        <Route path="/settings/ai" element={<AISettingsPage />} />
      </Route>

      {/* The previous login destination now resolves to the workspace page. */}
      <Route path="/dashboard" element={<Navigate to="/workspace" replace />} />

      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
