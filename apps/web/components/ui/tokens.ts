import type { Priority, Stage } from '@leaddesk/shared';

/** Design tokens shared by every screen so stage/priority colours stay consistent. */
export const PRIORITY_COLORS: Record<Priority, string> = {
  HOT: 'text-danger',
  WARM: 'text-warning',
  COOL: 'text-info',
};

export const PRIORITY_DOT_COLORS: Record<Priority, string> = {
  HOT: 'bg-danger',
  WARM: 'bg-warning',
  COOL: 'bg-info',
};

/**
 * Pipeline progression: neutral (new) -> cool blues -> violet -> amber (closing),
 * then green/red for outcomes. Adjacent stages stay distinguishable at 12px.
 */
export const STAGE_COLORS: Record<Stage, string> = {
  NEW: 'bg-slate-400/15 text-slate-200',
  CONTACTED: 'bg-sky-400/15 text-sky-300',
  QUALIFIED: 'bg-blue-400/15 text-blue-300',
  TEST_DRIVE: 'bg-violet-400/15 text-violet-300',
  NEGOTIATION: 'bg-warning/15 text-warning',
  WON: 'bg-success/15 text-success',
  LOST: 'bg-danger/15 text-danger',
  COLD: 'bg-slate-500/15 text-slate-400',
};

/** Leading dot colour per stage, so the chip is never colour-only. */
export const STAGE_DOT_COLORS: Record<Stage, string> = {
  NEW: 'bg-slate-300',
  CONTACTED: 'bg-sky-300',
  QUALIFIED: 'bg-blue-300',
  TEST_DRIVE: 'bg-violet-300',
  NEGOTIATION: 'bg-warning',
  WON: 'bg-success',
  LOST: 'bg-danger',
  COLD: 'bg-slate-500',
};

export const ACCENT = 'blue-600';
export const BACKGROUND = 'slate-950';
