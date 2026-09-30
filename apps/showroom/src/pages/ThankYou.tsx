import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';

export interface ThankYouState {
  reference?: string;
  name?: string;
  channel?: string;
  bestTime?: string;
  language?: string;
}

const STEPS = [
  'A member of our team receives your enquiry right away.',
  'They contact you by your preferred channel, at your preferred time.',
  'Together you pick a test drive or talk through finance.',
];

export function ThankYou() {
  const { state } = useLocation() as { state: ThankYouState | null };
  const [params] = useSearchParams();
  const reference = state?.reference ?? params.get('ref') ?? undefined;
  const heading = useRef<HTMLHeadingElement>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => heading.current?.focus(), []);

  const copy = async () => {
    if (!reference) return;
    try {
      await navigator.clipboard.writeText(reference);
      setCopied(true);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <section className="section center">
      <h1 ref={heading} tabIndex={-1}>
        {state?.name ? `Thanks ${state.name}!` : 'Thank you!'}
      </h1>
      {reference ? (
        <p>
          Your reference is <span className="ref-pill">{reference}</span>{' '}
          <button type="button" className="btn btn-ghost" onClick={copy}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </p>
      ) : (
        <p>We have received your enquiry and will be in touch shortly.</p>
      )}
      {state?.channel && (
        <p className="muted">
          We'll contact you via {state.channel.toLowerCase()}
          {state.bestTime && state.bestTime !== 'ANYTIME' ? ` in the ${state.bestTime.toLowerCase()}` : ''}.
        </p>
      )}
      <h2>What happens next</h2>
      <ol className="steps">
        {STEPS.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <Link className="btn btn-primary" to="/">
        Back to all models
      </Link>
    </section>
  );
}
