// components/ui/notifications/NotificationItemCard.tsx

import { cn } from "@/lib/utils"
import type { Notification, NotificationType } from "@lasallia/types"
import { Clock, BookOpen, CheckCircle, XCircle, Bell, AlertTriangle } from "lucide-react"

type NotificationItemCardProps = {
  notification: Notification
  onMarkRead?: (id: string) => void
  showTime?: boolean
  isLast?: boolean
}

type TypeConfig = {
  icon: () => React.ReactNode
  iconBg: string
  iconColor: string
}

const typeConfig: Record<NotificationType, TypeConfig> = {
  due_reminder: {
    icon: () => <Clock size={15} />,
    iconBg: "bg-warn-bg",
    iconColor: "text-warn",
  },
  overdue: {
    icon: () => <AlertTriangle size={15} />,
    iconBg: "bg-danger-bg",
    iconColor: "text-danger",
  },
  reservation_confirmed: {
    icon: () => <CheckCircle size={15} />,
    iconBg: "bg-success-bg",
    iconColor: "text-success",
  },
  reservation_cancelled: {
    icon: () => <XCircle size={15} />,
    iconBg: "bg-ink-100",
    iconColor: "text-ink-400",
  },
  return_confirmed: {
    icon: () => <BookOpen size={15} />,
    iconBg: "bg-info-bg",
    iconColor: "text-info",
  },
}

const fallbackConfig: TypeConfig = {
  icon: () => <Bell size={15} />,
  iconBg: "bg-ink-100",
  iconColor: "text-ink-400",
}

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

export function NotificationItemCard({
  notification,
  onMarkRead,
  showTime = true,
  isLast = false,
}: NotificationItemCardProps) {
  const config = typeConfig[notification.type] ?? fallbackConfig

  return (
    <div
      className={cn(
        "flex items-start gap-3 px-4 sm:px-5 py-4 transition-colors cursor-pointer hover:bg-ink-50",
        !notification.is_read && "hover:bg-green-50/60",
        !isLast && "border-b border-ink-100"
      )}
      onClick={() => !notification.is_read && onMarkRead?.(notification.id)}
    >
      {/* Icon */}
      <div
        className={cn(
          "mt-0.5 flex-shrink-0 flex items-center justify-center rounded-full size-7",
          config.iconBg,
          config.iconColor
        )}
      >
        {config.icon()}
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "leading-snug",
            notification.is_read ? "text-ink-500 font-normal" : "text-ink-900 font-semibold"
          )}
          style={{ fontSize: "var(--text-body)", fontFamily: "var(--font-body)" }}
        >
          {notification.title}
        </p>
        <p
          className="text-ink-400 mt-0.5 leading-relaxed"
          style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
        >
          {notification.message}
        </p>
      </div>

      {/* Right: time + unread dot */}
      <div className="flex flex-col items-end gap-2 flex-shrink-0 pt-0.5">
        {showTime && (
          <span
            className="text-ink-400 whitespace-nowrap"
            style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-body)" }}
          >
            {formatTime(notification.created_at)}
          </span>
        )}
        {!notification.is_read && (
          <span className="size-2 rounded-full bg-green-600" />
        )}
      </div>
    </div>
  )
}