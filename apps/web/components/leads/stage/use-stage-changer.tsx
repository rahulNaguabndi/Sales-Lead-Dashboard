'use client';

import { useCallback, useState, type ReactNode } from 'react';
import type { Stage } from '@leaddesk/shared';
import { LostDialog } from './LostDialog';
import type { StageRequest, StageResult } from './use-stage-mutation';
import { WonDialog } from './WonDialog';

export type ChangeTarget = {
  id: string;
  version: number;
  stage: Stage;
  vehicleModel: string | null;
};

type Options = {
  /** Performs the PATCH (with toasts/refresh); resolves with the typed result. */
  send: (lead: ChangeTarget, body: StageRequest) => Promise<StageResult>;
  /** Called when a WON/LOST dialog is dismissed without saving (Kanban snaps the card back). */
  onCancel?: (lead: ChangeTarget) => void;
};

/**
 * Shared "move this lead to X" flow: WON and LOST open their dialog first, every other stage is
 * sent immediately. Used by the detail-page chip, the Kanban drop and the keyboard Move menu.
 */
export function useStageChanger({ send, onCancel }: Options) {
  const [dialog, setDialog] = useState<{ kind: 'WON' | 'LOST'; lead: ChangeTarget } | null>(null);

  const request = useCallback(
    (lead: ChangeTarget, to: Stage, reason?: string) => {
      if (to === 'WON' || to === 'LOST') {
        setDialog({ kind: to, lead });
        return Promise.resolve(null);
      }
      return send(lead, { to, version: lead.version, reason });
    },
    [send],
  );

  const cancel = () => {
    if (dialog) onCancel?.(dialog.lead);
    setDialog(null);
  };

  /** Dialog confirm: null closes the dialog, a string keeps it open with that error. */
  const finish = async (lead: ChangeTarget, body: StageRequest): Promise<string | null> => {
    const r = await send(lead, body);
    if (r.ok) {
      setDialog(null);
      return null;
    }
    if (r.conflict) {
      setDialog(null);
      onCancel?.(lead);
      return null;
    }
    return r.message;
  };

  const dialogs: ReactNode = dialog && (
    <>
      <WonDialog
        open={dialog.kind === 'WON'}
        leadId={dialog.lead.id}
        defaultModel={dialog.lead.vehicleModel}
        onCancel={cancel}
        onConfirm={(d) =>
          finish(dialog.lead, {
            to: 'WON',
            version: dialog.lead.version,
            dealValue: d.dealValue,
            vehicleModel: d.vehicleModel,
            appliedOfferId: d.appliedOfferId,
          })
        }
      />
      <LostDialog
        open={dialog.kind === 'LOST'}
        onCancel={cancel}
        onConfirm={(d) =>
          finish(dialog.lead, {
            to: 'LOST',
            version: dialog.lead.version,
            lostReason: d.lostReason,
            lostNote: d.lostNote,
          })
        }
      />
    </>
  );

  return { request, dialogs };
}
