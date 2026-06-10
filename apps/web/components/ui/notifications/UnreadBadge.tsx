// components/ui/notifications/UnreadBadge.tsx

import { cn } from '@/lib/utils'

type UnreadBadgeProps = {
  count: number
  active?: boolean
  className?: string
}

export function UnreadBadge({ count, active = false, className }: UnreadBadgeProps) {
  if (count <= 0) return null

  const display = count > 99 ? '99+' : count

  return (
    <span
      className={cn(
        'flex items-center justify-center rounded-full min-w-[18px] h-[18px] px-1 font-semibold',
        active ? 'bg-green-700 text-white' : 'bg-ink-200 text-ink-500',
        className
      )}
      style={{ fontSize: 'var(--text-2xs)', fontFamily: 'var(--font-body)' }}
    >
      {display}
    </span>
  )
}