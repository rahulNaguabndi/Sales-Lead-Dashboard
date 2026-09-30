'use client';
export type View = 'chart' | 'table';

export function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <div role="group" aria-label="View" className="inline-flex overflow-hidden rounded-md border text-xs">
      {(['chart', 'table'] as const).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={view === v}
          onClick={() => onChange(v)}
          className={`px-2 py-1 capitalize focus-visible:outline focus-visible:outline-2 ${
            view === v ? 'bg-primary text-primary-foreground' : 'bg-background'
          }`}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

export function ChartCard({
  title,
  insight,
  toggle,
  children,
  testId,
}: {
  title: string;
  insight?: string;
  toggle: React.ReactNode;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <section className="rounded-lg border bg-card p-4" data-testid={testId}>
      <header className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {insight && <p className="text-xs text-muted-foreground">{insight}</p>}
        </div>
        {toggle}
      </header>
      {children}
    </section>
  );
}
