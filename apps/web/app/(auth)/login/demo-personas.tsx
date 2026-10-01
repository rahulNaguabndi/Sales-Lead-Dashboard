'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { signIn } from './sign-in';

const PERSONAS = [
  {
    name: 'Sofia Rossi',
    email: 'sofia.rossi@eurodrive.test',
    label: 'Rep · South',
    blurb: 'Works her own inbox of Italian and Spanish leads.',
  },
  {
    name: 'Anna Weber',
    email: 'anna.weber@eurodrive.test',
    label: 'Rep · DACH',
    blurb: 'German-speaking rep with a busy follow-up queue.',
  },
  {
    name: 'Lukas Becker',
    email: 'lukas.becker@eurodrive.test',
    label: 'Manager · DACH',
    blurb: 'Oversees the DACH team and reassigns leads.',
  },
  {
    name: 'Isabelle Laurent',
    email: 'isabelle.laurent@eurodrive.test',
    label: 'VP',
    blurb: 'Sees every team and the whole funnel.',
  },
];

export function DemoPersonas({ next }: { next?: string }) {
  const [busy, setBusy] = useState<string | null>(null);

  async function go(email: string) {
    setBusy(email);
    const err = await signIn(email, 'demo1234', next);
    if (err) setBusy(null);
  }

  return (
    <section aria-label="Demo login" className="flex flex-col gap-2">
      <h2 className="text-slate-400">Demo: login as</h2>
      {PERSONAS.map((p) => (
        <Card key={p.email} className="flex items-center gap-3 p-3">
          <div
            aria-hidden
            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-xs"
          >
            {p.name
              .split(' ')
              .map((w) => w[0])
              .join('')}
          </div>
          <div className="flex-1">
            <div>
              {p.name} <span className="text-slate-500">{p.label}</span>
            </div>
            <div className="text-xs text-slate-400">{p.blurb}</div>
          </div>
          <Button
            size="sm"
            disabled={busy !== null}
            aria-label={`Log in as ${p.name}, ${p.label}`}
            onClick={() => go(p.email)}
          >
            {busy === p.email ? 'Signing in…' : 'Log in'}
          </Button>
        </Card>
      ))}
    </section>
  );
}
