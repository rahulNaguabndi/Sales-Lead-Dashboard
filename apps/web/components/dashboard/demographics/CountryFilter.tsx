'use client';
import { COUNTRIES } from '@leaddesk/shared';

const nameOf = (code: string) => (COUNTRIES as Record<string, { name: string }>)[code]?.name ?? code;

export function CountryFilter({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-1 text-xs">
      Country
      <select
        aria-label="Country"
        className="rounded-md border bg-background px-2 py-1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">All countries</option>
        {options.map((c) => (
          <option key={c} value={c}>
            {nameOf(c)}
          </option>
        ))}
      </select>
    </label>
  );
}
