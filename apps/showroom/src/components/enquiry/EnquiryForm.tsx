import { COUNTRIES, COUNTRY_CODES, VEHICLES, type CountryCode } from '@leaddesk/shared';
import { useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { bannerFor, isRetryable, mapValidation } from '../../lib/errors';
import { submitEnquiry } from '../../lib/intake-client';
import { validateEnquiry, type EnquiryFormValues } from '../../lib/payload';
import { useEnquiry } from '../../state';
import { BudgetSelect } from './BudgetSelect';
import { ChannelTiles } from './ChannelTiles';
import { PhoneInput } from './PhoneInput';

const FIELD_ORDER = ['firstName', 'lastName', 'email', 'phoneDigits', 'preferredChannel', 'message'];
const MESSAGE_MAX = 2000;
const COUNTER_AT = 1800;

function Field({
  name,
  label,
  error,
  hint,
  children,
}: {
  name: string;
  label: string;
  error?: string;
  hint?: string;
  children: (a: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
}) {
  const id = `f-${name}`;
  const errId = `${id}-err`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children({ id, describedBy: error ? errId : undefined, invalid: !!error })}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && (
        <span id={errId} className="error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export function EnquiryForm() {
  const { values, setValues, source, idempotencyKey, renewKey, closeSheet, resetDraft } = useEnquiry();
  const navigate = useNavigate();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const set = <K extends keyof EnquiryFormValues>(k: K, v: EnquiryFormValues[K]) => {
    setValues({ ...values, [k]: v });
    if (errors[k as string]) setErrors(({ [k as string]: _drop, ...rest }) => rest);
  };

  const focusFirst = (errs: Record<string, string>) => {
    const first = FIELD_ORDER.find((f) => errs[f]) ?? Object.keys(errs)[0];
    if (first) formRef.current?.querySelector<HTMLElement>(`#f-${first}, [data-field="${first}"]`)?.focus();
  };

  const blurValidate = (field: string) => {
    const r = validateEnquiry(values, source);
    if (r.ok) return setErrors((e) => ({ ...e, [field]: '' }));
    const msg = r.errors[field];
    // only flag format problems on blur; required-ness is reported at submit
    if (msg && (values[field as keyof EnquiryFormValues] as string)?.trim?.()) {
      setErrors((e) => ({ ...e, [field]: msg }));
    }
  };

  const send = async () => {
    const v = validateEnquiry(values, source);
    if (!v.ok) {
      setErrors(v.errors);
      setBanner(null);
      focusFirst(v.errors);
      return;
    }
    setErrors({});
    setBanner(null);
    setBusy(true);
    const res = await submitEnquiry(v.payload, idempotencyKey());
    setBusy(false);
    if (res.ok) {
      const data = res.data;
      const state = {
        reference: 'reference' in data ? data.reference : undefined,
        name: values.firstName.trim(),
        channel: values.preferredChannel,
        bestTime: values.bestTime,
        language: values.language,
      };
      resetDraft();
      renewKey();
      closeSheet();
      navigate('/thank-you', { state });
      return;
    }
    const err = res.error;
    if (err.kind === 'validation') {
      const m = mapValidation(err, values.preferredChannel);
      setErrors(m.fields);
      setBanner(m.banner);
      setCanRetry(false);
      focusFirst(m.fields);
    } else {
      setBanner(bannerFor(err));
      setCanRetry(isRetryable(err));
    }
  };

  const onCountry = (c: CountryCode) =>
    setValues({ ...values, country: c, dial: COUNTRIES[c].dial, language: COUNTRIES[c].lang });

  const e = errors;
  const msgLen = values.message.length;

  return (
    <form
      ref={formRef}
      noValidate
      className="enquiry-form"
      onSubmit={(ev) => {
        ev.preventDefault();
        if (!busy) void send();
      }}
    >
      {banner && (
        <div className="banner" role="alert">
          <span>{banner}</span>
          {canRetry && (
            <button type="button" className="btn btn-ghost" onClick={() => void send()} disabled={busy}>
              Retry
            </button>
          )}
        </div>
      )}

      <fieldset>
        <legend>About you</legend>
        <Field name="firstName" label="First name" error={e.firstName}>
          {(a) => (
            <input id={a.id} value={values.firstName} maxLength={60} autoComplete="given-name" aria-describedby={a.describedBy} aria-invalid={a.invalid || undefined} onChange={(x) => set('firstName', x.target.value)} />
          )}
        </Field>
        <Field name="lastName" label="Last name" error={e.lastName}>
          {(a) => (
            <input id={a.id} value={values.lastName} maxLength={60} autoComplete="family-name" aria-describedby={a.describedBy} aria-invalid={a.invalid || undefined} onChange={(x) => set('lastName', x.target.value)} />
          )}
        </Field>
        <Field name="email" label="Email" error={e.email}>
          {(a) => (
            <input id={a.id} type="email" value={values.email} autoComplete="email" aria-describedby={a.describedBy} aria-invalid={a.invalid || undefined} onChange={(x) => set('email', x.target.value)} onBlur={() => blurValidate('email')} />
          )}
        </Field>
        <Field name="phoneDigits" label="Phone" error={e.phoneDigits}>
          {(a) => (
            <PhoneInput id={a.id} dial={values.dial} digits={values.phoneDigits} onDial={(d) => set('dial', d)} onDigits={(d) => set('phoneDigits', d)} describedBy={a.describedBy} invalid={a.invalid} />
          )}
        </Field>
        <Field name="country" label="Country">
          {(a) => (
            <select id={a.id} value={values.country} onChange={(x) => onCountry(x.target.value as CountryCode)}>
              {COUNTRY_CODES.map((c) => (
                <option key={c} value={c}>
                  {COUNTRIES[c].name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field name="city" label="City (optional)">
          {(a) => <input id={a.id} value={values.city} maxLength={80} autoComplete="address-level2" onChange={(x) => set('city', x.target.value)} />}
        </Field>
      </fieldset>

      <fieldset>
        <legend>How should we reach you?</legend>
        <div className="field">
          <span id="channel-label">Preferred contact method</span>
          <ChannelTiles value={values.preferredChannel} onChange={(c) => set('preferredChannel', c)} describedBy={e.preferredChannel ? 'f-preferredChannel-err' : undefined} />
          {e.preferredChannel && (
            <span id="f-preferredChannel-err" className="error" role="alert">
              {e.preferredChannel}
            </span>
          )}
        </div>
        <Field name="bestTime" label="Best time to reach you">
          {(a) => (
            <select id={a.id} value={values.bestTime} onChange={(x) => set('bestTime', x.target.value as EnquiryFormValues['bestTime'])}>
              <option value="ANYTIME">Anytime</option>
              <option value="MORNING">Morning</option>
              <option value="AFTERNOON">Afternoon</option>
              <option value="EVENING">Evening</option>
            </select>
          )}
        </Field>
        <Field name="language" label="Language">
          {(a) => (
            <select id={a.id} value={values.language} onChange={(x) => set('language', x.target.value as EnquiryFormValues['language'])}>
              {(['de', 'fr', 'it', 'es', 'nl', 'pt', 'en', 'pl', 'da'] as const).map((l) => (
                <option key={l} value={l}>
                  {l.toUpperCase()}
                </option>
              ))}
            </select>
          )}
        </Field>
      </fieldset>

      <fieldset>
        <legend>Your next car</legend>
        <Field name="vehicleModel" label="Model">
          {(a) => (
            <select id={a.id} value={values.vehicleModel} onChange={(x) => set('vehicleModel', x.target.value)}>
              <option value="">Not sure yet</option>
              {VEHICLES.map((v) => (
                <option key={v.slug} value={v.slug}>
                  {v.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field name="budget" label="Budget" error={e.budget}>
          {(a) => <BudgetSelect id={a.id} value={values.budget} onChange={(b) => set('budget', b)} describedBy={a.describedBy} />}
        </Field>
        <label className="check">
          <input type="checkbox" checked={values.testDriveRequested} onChange={(x) => set('testDriveRequested', x.target.checked)} /> I'd like a test drive
        </label>
        <label className="check">
          <input type="checkbox" checked={values.wantsFinance} onChange={(x) => set('wantsFinance', x.target.checked)} /> I'm interested in finance
        </label>
        <label className="check">
          <input type="checkbox" checked={values.hasTradeIn} onChange={(x) => set('hasTradeIn', x.target.checked)} /> I have a trade-in
        </label>
        <Field name="message" label="Message (optional)" error={e.message}>
          {(a) => (
            <>
              <textarea id={a.id} rows={3} maxLength={MESSAGE_MAX} value={values.message} aria-describedby={a.describedBy} onChange={(x) => set('message', x.target.value)} />
              {msgLen > COUNTER_AT && (
                <span className="hint" aria-live="polite">
                  {msgLen} / {MESSAGE_MAX}
                </span>
              )}
            </>
          )}
        </Field>
        <label className="check">
          <input type="checkbox" checked={values.marketingConsent} onChange={(x) => set('marketingConsent', x.target.checked)} /> Keep me posted about offers
        </label>
        <div className="hp" aria-hidden="true">
          <label htmlFor="f-website">Website</label>
          <input id="f-website" name="website" tabIndex={-1} autoComplete="off" value={values.website} onChange={(x) => set('website', x.target.value)} />
        </div>
      </fieldset>

      <div className="sheet-footer">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? (
            <>
              <span className="spinner" aria-hidden="true" /> Sending…
            </>
          ) : (
            'Send enquiry'
          )}
        </button>
      </div>
    </form>
  );
}
