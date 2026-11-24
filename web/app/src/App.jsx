import { Navigate, Route, Routes } from 'react-router-dom'
import Login from '../auth/Login.jsx'
import Register from '../auth/Register.jsx'
import ProtectedRoute from '../auth/ProtectedRoute.jsx'
import AppLayout from '../workspace/AppLayout.jsx'
import WorkspaceLayout from '../workspace/layouts/WorkspaceLayout.jsx'
import CalendarLayout from '../workspace/layouts/CalendarLayout.jsx'
import TasksLayout from '../workspace/layouts/TasksLayout.jsx'
import DocumentsLayout from '../workspace/layouts/DocumentsLayout.jsx'
import HomePage from '../workspace/HomePage.jsx'
import WorkspacePage from '../workspace/WorkspacePage.jsx'
import ActivityPage from '../workspace/ActivityPage.jsx'
import CalendarPage from '../calendar/CalendarPage.jsx'
import TasksPage from '../task/TasksPage.jsx'
import DocumentsPage from '../features/documents/DocumentsPage.jsx'
import AISettingsPage from '../ai/AISettingsPage.jsx'
import { ToastProvider } from './components/shared/ToastProvider.jsx'

export default function App() {
  return (
    <ToastProvider>
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
        <Route index element={<HomePage />} />
        <Route path="home" element={<HomePage />} />
        <Route path="workspace" element={<WorkspaceLayout />}>
          <Route index element={<WorkspacePage />} />
          <Route path="activity" element={<ActivityPage />} />
        </Route>
        <Route path="projects/*" element={<Navigate to="/workspace" replace />} />
        <Route path="calendar" element={<CalendarLayout />}>
          <Route index element={<CalendarPage />} />
        </Route>
        <Route path="tasks" element={<TasksLayout />}>
          <Route index element={<TasksPage />} />
        </Route>
        <Route path="documents" element={<DocumentsLayout />}>
          <Route index element={<DocumentsPage />} />
          <Route path=":documentId" element={<DocumentsPage />} />
        </Route>
        <Route path="settings/ai" element={<AISettingsPage />} />
      </Route>

      {/* Preserve existing login destination while landing on the neutral home page. */}
      <Route path="/dashboard" element={<Navigate to="/home" replace />} />

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
    </ToastProvider>
  )
}
