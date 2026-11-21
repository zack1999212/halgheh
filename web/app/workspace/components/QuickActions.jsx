import { useNavigate } from 'react-router-dom'
import { CalendarDays, FileText, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function QuickActions({ onCreateEvent, canCreateEvent = false }) {
  const navigate = useNavigate()

  return (
    <Card className="ws-card min-w-0">
      <CardHeader className="px-4 pb-2 pt-4 sm:px-5 sm:pt-5">
        <CardTitle className="ws-card-title">Quick Actions</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-1 sm:px-5 sm:pb-5">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Button
            type="button"
            className="ws-btn h-10 justify-start gap-2 rounded-[10px]"
            onClick={onCreateEvent}
            disabled={!canCreateEvent}
          >
            <Plus className="size-4" aria-hidden="true" />
            Create Event
          </Button>
          <Button
            type="button"
            variant="outline"
            className="ws-btn h-10 justify-start gap-2 rounded-[10px]"
            onClick={() => navigate('/calendar')}
          >
            <CalendarDays className="size-4" aria-hidden="true" />
            Open Calendar
          </Button>
          <Button
            type="button"
            variant="outline"
            className="ws-btn h-10 justify-start gap-2 rounded-[10px]"
            onClick={() => navigate('/documents')}
          >
            <FileText className="size-4" aria-hidden="true" />
            Open Documents
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
