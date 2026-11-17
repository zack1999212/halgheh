import { LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Primary authentication button with a built-in loading state. */
export default function SubmitButton({ loading = false, loadingLabel, children }) {
  return (
    <Button
      type="submit"
      disabled={loading}
      aria-busy={loading}
      className="mt-1 h-11 w-full rounded-[var(--radius-md)] text-[14.5px] font-medium"
    >
      {loading && (
        <LoaderCircle
          className="animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
      )}
      <span>{loading ? loadingLabel : children}</span>
    </Button>
  )
}
