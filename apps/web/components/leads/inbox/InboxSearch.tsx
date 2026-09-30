'use client';

import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';

const DEBOUNCE_MS = 250;

/** Search box: 250 ms debounce, fewer than 2 characters clears the filter (no request). `/` focuses it. */
export function InboxSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (q: string | undefined) => void;
}) {
  const [text, setText] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };

  // Follow URL changes (back button, clear filters).
  useEffect(() => setText(value), [value]);

  useEffect(() => {
    const trimmed = text.trim();
    const next = trimmed.length >= 2 ? trimmed : undefined;
    if ((next ?? '') === latest.current.value) return;
    const t = setTimeout(() => latest.current.onChange(next), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [text]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.key !== '/' || el?.closest('input, textarea, select, [contenteditable=true]')) return;
      e.preventDefault();
      ref.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <Input
      ref={ref}
      type="search"
      value={text}
      onChange={(e) => setText(e.target.value)}
      placeholder="Search name, email, phone, reference…  ( / )"
      aria-label="Search leads"
      data-testid="inbox-search"
      className="h-9 w-72"
    />
  );
}
