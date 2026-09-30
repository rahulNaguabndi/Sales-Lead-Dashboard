import { useEffect, useRef } from 'react';
import { useEnquiry } from '../../state';
import { EnquiryForm } from './EnquiryForm';

export function EnquirySheet() {
  const { open, closeSheet } = useEnquiry();
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!open) return;
    titleRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeSheet();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, closeSheet]);

  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={closeSheet}>
      <aside
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sheet-header">
          <h2 id="sheet-title" ref={titleRef} tabIndex={-1}>
            Tell us about you
          </h2>
          <button type="button" className="btn btn-ghost" aria-label="Close enquiry form" onClick={closeSheet}>
            ✕
          </button>
        </header>
        <EnquiryForm />
      </aside>
    </div>
  );
}
