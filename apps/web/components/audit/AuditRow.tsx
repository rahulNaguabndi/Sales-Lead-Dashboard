'use client';

import Link from 'next/link';
import { useState } from 'react';
import { formatDateTime, formatRelative } from '@/lib/format';
import { roleLabel } from '@leaddesk/shared';
import type { AuditItemDto } from './types';
import { actionLabel, actionTone } from './labels';

const localTz = () =>
  typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC';
import { DiffPanel } from './DiffPanel';

function ActorCell({ actor }: { actor: AuditItemDto['actor'] }) {
  if ('type' in actor) {
    return (
      <span className="text-muted-foreground">
        {actor.type === 'INTAKE' ? 'Website intake' : 'System'}
      </span>
    );
  }
  return (
    <span>
      {actor.name} <span className="text-xs text-muted-foreground">{roleLabel(actor.role)}</span>
    </span>
  );
}

export function AuditRow({ item }: { item: AuditItemDto }) {
  const [open, setOpen] = useState(false);
  const href = item.entity === 'lead' ? `/leads/${item.entityId}` : null;
  return (
    <>
      <tr
        className="cursor-pointer border-b hover:bg-muted/40"
        onClick={() => setOpen((o) => !o)}
        data-testid="audit-row"
      >
        <td className="whitespace-nowrap p-2">
          <time dateTime={new Date(item.createdAt).toISOString()}>
            {formatRelative(item.createdAt)}
            <span className="block text-xs text-muted-foreground">
              {formatDateTime(item.createdAt, localTz())}
            </span>
          </time>
        </td>
        <td className="p-2">
          <ActorCell actor={item.actor} />
        </td>
        <td className="p-2">
          <span
            title={item.action}
            className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${actionTone(item.action)}`}
          >
            {actionLabel(item.action)}
          </span>
        </td>
        <td className="p-2">
          {href ? (
            <Link href={href} className="underline" onClick={(e) => e.stopPropagation()}>
              {item.entityLabel}
            </Link>
          ) : (
            item.entityLabel
          )}
        </td>
        <td className="p-2">
          <button
            className="text-left"
            aria-expanded={open}
            aria-label={`${open ? 'Collapse' : 'Expand'} details`}
          >
            {open ? '▾' : '▸'} {item.summary}
          </button>
        </td>
      </tr>
      {open && (
        <tr className="border-b">
          <td colSpan={5}>
            <DiffPanel item={item} />
          </td>
        </tr>
      )}
    </>
  );
}
