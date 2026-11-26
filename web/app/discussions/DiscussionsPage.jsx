import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { MessageSquare, MessagesSquare } from 'lucide-react'
import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import LoadingState from '@/components/shared/LoadingState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { clearSession, getMe } from '../auth/api.js'
import { useActiveWorkspace } from '../workspace/ActiveWorkspaceContext.jsx'
import { useWorkspaceTheme } from '../workspace/hooks/useWorkspaceTheme.js'
import DiscussionCreateDialog from './DiscussionCreateDialog.jsx'
import DiscussionThread from './DiscussionThread.jsx'
import useDiscussions from './useDiscussions.js'
import './discussions.css'

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'discussion', label: 'Discussions' },
  { value: 'announcement', label: 'Announcements' },
]

export default function DiscussionsPage() {
  const navigate = useNavigate()
  const { theme } = useWorkspaceTheme()
  const { activeWorkspace, activeWorkspaceId, isAllWorkspaces } = useActiveWorkspace()
  const workspaceId = isAllWorkspaces ? null : activeWorkspaceId

  const handleUnauthorized = useCallback(() => {
    clearSession()
    navigate('/login', { replace: true })
  }, [navigate])

  const [filter, setFilter] = useState('')
  const [currentUser, setCurrentUser] = useState(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const createOpen = searchParams.get('create') === '1'

  const closeCreate = useCallback(() => {
    const next = new URLSearchParams(searchParams)
    next.delete('create')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  const { items, loading, error, refresh, setItems } = useDiscussions({
    workspaceId,
    type: filter || undefined,
    onUnauthorized: handleUnauthorized,
  })

  useEffect(() => {
    getMe()
      .then(setCurrentUser)
      .catch(() => setCurrentUser(null))
  }, [])

  const [selectedId, setSelectedId] = useState(null)
  const selected = items.find((item) => item.id === selectedId) || items[0] || null
  const canPin = ['owner', 'admin'].includes(activeWorkspace?.current_user_role)

  function handleCreated(created) {
    if (created?.id) {
      setItems((current) => [created, ...current])
      setSelectedId(created.id)
    }
    refresh()
  }

  function handleUpdated(updated) {
    setItems((current) =>
      current.map((item) => (item.id === updated.id ? updated : item)),
    )
  }

  function handleDeleted(id) {
    setItems((current) => current.filter((item) => item.id !== id))
    setSelectedId(null)
  }

  return (
    <div
      className="workspace-page discussions-page mx-auto w-full max-w-[1400px]"
      data-theme={theme}
    >
      <header className="discussions-header">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Discussions</h1>
          <p className="text-[13px] text-muted-foreground">
            {activeWorkspace?.name
              ? `Conversations in ${activeWorkspace.name}`
              : 'Share updates and talk with your workspace.'}
          </p>
        </div>
        <Badge variant="outline" className="text-[11px]">
          {activeWorkspace?.current_user_role || 'Member'}
        </Badge>
      </header>

      {!workspaceId ? (
        <EmptyState
          icon={MessageSquare}
          title="Select a workspace"
          description="Pick a workspace from the top bar to see its discussions."
          className="py-16"
        />
      ) : (
        <>
          <div className="discussions-filters" role="group" aria-label="Filter discussions">
            {FILTERS.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={filter === option.value ? 'default' : 'outline'}
                onClick={() => {
                  setFilter(option.value)
                  setSelectedId(null)
                }}
              >
                {option.label}
              </Button>
            ))}
          </div>

          {loading ? (
            <Card className="ws-card">
              <CardContent className="p-5">
                <LoadingState label="Loading discussions…" />
              </CardContent>
            </Card>
          ) : error ? (
            <ErrorState title="Could not load discussions" message={error} onRetry={refresh} />
          ) : items.length === 0 ? (
            <EmptyState
              icon={MessagesSquare}
              title="No discussions yet"
              description="Start the first conversation for this workspace."
              className="py-16"
            />
          ) : (
            <div className="discussions-layout">
              <Card className="ws-card discussions-list">
                <CardHeader className="px-4 pb-2 pt-4 sm:px-5 sm:pt-5">
                  <CardTitle className="ws-card-title">Conversations</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2 p-3 sm:p-4">
                  {items.map((discussion) => (
                    <button
                      key={discussion.id}
                      type="button"
                      className={`discussion-card${selected?.id === discussion.id ? ' is-selected' : ''}`}
                      onClick={() => setSelectedId(discussion.id)}
                      aria-pressed={selected?.id === discussion.id}
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="truncate text-[13.5px] font-semibold">
                          {discussion.title}
                        </span>
                        {discussion.is_pinned && (
                          <Badge variant="secondary" className="shrink-0 text-[10px]">
                            Pinned
                          </Badge>
                        )}
                      </span>
                      <span className="line-clamp-2 text-left text-[12px] text-muted-foreground">
                        {discussion.content}
                      </span>
                      <span className="flex justify-between text-[11px] text-muted-foreground">
                        <span>
                          {discussion.author?.name || discussion.author?.username || 'Member'}
                        </span>
                        <span>{discussion.reply_count || 0} replies</span>
                      </span>
                    </button>
                  ))}
                </CardContent>
              </Card>

              {selected && (
                <Card className="ws-card discussions-detail">
                  <CardContent className="p-4 sm:p-5">
                    <DiscussionThread
                      workspaceId={workspaceId}
                      discussion={selected}
                      currentUserId={currentUser?.id}
                      canPin={canPin}
                      onUpdated={handleUpdated}
                      onDeleted={handleDeleted}
                    />
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </>
      )}

      {workspaceId && (
        <DiscussionCreateDialog
          open={createOpen}
          workspaceId={workspaceId}
          onClose={closeCreate}
          onCreated={handleCreated}
        />
      )}
    </div>
  )
}
