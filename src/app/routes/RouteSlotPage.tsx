import AppState from '@/components/ui/AppState'

type RouteSlotPageProps = {
  eyebrow: string
  title: string
  description: string
  notes: string[]
}

export default function RouteSlotPage({ eyebrow, title, description, notes }: RouteSlotPageProps) {
  return (
    <AppState
      eyebrow={eyebrow}
      title={title}
      description={description}
      details={
        <div className="grid gap-3 md:grid-cols-2">
          {notes.map((note) => (
            <div
              key={note}
              className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-4 py-4"
            >
              <p>{note}</p>
            </div>
          ))}
        </div>
      }
    />
  )
}
