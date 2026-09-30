'use client';

import { useState } from 'react';
import type { AuditItemDto } from './types';
import { MAX_VALUE_CHARS, buildDiff } from './labels';

export function DiffPanel({ item }: { item: AuditItemDto }) {
  const [showUnchanged, setShowUnchanged] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const { rows, raw } = buildDiff(item.before, item.after, item.resolved);
  const isCreate = item.before === null || item.before === undefined;
  const changed = rows.filter((r) => r.changed);
  const unchanged = rows.filter((r) => !r.changed);
  const meta = item.meta;
  const security = meta && ('emailHash' in meta || 'ip' in meta);

  const cell = (text: string) =>
    !expanded && text.length > MAX_VALUE_CHARS ? text.slice(0, MAX_VALUE_CHARS) + '…' : text;

  return (
    <div className="space-y-2 bg-muted/30 p-3 text-sm" data-testid="audit-diff">
      {raw !== null ? (
        <pre className="whitespace-pre-wrap break-all text-xs">{raw}</pre>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground">No field changes recorded.</p>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="w-1/4 py-1">Field</th>
              {!isCreate && <th>Before</th>}
              <th>After</th>
            </tr>
          </thead>
          <tbody>
            {[...changed, ...(showUnchanged ? unchanged : [])].map((r) => (
              <tr key={r.key} className={r.changed ? 'bg-amber-50 dark:bg-amber-950/30' : ''}>
                <td className="py-1 pr-2 font-medium">
                  {r.label}
                  {r.changed && !isCreate && (
                    <span className="ml-2 rounded border px-1 text-[10px] uppercase">changed</span>
                  )}
                </td>
                {!isCreate && <td className="break-words pr-2">{cell(r.before)}</td>}
                <td className="break-words">{cell(r.after)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="flex gap-3">
        {unchanged.length > 0 && (
          <button className="text-xs underline" onClick={() => setShowUnchanged((v) => !v)}>
            {showUnchanged ? 'Hide' : 'Show'} {unchanged.length} unchanged field
            {unchanged.length === 1 ? '' : 's'}
          </button>
        )}
        {rows.some((r) => r.before.length > MAX_VALUE_CHARS || r.after.length > MAX_VALUE_CHARS) && (
          <button className="text-xs underline" onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>
      {security && meta && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-xs">
          {'ip' in meta && (
            <>
              <dt className="text-muted-foreground">IP</dt>
              <dd>{String(meta.ip)}</dd>
            </>
          )}
          {'emailHash' in meta && (
            <>
              <dt className="text-muted-foreground">Email hash</dt>
              <dd className="font-mono">{String(meta.emailHash)}</dd>
            </>
          )}
        </dl>
      )}
    </div>
  );
}
