// A form field's problem, shown right under it.

export function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p className="text-danger" role="alert" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)" }}>
      {message}
    </p>
  )
}
