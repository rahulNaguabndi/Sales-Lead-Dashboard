export function SuppressedMark({ n, min, className = '' }: { n?: number; min: number; className?: string }) {
  const label = n === undefined ? `Fewer than ${min} leads` : `Not enough data (n = ${n}, min ${min})`;
  return (
    <span
      title={label}
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs text-muted-foreground ${className}`}
      style={{
        backgroundImage:
          'repeating-linear-gradient(45deg, transparent 0 4px, rgba(100,116,139,0.25) 4px 5px)',
      }}
    >
      {label}
    </span>
  );
}
