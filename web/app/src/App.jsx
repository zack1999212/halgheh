import { Navigate, Route, Routes } from 'react-router-dom'
import Login from '../auth/Login.jsx'
import Register from '../auth/Register.jsx'
import ProtectedRoute from '../auth/ProtectedRoute.jsx'
import AppLayout from '../workspace/AppLayout.jsx'
import WorkspaceLayout from '../workspace/layouts/WorkspaceLayout.jsx'
import CalendarLayout from '../workspace/layouts/CalendarLayout.jsx'
import TasksLayout from '../workspace/layouts/TasksLayout.jsx'
import DocumentsLayout from '../workspace/layouts/DocumentsLayout.jsx'
import ProjectsLayout from '../workspace/layouts/ProjectsLayout.jsx'
import HomePage from '../workspace/HomePage.jsx'
import WorkspacePage from '../workspace/WorkspacePage.jsx'
import CalendarPage from '../calendar/CalendarPage.jsx'
import TasksPage from '../task/TasksPage.jsx'
import DocumentsPage from '../features/documents/DocumentsPage.jsx'
import AISettingsPage from '../ai/AISettingsPage.jsx'
import ProjectsPage from '../projects/pages/ProjectsPage.jsx'
import ProjectWorkspaceLayout from '../projects/pages/ProjectWorkspaceLayout.jsx'
import ProjectOverviewPage from '../projects/pages/ProjectOverviewPage.jsx'
import ProjectMembersPage from '../projects/pages/ProjectMembersPage.jsx'
import ProjectTasksPage from '../projects/pages/ProjectTasksPage.jsx'
import ProjectDocumentsPage from '../projects/pages/ProjectDocumentsPage.jsx'
import ProjectCalendarPage from '../projects/pages/ProjectCalendarPage.jsx'
import ProjectMilestonesPage from '../projects/pages/ProjectMilestonesPage.jsx'
import ProjectDiscussionsPage from '../projects/pages/ProjectDiscussionsPage.jsx'
import ProjectActivityPage from '../projects/pages/ProjectActivityPage.jsx'
import ProjectInvitationsPage from '../projects/pages/ProjectInvitationsPage.jsx'
import ProjectSectionPlaceholder from '../projects/pages/ProjectSectionPlaceholder.jsx'

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
        <Route index element={<HomePage />} />
        <Route path="home" element={<HomePage />} />
        <Route path="workspace" element={<WorkspaceLayout />}>
          <Route index element={<WorkspacePage />} />
        </Route>
        <Route path="projects" element={<ProjectsLayout />}>
          <Route index element={<ProjectsPage />} />
          <Route path="invitations" element={<ProjectInvitationsPage />} />
          <Route path=":projectId" element={<ProjectWorkspaceLayout />}>
            <Route index element={<Navigate to="overview" replace />} />
            <Route path="overview" element={<ProjectOverviewPage />} />
            <Route path="tasks" element={<ProjectTasksPage />} />
            <Route path="documents" element={<ProjectDocumentsPage />} />
            <Route path="calendar" element={<ProjectCalendarPage />} />
            <Route path="milestones" element={<ProjectMilestonesPage />} />
            <Route path="members" element={<ProjectMembersPage />} />
            <Route path="discussions" element={<ProjectDiscussionsPage />} />
            <Route path="activity" element={<ProjectActivityPage />} />
          </Route>
        </Route>
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
  )
}
