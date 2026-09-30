'use client';
import { useState } from 'react';
import { VEHICLES, type DemographicsResponse } from '@leaddesk/shared';
import { RAMP, inkOn, rampStep } from './palette';
import { ChartCard, ViewToggle, type View } from './ViewToggle';

const nameOf = (slug: string) => VEHICLES.find((v) => v.slug === slug)?.name ?? slug;

export function ModelInterestHeatmap({ data }: { data: DemographicsResponse }) {
  const [view, setView] = useState<View>('chart');
  const [counts, setCounts] = useState(false);
  const { models, rows } = data.modelInterest;
  const min = data.thresholds.cellMinCount;
  const maxPct = Math.max(0, ...rows.flatMap((r) => r.cells.flatMap((c) => (c.suppressed ? [] : [c.sharePct]))));

  return (
    <ChartCard
      testId="demographics-models"
      title="Model interest by age band"
      insight={data.insights.modelInterest}
      toggle={
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs">
            <input type="checkbox" checked={counts} onChange={(e) => setCounts(e.target.checked)} />
            Show counts
          </label>
          <ViewToggle view={view} onChange={setView} />
        </div>
      }
    >
      {view === 'chart' ? (
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0.5 text-xs">
            <thead>
              <tr>
                <th scope="col" className="text-left font-normal">
                  Age band
                </th>
                {models.map((m) => (
                  <th key={m} scope="col" className="font-normal">
                    {nameOf(m)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.band}>
                  <th scope="row" className="text-left font-normal">
                    {r.band}
                  </th>
                  {r.cells.map((c) => {
                    if (c.suppressed) {
                      return (
                        <td
                          key={c.model}
                          tabIndex={0}
                          className="rounded border border-dashed text-center text-muted-foreground"
                          title={`Fewer than ${min} leads`}
                        >
                          –
                        </td>
                      );
                    }
                    const fill = RAMP[rampStep(c.sharePct, maxPct)]!;
                    return (
                      <td
                        key={c.model}
                        tabIndex={0}
                        className="rounded p-2 text-center"
                        style={{ background: fill, color: inkOn(fill) }}
                        title={`${nameOf(c.model)}, ${r.band}: ${c.count} leads (${c.sharePct}% of the band)`}
                      >
                        {counts ? c.count : `${Math.round(c.sharePct)}%`}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
            Lower
            {RAMP.map((c) => (
              <span key={c} className="inline-block h-3 w-5" style={{ background: c }} />
            ))}
            Higher share of band
          </div>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th scope="col">Age band</th>
              {models.map((m) => (
                <th key={m} scope="col">
                  {nameOf(m)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.band}>
                <th scope="row" className="text-left font-normal">
                  {r.band}
                </th>
                {r.cells.map((c) => (
                  <td key={c.model}>{c.suppressed ? `Not enough data (min ${min})` : `${c.count} (${c.sharePct}%)`}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ChartCard>
  );
}
