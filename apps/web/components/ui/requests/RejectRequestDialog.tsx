// Asks for the reason before a book request is rejected. The requester sees
// it on the request, in the notification and in the email.

"use client"

import { useRef, useState } from "react"
import { rejectionReasonProblem } from "@/lib/bookRequestForm"
import { useDialogKeyboard } from "@/lib/hooks/useDialogKeyboard"

const body = { fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" } as const

export function RejectRequestDialog({ title, busy, onCancel, onConfirm }: {
  title: string
  busy: boolean
  onCancel: () => void
  onConfirm: (reason: string) => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useDialogKeyboard(dialogRef, { onClose: onCancel })
  const [reason, setReason] = useState("")
  const [problem, setProblem] = useState("")

  function submit() {
    const found = rejectionReasonProblem(reason)
    if (found) {
      setProblem(found)
      return
    }
    onConfirm(reason.trim())
  }

  return (
    <div className="fixed inset-0 z-(--z-modal) flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-900/40" onClick={onCancel} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reject-request-title"
        className="relative w-full max-w-md bg-white rounded-(--radius-lg) shadow-(--shadow-lg) p-5 flex flex-col gap-3"
      >
        <h2 id="reject-request-title" className="text-ink-900 font-semibold" style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-lg)" }}>
          Reject this request?
        </h2>
        <p className="text-ink-500" style={body}>&ldquo;{title}&rdquo;</p>
        <label className="flex flex-col gap-1 text-ink-700 font-medium" style={body}>
          Reason <span className="text-ink-400 font-normal" style={{ fontSize: "var(--text-xs)" }}>Shown to the requester.</span>
          <textarea
            value={reason}
            onChange={(e) => { setReason(e.target.value); setProblem("") }}
            rows={3}
            autoFocus
            className="px-3 py-2 rounded-sm border border-ink-200 focus:outline-none focus:border-green-700 resize-none font-normal"
            style={body}
          />
        </label>
        {problem && <p className="text-danger" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }} role="alert">{problem}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="px-4 py-2 rounded-sm text-ink-600 hover:bg-ink-100 transition-colors font-medium" style={body}>
            Keep reviewing
          </button>
          <button type="button" onClick={submit} disabled={busy} className="px-4 py-2 rounded-sm bg-red-700 text-white hover:bg-red-800 disabled:opacity-40 transition-colors font-semibold" style={body}>
            Reject request
          </button>
        </div>
      </div>
    </div>
  )
}
