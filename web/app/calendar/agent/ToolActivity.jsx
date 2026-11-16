import { Check, CircleAlert, Clock } from 'lucide-react'
import { toolLabel, toolStatus } from './format.js'

/** Compact, non-intrusive row describing one backend tool execution. */
export default function ToolActivity({ message }) {
  const { label, tone } = toolStatus(message)
  const result = message?.tool_result || {}
  const summary = result.summary || result.message || result.error || ''
  const Icon = tone === 'error' ? CircleAlert : tone === 'pending' ? Clock : Check

  return (
    <div className={`ca-tool ca-tool--${tone}`}>
      <span className="ca-tool-icon" aria-hidden="true">
        <Icon size={11} />
      </span>
      <div className="ca-tool-body">
        <div className="ca-tool-heading">
          <span className="ca-tool-title">{toolLabel(message?.tool_name)}</span>
          <span className="ca-tool-status">{label}</span>
        </div>
        {summary && <p className="ca-tool-summary">{summary}</p>}
      </div>
    </div>
  )
}
