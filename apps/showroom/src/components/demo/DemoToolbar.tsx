import { useState } from 'react';
import { getEnv } from '../../lib/env';
import { submitEnquiry } from '../../lib/intake-client';
import { buildPayload } from '../../lib/payload';
import { useEnquiry } from '../../state';
import { runBurst, type BurstEntry } from './burst';
import { randomBuyer } from './prefill';
import { SOURCE_OPTIONS, type SourceId } from './sources';

export function DemoToolbar() {
  const { sourceId, setSourceId, source, setValues, openSheet } = useEnquiry();
  const [log, setLog] = useState<BurstEntry[]>([]);
  const [running, setRunning] = useState(false);

  if (!getEnv().showDemoToolbar) return null;

  const prefill = async () => {
    const { values } = await randomBuyer();
    setValues(values);
    openSheet();
  };

  const burst = async () => {
    setRunning(true);
    setLog([]);
    await runBurst({
      generate: async () => buildPayload((await randomBuyer()).values, source),
      submit: (p, key) => submitEnquiry(p, key),
      onEntry: (e) => setLog((l) => [...l, e]),
    });
    setRunning(false);
  };

  return (
    <div className="demo-bar" role="region" aria-label="Demo controls">
      <span className="demo-tag">DEMO</span>
      <strong>Demo controls</strong>
      <label>
        Came from{' '}
        <select value={sourceId} onChange={(e) => setSourceId(e.target.value as SourceId)}>
          {SOURCE_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <button type="button" onClick={() => void prefill()}>
        Prefill random buyer
      </button>
      <button type="button" disabled={running} onClick={() => void burst()}>
        Submit ×5
      </button>
      {log.length > 0 && (
        <ul className="demo-log" aria-label="Burst results">
          {log.map((e) => (
            <li key={e.index}>
              {e.label}: {e.reference ?? `failed (${e.error})`}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
