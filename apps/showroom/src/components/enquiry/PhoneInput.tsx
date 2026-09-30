import { COUNTRIES } from '@leaddesk/shared';

const DIALS = [...new Set(Object.values(COUNTRIES).map((c) => c.dial))];

export function PhoneInput({
  id,
  dial,
  digits,
  onDial,
  onDigits,
  describedBy,
  invalid,
}: {
  id: string;
  dial: string;
  digits: string;
  onDial: (d: string) => void;
  onDigits: (d: string) => void;
  describedBy?: string;
  invalid?: boolean;
}) {
  return (
    <div className="phone">
      <select aria-label="Dial code" value={dial} onChange={(e) => onDial(e.target.value)}>
        {DIALS.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        value={digits}
        onChange={(e) => onDigits(e.target.value)}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
      />
    </div>
  );
}
