import { useEffect, useMemo, useState } from 'react'
import { Camera, CheckCircle2, KeyRound, Loader2, Save, UserRound } from 'lucide-react'
import { API_BASE } from '../../src/api.js'
import { changePassword, updateProfile, uploadAvatar } from '../../auth/api.js'
import DialogShell from '@/components/shared/DialogShell'
import FormError from '@/components/shared/FormError'
import FormField, { fieldInputClass } from '@/components/shared/FormField'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

function initialsFor(user) {
  const source = (user?.name || user?.username || '').trim()
  if (!source) return '·'
  const parts = source.split(/\s+/).slice(0, 2)
  return parts.map((part) => part.charAt(0).toUpperCase()).join('')
}

function resolveAvatarUrl(avatarUrl) {
  if (!avatarUrl) return null
  if (/^https?:\/\//i.test(avatarUrl)) return avatarUrl
  return `${API_BASE}${avatarUrl.startsWith('/') ? avatarUrl : `/${avatarUrl}`}`
}

function formatDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function SectionCard({ icon, iconTone = 'gold', title, description, children, className }) {
  const chipClass = iconTone === 'ink'
    ? 'from-[#57534A] to-[#17150F] text-[#F2F0EA] shadow-[inset_0_2px_3px_rgba(255,255,255,0.18),inset_0_-4px_7px_rgba(0,0,0,0.35),0_10px_16px_-8px_rgba(20,18,14,0.45)] dark:from-[#4A463E] dark:to-[#191815]'
    : 'from-[#FFE066] to-[#F59F00] text-[#2A2114] shadow-[inset_0_2px_3px_rgba(255,255,255,0.55),inset_0_-4px_7px_rgba(0,0,0,0.22),0_10px_16px_-8px_rgba(245,159,0,0.55)] dark:from-[#FFD43B] dark:to-[#E67700] dark:text-[#1A150F]'

  return (
    <section
      className={cn(
        'rounded-[22px] border border-black/[0.06] bg-[linear-gradient(165deg,rgba(255,255,255,0.92),rgba(255,255,255,0.64))] p-4 shadow-[0_8px_20px_rgba(35,30,24,0.08),inset_0_1px_0_rgba(255,255,255,0.92)] sm:p-5',
        'dark:border-white/10 dark:bg-[linear-gradient(165deg,rgba(42,40,35,0.86),rgba(26,25,22,0.7))] dark:shadow-[0_10px_22px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.08)]',
        className,
      )}
    >
      <div className="mb-4 flex items-start gap-3">
        <span
          className={cn(
            'inline-flex size-10 shrink-0 items-center justify-center rounded-[14px] bg-gradient-to-b',
            chipClass,
          )}
          aria-hidden="true"
        >
          {icon}
        </span>
        <div className="min-w-0 pt-0.5">
          <h3 className="text-[15px] font-semibold tracking-[-0.015em] text-foreground">{title}</h3>
          {description ? <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      {children}
    </section>
  )
}

function StatusMessage({ tone = 'success', children }) {
  if (!children) return null
  const isSuccess = tone === 'success'
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-xl border px-3 py-2 text-[12.5px] font-medium',
        isSuccess
          ? 'border-emerald-200/80 bg-emerald-50/80 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
          : 'border-destructive/20 bg-destructive/5 text-destructive',
      )}
    >
      {isSuccess ? <CheckCircle2 size={15} className="mt-0.5 shrink-0" aria-hidden="true" /> : null}
      <span>{children}</span>
    </div>
  )
}

function InfoTile({ label, value }) {
  return (
    <div className="rounded-xl border border-black/[0.05] bg-white/55 px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.04] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/90">{label}</p>
      <p className="mt-1 text-[13px] font-medium text-foreground break-words">{value || '—'}</p>
    </div>
  )
}

export default function ProfileSettingsDialog({ open, user, onClose, onUpdated }) {
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [profileBusy, setProfileBusy] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profileSuccess, setProfileSuccess] = useState('')
  const [profileFieldErrors, setProfileFieldErrors] = useState({})

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')
  const [passwordFieldErrors, setPasswordFieldErrors] = useState({})

  const [avatarBusy, setAvatarBusy] = useState(false)
  const [avatarError, setAvatarError] = useState('')
  const [avatarSuccess, setAvatarSuccess] = useState('')

  useEffect(() => {
    if (!open) return
    setName(user?.name || '')
    setUsername(user?.username || '')
    setProfileError('')
    setProfileSuccess('')
    setProfileFieldErrors({})
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setPasswordError('')
    setPasswordSuccess('')
    setPasswordFieldErrors({})
    setAvatarError('')
    setAvatarSuccess('')
  }, [open, user])

  const avatarSrc = useMemo(() => resolveAvatarUrl(user?.avatar_url), [user?.avatar_url])
  const initials = initialsFor(user)
  const anyBusy = profileBusy || passwordBusy || avatarBusy

  async function handleSaveProfile(e) {
    e?.preventDefault?.()
    if (profileBusy || !user) return
    setProfileError('')
    setProfileSuccess('')
    const errs = {}
    const trimmedUsername = username.trim()
    const trimmedName = name.trim()
    if (!trimmedUsername) errs.username = 'Username is required.'
    if (trimmedUsername.length > 64) errs.username = 'Username must be 64 characters or fewer.'
    if (trimmedName.length > 128) errs.name = 'Name must be 128 characters or fewer.'
    setProfileFieldErrors(errs)
    if (Object.keys(errs).length > 0) return

    const payload = {}
    if (trimmedUsername !== (user.username || '')) payload.username = trimmedUsername
    if (trimmedName !== (user.name || '').trim()) payload.name = trimmedName
    if (Object.keys(payload).length === 0) {
      setProfileSuccess('No profile changes to save.')
      return
    }

    setProfileBusy(true)
    try {
      const updated = await updateProfile(payload)
      setProfileSuccess('Profile updated successfully.')
      onUpdated?.(updated)
    } catch (err) {
      setProfileError(err?.message || 'Could not update your profile.')
    } finally {
      setProfileBusy(false)
    }
  }

  async function handleChangePassword(e) {
    e?.preventDefault?.()
    if (passwordBusy) return
    setPasswordError('')
    setPasswordSuccess('')
    const errs = {}
    if (!currentPassword) errs.current_password = 'Current password is required.'
    if (!newPassword) errs.new_password = 'New password is required.'
    else if (newPassword.length < 1) errs.new_password = 'New password is required.'
    if (!confirmPassword) errs.confirm_password = 'Please confirm your new password.'
    else if (newPassword && confirmPassword !== newPassword) errs.confirm_password = 'Passwords do not match.'
    if (currentPassword && newPassword && currentPassword === newPassword) {
      errs.new_password = 'New password must be different from current password.'
    }
    setPasswordFieldErrors(errs)
    if (Object.keys(errs).length > 0) return

    setPasswordBusy(true)
    try {
      await changePassword({ current_password: currentPassword, new_password: newPassword })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPasswordFieldErrors({})
      setPasswordSuccess('Password changed successfully.')
    } catch (err) {
      setPasswordError(err?.message || 'Could not change your password.')
    } finally {
      setPasswordBusy(false)
    }
  }

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || avatarBusy) return
    setAvatarError('')
    setAvatarSuccess('')
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('Profile picture is too large (max 5 MB).')
      return
    }
    setAvatarBusy(true)
    try {
      const updated = await uploadAvatar(file)
      setAvatarSuccess('Profile picture updated.')
      onUpdated?.(updated)
    } catch (err) {
      setAvatarError(err?.message || 'Could not upload profile picture.')
    } finally {
      setAvatarBusy(false)
    }
  }

  return (
    <DialogShell
      open={open}
      title="Profile settings"
      description="Manage your account details, security, and profile picture."
      onClose={anyBusy ? () => {} : onClose}
      wide
      contentClassName="rounded-[22px] border-black/[0.06] bg-[linear-gradient(180deg,rgba(250,248,244,0.98),rgba(245,243,238,0.98))] shadow-[0_20px_44px_rgba(35,30,24,0.16),0_4px_10px_rgba(35,30,24,0.08)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(24,23,21,0.98),rgba(18,17,16,0.98))]"
    >
      <div className="grid gap-4 sm:gap-5">
        {/* Hero / account overview */}
        <section className="relative overflow-hidden rounded-[22px] border border-black/[0.06] bg-[linear-gradient(165deg,rgba(255,255,255,0.95),rgba(255,251,235,0.72))] p-4 shadow-[0_10px_24px_rgba(35,30,24,0.09),inset_0_1px_0_rgba(255,255,255,0.95)] sm:p-5 dark:border-white/10 dark:bg-[linear-gradient(165deg,rgba(48,45,38,0.82),rgba(28,27,24,0.78))] dark:shadow-[0_12px_26px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.08)]">
          <div className="pointer-events-none absolute -right-10 -top-10 size-36 rounded-full bg-amber-300/25 blur-2xl dark:bg-amber-400/10" aria-hidden="true" />
          <div className="pointer-events-none absolute -left-8 bottom-0 size-28 rounded-full bg-orange-300/20 blur-2xl dark:bg-orange-400/10" aria-hidden="true" />

          <div className="relative grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
            <div className="flex flex-col items-center gap-3 sm:items-start">
              <div className="relative">
                <div className="absolute -inset-1 rounded-[22px] bg-gradient-to-b from-[#FFE066]/60 to-[#F59F00]/30 blur-[2px] dark:from-[#FFD43B]/25 dark:to-[#E67700]/20" aria-hidden="true" />
                <Avatar className="relative size-20 rounded-[18px] border border-white/70 shadow-[0_10px_18px_rgba(35,30,24,0.14),inset_0_1px_0_rgba(255,255,255,0.6)] dark:border-white/15 dark:shadow-[0_10px_18px_rgba(0,0,0,0.35)]">
                  {avatarSrc ? <AvatarImage src={avatarSrc} alt={user?.name || user?.username || 'Profile picture'} className="object-cover" /> : null}
                  <AvatarFallback className="rounded-[18px] bg-gradient-to-b from-[#3E3B35] to-[#12110F] text-lg font-semibold text-[#F2F0EA]">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </div>

              <label className="inline-flex cursor-pointer items-center">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="sr-only"
                  onChange={handleAvatarChange}
                  disabled={anyBusy}
                />
                <span
                  className={cn(
                    'inline-flex h-9 items-center gap-1.5 rounded-xl border border-black/[0.08] bg-white/80 px-3.5 text-[12.5px] font-semibold text-foreground shadow-[0_2px_6px_rgba(35,30,24,0.08),inset_0_1px_0_rgba(255,255,255,0.9)] transition-all hover:-translate-y-px hover:bg-white hover:shadow-[0_6px_14px_rgba(35,30,24,0.12)]',
                    'dark:border-white/10 dark:bg-white/[0.08] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] dark:hover:bg-white/[0.12]',
                    anyBusy && 'pointer-events-none opacity-60',
                  )}
                >
                  {avatarBusy ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                  {avatarBusy ? 'Uploading…' : 'Change picture'}
                </span>
              </label>
            </div>

            <div className="min-w-0 grid gap-3">
              <div className="min-w-0">
                <p className="truncate text-[18px] font-semibold tracking-[-0.02em] text-foreground sm:text-[20px]">
                  {user?.name?.trim() || user?.username || 'Your account'}
                </p>
                {user?.username ? <p className="mt-0.5 text-[13px] font-medium text-muted-foreground">@{user.username}</p> : null}
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <InfoTile label="Username" value={user?.username || '—'} />
                <InfoTile label="Display name" value={user?.name?.trim() || '—'} />
                <InfoTile label="Member since" value={formatDate(user?.created_at)} />
              </div>

              <div className="grid gap-2">
                <FormError>{avatarError}</FormError>
                <StatusMessage tone="success">{avatarSuccess}</StatusMessage>
              </div>
            </div>
          </div>
        </section>

        {/* Profile details */}
        <SectionCard
          icon={<UserRound size={17} strokeWidth={2.2} />}
          iconTone="gold"
          title="Profile information"
          description="Update the name and username shown across your workspace."
        >
          <form className="grid gap-4" onSubmit={handleSaveProfile}>
            <FormError>{profileError}</FormError>
            <StatusMessage tone="success">{profileSuccess}</StatusMessage>

            <div className="grid gap-3 sm:grid-cols-2">
              <FormField id="profile-username" label="Username" required error={profileFieldErrors.username}>
                {(field) => (
                  <Input
                    {...field}
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value)
                      setProfileFieldErrors((s) => ({ ...s, username: '' }))
                      setProfileSuccess('')
                    }}
                    className={cn(fieldInputClass, 'h-10 rounded-xl bg-background/70 shadow-[inset_0_1px_2px_rgba(35,30,24,0.04)]')}
                    placeholder="Username"
                    maxLength={64}
                    disabled={anyBusy}
                    autoComplete="username"
                  />
                )}
              </FormField>
              <FormField id="profile-name" label="Display name" hint="Optional" error={profileFieldErrors.name}>
                {(field) => (
                  <Input
                    {...field}
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value)
                      setProfileFieldErrors((s) => ({ ...s, name: '' }))
                      setProfileSuccess('')
                    }}
                    className={cn(fieldInputClass, 'h-10 rounded-xl bg-background/70 shadow-[inset_0_1px_2px_rgba(35,30,24,0.04)]')}
                    placeholder="Your name"
                    maxLength={128}
                    disabled={anyBusy}
                    autoComplete="name"
                  />
                )}
              </FormField>
            </div>

            <div className="flex items-center justify-end pt-1">
              <Button
                type="submit"
                className="h-10 rounded-xl bg-foreground px-4 text-background shadow-[0_6px_14px_rgba(35,30,24,0.18)] hover:bg-foreground/90"
                disabled={anyBusy || !user}
              >
                {profileBusy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                {profileBusy ? 'Saving…' : 'Save profile'}
              </Button>
            </div>
          </form>
        </SectionCard>

        {/* Password */}
        <SectionCard
          icon={<KeyRound size={17} strokeWidth={2.2} />}
          iconTone="ink"
          title="Security"
          description="Keep your account protected by updating your password."
        >
          <form className="grid gap-4" onSubmit={handleChangePassword}>
            <FormError>{passwordError}</FormError>
            <StatusMessage tone="success">{passwordSuccess}</StatusMessage>

            <FormField id="profile-current-password" label="Current password" required error={passwordFieldErrors.current_password}>
              {(field) => (
                <Input
                  {...field}
                  type="password"
                  value={currentPassword}
                  onChange={(e) => {
                    setCurrentPassword(e.target.value)
                    setPasswordFieldErrors((s) => ({ ...s, current_password: '' }))
                    setPasswordSuccess('')
                  }}
                  className={cn(fieldInputClass, 'h-10 rounded-xl bg-background/70 shadow-[inset_0_1px_2px_rgba(35,30,24,0.04)]')}
                  autoComplete="current-password"
                  disabled={anyBusy}
                />
              )}
            </FormField>

            <div className="grid gap-3 sm:grid-cols-2">
              <FormField id="profile-new-password" label="New password" required error={passwordFieldErrors.new_password}>
                {(field) => (
                  <Input
                    {...field}
                    type="password"
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value)
                      setPasswordFieldErrors((s) => ({ ...s, new_password: '', confirm_password: '' }))
                      setPasswordSuccess('')
                    }}
                    className={cn(fieldInputClass, 'h-10 rounded-xl bg-background/70 shadow-[inset_0_1px_2px_rgba(35,30,24,0.04)]')}
                    autoComplete="new-password"
                    disabled={anyBusy}
                  />
                )}
              </FormField>
              <FormField id="profile-confirm-password" label="Confirm new password" required error={passwordFieldErrors.confirm_password}>
                {(field) => (
                  <Input
                    {...field}
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value)
                      setPasswordFieldErrors((s) => ({ ...s, confirm_password: '' }))
                      setPasswordSuccess('')
                    }}
                    className={cn(fieldInputClass, 'h-10 rounded-xl bg-background/70 shadow-[inset_0_1px_2px_rgba(35,30,24,0.04)]')}
                    autoComplete="new-password"
                    disabled={anyBusy}
                  />
                )}
              </FormField>
            </div>

            <div className="flex items-center justify-end pt-1">
              <Button
                type="submit"
                variant="outline"
                className="h-10 rounded-xl border-black/10 bg-white/70 px-4 shadow-[0_2px_6px_rgba(35,30,24,0.06),inset_0_1px_0_rgba(255,255,255,0.8)] hover:bg-white dark:border-white/10 dark:bg-white/[0.06] dark:hover:bg-white/[0.1]"
                disabled={anyBusy}
              >
                {passwordBusy ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />}
                {passwordBusy ? 'Updating…' : 'Update password'}
              </Button>
            </div>
          </form>
        </SectionCard>
      </div>
    </DialogShell>
  )
}
