'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  EMPTY_FIELDS,
  applyPrefill,
  focusTargetAfterPrefill,
  type ComposerFields,
  type ComposerPrefill,
} from './composer-state';

export type ComposerApi = {
  fields: ComposerFields;
  setFields: (update: (prev: ComposerFields) => ComposerFields) => void;
  expanded: boolean;
  setExpanded: (v: boolean) => void;
  /** F14 / F18 entry point: fill fields, expand, and move focus. */
  prefill: (p: ComposerPrefill) => void;
  focus: () => void;
  noteRef: RefObject<HTMLTextAreaElement>;
  outcomeRef: RefObject<HTMLSelectElement>;
};

const ComposerContext = createContext<ComposerApi | null>(null);

export function ComposerProvider({ children }: { children: ReactNode }) {
  const [fields, setFieldsState] = useState<ComposerFields>(EMPTY_FIELDS);
  const [expanded, setExpanded] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const outcomeRef = useRef<HTMLSelectElement>(null);
  const pendingFocus = useRef<'note' | 'outcome' | null>(null);

  const focusNow = useCallback((target: 'note' | 'outcome') => {
    // Wait a frame so the expanded composer has mounted its inputs.
    requestAnimationFrame(() => {
      const el = target === 'outcome' ? (outcomeRef.current ?? noteRef.current) : noteRef.current;
      el?.focus();
    });
  }, []);

  const prefill = useCallback(
    (p: ComposerPrefill) => {
      setFieldsState((prev) => applyPrefill(prev, p));
      setExpanded(true);
      pendingFocus.current = focusTargetAfterPrefill(p);
      focusNow(pendingFocus.current);
    },
    [focusNow],
  );

  const focus = useCallback(() => {
    setExpanded(true);
    focusNow('note');
  }, [focusNow]);

  const api = useMemo<ComposerApi>(
    () => ({
      fields,
      setFields: (update) => setFieldsState(update),
      expanded,
      setExpanded,
      prefill,
      focus,
      noteRef,
      outcomeRef,
    }),
    [fields, expanded, prefill, focus],
  );

  return <ComposerContext.Provider value={api}>{children}</ComposerContext.Provider>;
}

/** Null outside a <ComposerProvider>; the composer wraps itself when no provider is above it. */
export function useOptionalComposer(): ComposerApi | null {
  return useContext(ComposerContext);
}

/** Context with `prefill({type?, note?, outcome?, aiAssisted?})` and `focus()` (FR-008). */
export function useComposer(): ComposerApi {
  const ctx = useContext(ComposerContext);
  if (!ctx) throw new Error('useComposer must be used inside <ComposerProvider>');
  return ctx;
}
