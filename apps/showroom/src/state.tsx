import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { defaultValues, type EnquiryFormValues, type SourceSelection } from './lib/payload';
import { loadSourceId, saveSourceId, selectionFor, type SourceId } from './components/demo/sources';

interface EnquiryState {
  values: EnquiryFormValues;
  setValues: (v: EnquiryFormValues) => void;
  open: boolean;
  openSheet: (model?: string) => void;
  closeSheet: () => void;
  /** Idempotency key for the current enquiry; reused on retry, renewed after success. */
  idempotencyKey: () => string;
  renewKey: () => void;
  sourceId: SourceId;
  setSourceId: (id: SourceId) => void;
  source: SourceSelection;
  resetDraft: () => void;
}

const Ctx = createContext<EnquiryState | null>(null);

export function EnquiryProvider({ children }: { children: ReactNode }) {
  const [values, setValues] = useState<EnquiryFormValues>(defaultValues);
  const [open, setOpen] = useState(false);
  const [sourceId, setSource] = useState<SourceId>(loadSourceId);
  const keyRef = useRef<string | null>(null);

  const openSheet = useCallback((model?: string) => {
    keyRef.current ??= crypto.randomUUID();
    if (model) setValues((v) => ({ ...v, vehicleModel: model }));
    setOpen(true);
  }, []);
  const closeSheet = useCallback(() => setOpen(false), []);
  const idempotencyKey = useCallback(() => (keyRef.current ??= crypto.randomUUID()), []);
  const renewKey = useCallback(() => {
    keyRef.current = crypto.randomUUID();
  }, []);
  const setSourceId = useCallback((id: SourceId) => {
    saveSourceId(id);
    setSource(id);
  }, []);
  const resetDraft = useCallback(() => setValues(defaultValues()), []);

  const value = useMemo<EnquiryState>(
    () => ({
      values,
      setValues,
      open,
      openSheet,
      closeSheet,
      idempotencyKey,
      renewKey,
      sourceId,
      setSourceId,
      source: selectionFor(sourceId),
      resetDraft,
    }),
    [values, open, openSheet, closeSheet, idempotencyKey, renewKey, sourceId, setSourceId, resetDraft],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useEnquiry(): EnquiryState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useEnquiry must be used inside EnquiryProvider');
  return v;
}
