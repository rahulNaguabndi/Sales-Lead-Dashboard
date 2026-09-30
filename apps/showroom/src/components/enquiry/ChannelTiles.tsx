import type { Channel } from '@leaddesk/shared';
import { useRef, type KeyboardEvent } from 'react';

export const CHANNEL_LABELS: { value: Channel; label: string }[] = [
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'CALL', label: 'Call' },
  { value: 'SMS', label: 'SMS' },
  { value: 'EMAIL', label: 'Email' },
];

export function ChannelTiles({
  value,
  onChange,
  describedBy,
}: {
  value: Channel;
  onChange: (c: Channel) => void;
  describedBy?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (e: KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = (i + d + CHANNEL_LABELS.length) % CHANNEL_LABELS.length;
    onChange(CHANNEL_LABELS[n]!.value);
    refs.current[n]?.focus();
  };
  return (
    <div role="radiogroup" aria-label="Preferred contact method" aria-describedby={describedBy} className="tiles">
      {CHANNEL_LABELS.map((c, i) => {
        const on = c.value === value;
        return (
          <button
            key={c.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            className={`tile${on ? ' tile-on' : ''}`}
            onClick={() => onChange(c.value)}
            onKeyDown={(e) => move(e, i)}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
