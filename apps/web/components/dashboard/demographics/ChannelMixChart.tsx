'use client';
import { useState } from 'react';
import { CHANNELS, type DemographicsResponse } from '@leaddesk/shared';
import { CHANNEL_COLORS } from './palette';
import { SuppressedMark } from './SuppressedMark';
import { ChartCard, ViewToggle, type View } from './ViewToggle';

const LABEL = { CALL: 'Call', WHATSAPP: 'WhatsApp', SMS: 'SMS', EMAIL: 'Email' } as const;

export function ChannelMixChart({ data }: { data: DemographicsResponse }) {
  const [view, setView] = useState<View>('chart');
  const min = data.thresholds.channelMinLeads;
  return (
    <ChartCard
      testId="demographics-channel"
      title="Preferred channel by age band"
      insight={data.insights.channelMix}
      toggle={<ViewToggle view={view} onChange={setView} />}
    >
      <ul className="mb-2 flex flex-wrap gap-3 text-xs" aria-label="Legend">
        {CHANNELS.map((ch) => (
          <li key={ch} className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: CHANNEL_COLORS[ch].light }} />
            {LABEL[ch]}
          </li>
        ))}
      </ul>
      {view === 'chart' ? (
        <div className="space-y-2">
          {data.channelMix.map((m) => (
            <div key={m.band} className="flex items-center gap-2 text-xs">
              <div className="w-12 shrink-0">{m.band}</div>
              {m.suppressed ? (
                <SuppressedMark n={m.n} min={min} className="flex-1" />
              ) : (
                <div className="flex h-6 flex-1 gap-0.5" title={`Counted once per lead (n = ${m.n})`}>
                  {CHANNELS.map((ch) =>
                    m.shares[ch] > 0 ? (
                      <div
                        key={ch}
                        className="flex items-center justify-center overflow-hidden text-[11px] text-white"
                        style={{ width: `${m.shares[ch]}%`, background: CHANNEL_COLORS[ch].light }}
                        title={`${LABEL[ch]}: ${m.shares[ch]}%`}
                      >
                        {m.shares[ch] >= 8 ? `${Math.round(m.shares[ch])}%` : ''}
                      </div>
                    ) : null,
                  )}
                </div>
              )}
              <div className="w-14 shrink-0 text-right text-muted-foreground">n = {m.n}</div>
            </div>
          ))}
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th scope="col">Age band</th>
              <th scope="col">n</th>
              {CHANNELS.map((ch) => (
                <th key={ch} scope="col">
                  {LABEL[ch]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.channelMix.map((m) => (
              <tr key={m.band}>
                <th scope="row" className="text-left font-normal">
                  {m.band}
                </th>
                <td>{m.n}</td>
                {m.suppressed ? (
                  <td colSpan={4}>
                    <SuppressedMark n={m.n} min={min} />
                  </td>
                ) : (
                  CHANNELS.map((ch) => <td key={ch}>{m.shares[ch]}%</td>)
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        Each lead is counted once, under its customer&apos;s preferred channel.
      </p>
    </ChartCard>
  );
}
