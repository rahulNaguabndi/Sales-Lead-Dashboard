import type { Priority, Stage } from '@leaddesk/shared';

/** Design tokens shared by every screen so stage/priority colours stay consistent. */
export const PRIORITY_COLORS: Record<Priority, string> = {
  HOT: 'text-red-600',
  WARM: 'text-amber-500',
  COOL: 'text-sky-500',
};

export const STAGE_COLORS: Record<Stage, string> = {
  NEW: 'bg-blue-500/15 text-blue-300',
  CONTACTED: 'bg-blue-600/15 text-blue-300',
  QUALIFIED: 'bg-indigo-500/15 text-indigo-300',
  TEST_DRIVE: 'bg-violet-500/15 text-violet-300',
  NEGOTIATION: 'bg-fuchsia-500/15 text-fuchsia-300',
  WON: 'bg-green-500/15 text-green-400',
  LOST: 'bg-red-500/15 text-red-400',
  COLD: 'bg-slate-500/15 text-slate-400',
};

export const ACCENT = 'blue-600';
export const BACKGROUND = 'slate-950';
