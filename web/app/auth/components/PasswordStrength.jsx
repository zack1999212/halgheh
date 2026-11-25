import { passwordStrength } from '../validation.js'

const LABELS = ['Too short', 'Weak', 'Fair', 'Good', 'Strong']

/** Live password feedback for registration and password reset forms. */
export default function PasswordStrength({ value }) {
  const score = passwordStrength(value)

  return (
    <div className="grid gap-2" aria-live="polite">
      <div className="flex gap-1.5" aria-hidden="true">
        {[0, 1, 2, 3].map((index) => (
          <span
            key={index}
            className={`h-1.5 flex-1 rounded-full ${
              index < score ? 'bg-[var(--ws-accent,#e67700)]' : 'bg-muted'
            }`}
          />
        ))}
      </div>
      <p className="text-[12px] text-muted-foreground">
        {value ? LABELS[score] : 'Use 10+ characters with a letter and a number.'}
      </p>
    </div>
  )
}
