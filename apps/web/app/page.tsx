import { Button } from "@/components/ui/button"
import { AvailabilityPill } from "@/components/ui/pills/availability-pill"

export default function Home() {
  return (
    <main className="min-h-screen p-8">
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-5xl)',
          color: 'var(--color-green-800)'
        }}
        className="mb-8"
      >
        Lasallia
      </h1>

      <div className="flex gap-3 flex-wrap mb-8">
        <Button>Borrow Book</Button>
        <Button variant="outline">Reserve</Button>
        <Button variant="secondary">Cancel</Button>
        <Button variant="destructive">Remove</Button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <AvailabilityPill status="available" />
        <AvailabilityPill status="borrowed" />
        <AvailabilityPill status="reserved" />
        <AvailabilityPill status="missing" />
      </div>
    </main>
  )
}