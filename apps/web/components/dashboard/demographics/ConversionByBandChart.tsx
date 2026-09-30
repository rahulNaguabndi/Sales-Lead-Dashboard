'use client';
import { useState } from 'react';
import type { DemographicsResponse } from '@leaddesk/shared';
import { BAR_COLOR } from './palette';
import { SuppressedMark } from './SuppressedMark';
import { ChartCard, ViewToggle, type View } from './ViewToggle';

const HATCH = 'repeating-linear-gradient(45deg, transparent 0 4px, rgba(100,116,139,0.3) 4px 5px)';

export function ConversionByBandChart({ data }: { data: DemographicsResponse }) {
  const [view, setView] = useState<View>('chart');
  const min = data.thresholds.conversionMinClosed;
  const vals = data.conversion.flatMap((c) => (c.suppressed ? [] : [c.conversionPct]));
  const max = Math.max(10, ...vals, data.orgConversionPct ?? 0);
  const H = 160;
  const avgTop = data.orgConversionPct == null ? null : H - (data.orgConversionPct / max) * H + 20;

  return (
    <ChartCard
      testId="demographics-conversion"
      title="Conversion by age band"
      insight={data.insights.conversion}
      toggle={<ViewToggle view={view} onChange={setView} />}
    >
      {view === 'chart' ? (
        <div>
          <div className="relative flex items-end gap-3" style={{ height: H + 24 }}>
            {avgTop !== null && (
              <div
                className="pointer-events-none absolute left-0 right-0 border-t border-dashed border-slate-400"
                style={{ top: avgTop }}
                title={`Organization average ${data.orgConversionPct}%`}
              />
            )}
            {data.conversion.map((c) => (
              <div key={c.band} className="flex h-full flex-1 flex-col items-center justify-end">
                {c.suppressed ? (
                  <div
                    className="w-full rounded-t border border-dashed"
                    style={{ height: 24, backgroundImage: HATCH }}
                    title={`Not enough data (n = ${c.closed}, min ${min})`}
                  />
                ) : (
                  <>
                    <span className="text-xs font-medium">{c.conversionPct}%</span>
                    <div
                      className="w-full rounded-t"
                      style={{ height: Math.max(2, (c.conversionPct / max) * H), background: BAR_COLOR.light }}
                      title={`${c.band}: ${c.won} won of ${c.closed} closed (${c.conversionPct}%)`}
                    />
                  </>
                )}
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-3 text-center text-xs">
            {data.conversion.map((c) => (
              <div key={c.band} className="flex-1">
                <div>{c.band}</div>
                <div className="text-muted-foreground">n = {c.closed}</div>
              </div>
            ))}
          </div>
          {data.orgConversionPct != null && (
            <p className="mt-2 text-xs text-muted-foreground">
              Dashed line: organization average {data.orgConversionPct}%
            </p>
          )}
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th scope="col">Age band</th>
              <th scope="col">Closed</th>
              <th scope="col">Won</th>
              <th scope="col">Conversion</th>
            </tr>
          </thead>
          <tbody>
            {data.conversion.map((c) => (
              <tr key={c.band}>
                <th scope="row" className="text-left font-normal">
                  {c.band}
                </th>
                <td>{c.closed}</td>
                {c.suppressed ? (
                  <td colSpan={2}>
                    <SuppressedMark n={c.closed} min={min} />
                  </td>
                ) : (
                  <>
                    <td>{c.won}</td>
                    <td>{c.conversionPct}%</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ChartCard>
  );
}
