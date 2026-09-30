'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  TEMPLATE_KEYS,
  TEMPLATE_LANGS,
  buildMailtoLink,
  buildSmsLink,
  buildWhatsAppLink,
  isTemplateAvailable,
  renderTemplate,
  resolveTemplateLang,
  truncateMessage,
  type Channel,
  type TemplateKey,
  type TemplateVars,
} from '@leaddesk/shared';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CHANNEL_LABEL } from './channel-actions';

const KEY_LABEL: Record<TemplateKey, string> = {
  first_contact: 'First contact',
  follow_up: 'Follow-up',
  test_drive_invite: 'Test drive invite',
  offer_share: 'Share offer',
  callback_confirm: 'Callback confirmation',
};

export type TemplatePickerProps = {
  channel: Exclude<Channel, 'CALL'>;
  customer: { phone: string | null; email: string | null; language: string };
  vars: TemplateVars;
  defaultKey: TemplateKey;
  /** Called when the rep opens the link; the parent pre-fills the composer. */
  onOpen: (message: string) => void;
  trigger: ReactNode;
};

export function TemplatePicker({
  channel,
  customer,
  vars,
  defaultKey,
  onOpen,
  trigger,
}: TemplatePickerProps) {
  const [key, setKey] = useState<TemplateKey>(defaultKey);
  const [lang, setLang] = useState<string>(customer.language);
  const [copied, setCopied] = useState(false);

  const { fellBack } = resolveTemplateLang(lang);
  const rendered = useMemo(() => renderTemplate(key, lang, vars), [key, lang, vars]);
  const { text, truncated } = truncateMessage(rendered.body);

  const href =
    channel === 'WHATSAPP'
      ? buildWhatsAppLink(customer.phone ?? '', text)
      : channel === 'SMS'
        ? buildSmsLink(customer.phone ?? '', text)
        : buildMailtoLink(customer.email ?? '', rendered.subject, text);

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-[min(92vw,520px)] space-y-3" align="start">
        <div className="grid gap-3 sm:grid-cols-[170px_1fr]">
          <ul className="space-y-1" aria-label="Templates">
            {TEMPLATE_KEYS.map((k) => {
              const ok = isTemplateAvailable(k, vars);
              return (
                <li key={k}>
                  <button
                    type="button"
                    disabled={!ok}
                    title={ok ? undefined : 'No applicable offer'}
                    aria-pressed={k === key}
                    onClick={() => setKey(k)}
                    className={`w-full rounded-md px-2 py-1 text-left text-sm disabled:opacity-50 ${
                      k === key ? 'bg-muted font-medium' : 'hover:bg-muted/50'
                    }`}
                  >
                    {KEY_LABEL[k]}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Language
              <select
                aria-label="Template language"
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                className="rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
              >
                {[...new Set([customer.language, ...TEMPLATE_LANGS])].map((l) => (
                  <option key={l} value={l}>
                    {l.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
            {fellBack && (
              <p className="text-xs text-amber-400" role="status">
                Template in English (no {lang.toUpperCase()} template)
              </p>
            )}
            <p
              className="whitespace-pre-wrap rounded-md border border-border p-2 text-sm"
              data-testid="template-preview"
            >
              {text}
            </p>
            {truncated && (
              <p className="text-xs text-amber-400" role="status">
                Message truncated to 1,000 characters
              </p>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={async () => {
              await navigator.clipboard?.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? 'Copied' : 'Copy text'}
          </Button>
          <Button asChild size="sm">
            <a
              href={href}
              target={channel === 'WHATSAPP' ? '_blank' : undefined}
              rel="noopener noreferrer"
              onClick={() => onOpen(text)}
            >
              Open {CHANNEL_LABEL[channel]}
            </a>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
