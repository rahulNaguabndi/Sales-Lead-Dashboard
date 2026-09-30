'use client';

import { useRouter } from 'next/navigation';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  DashboardFilters,
  FunnelResponse,
  LeadsOverTimeResponse,
  LostReasonsResponse,
  SourcesResponse,
  StageAgingResponse,
} from '@leaddesk/shared';
import { buildInboxHref } from '@/lib/dashboard-href';

type Ctx = { filters: DashboardFilters };
const COLORS = [
  'var(--dash-1)',
  'var(--dash-2)',
  'var(--dash-3)',
  'var(--dash-4)',
  'var(--dash-5)',
  'var(--dash-6)',
];
const H = 240;

function SimpleTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full text-sm tabular-nums">
      <thead className="text-left text-xs text-muted-foreground">
        <tr>
          {head.map((h) => (
            <th key={h} className="py-1 pr-3">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j} className="py-1 pr-3">
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export const FunnelTable = ({ data }: { data: FunnelResponse }) => (
  <SimpleTable
    head={['Stage', 'Reached', 'Currently here']}
    rows={data.stages.map((s) => [s.stage, s.reached, s.current])}
  />
);

export function FunnelChart({ data, filters }: Ctx & { data: FunnelResponse }) {
  const router = useRouter();
  return (
    <div style={{ height: H }}>
      <ResponsiveContainer>
        <BarChart data={data.stages} layout="vertical" margin={{ left: 24 }}>
          <CartesianGrid horizontal={false} strokeOpacity={0.2} />
          <XAxis type="number" allowDecimals={false} />
          <YAxis type="category" dataKey="stage" width={96} />
          <Tooltip formatter={(v, n) => [v, n === 'reached' ? 'Reached' : 'Currently here']} />
          <Bar
            dataKey="reached"
            cursor="pointer"
            onClick={(d: { stage?: string }) =>
              d.stage && router.push(buildInboxHref(filters, data.period, { stage: d.stage }))
            }
          >
            {data.stages.map((_, i) => (
              <Cell key={i} fill="var(--dash-1)" fillOpacity={1 - i * 0.12} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export const StageAgingTable = ({ data }: { data: StageAgingResponse }) => (
  <SimpleTable
    head={['Stage', 'Avg days', 'Target', 'Leads']}
    rows={data.rows.map((r) => [
      r.stage,
      r.avgDays === null ? '—' : r.avgDays.toFixed(1),
      r.targetDays,
      r.n,
    ])}
  />
);

export function StageAgingChart({ data }: { data: StageAgingResponse }) {
  return (
    <div style={{ height: H }}>
      <ResponsiveContainer>
        <BarChart data={data.rows} layout="vertical" margin={{ left: 24 }}>
          <CartesianGrid horizontal={false} strokeOpacity={0.2} />
          <XAxis type="number" unit=" d" />
          <YAxis type="category" dataKey="stage" width={96} />
          <Tooltip formatter={(v) => [`${Number(v).toFixed(1)} days`, 'Average']} />
          <Bar dataKey="avgDays">
            {data.rows.map((r) => (
              <Cell
                key={r.stage}
                fill={
                  r.avgDays !== null && r.avgDays > r.targetDays
                    ? 'var(--dash-bad)'
                    : 'var(--dash-6)'
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export const SourcesTable = ({ data }: { data: SourcesResponse }) => (
  <SimpleTable
    head={['Source', 'Leads', 'Won', 'Lost', 'Win rate']}
    rows={data.rows.map((r) => [
      r.source,
      r.leads,
      r.won,
      r.lost,
      r.winRatePct === null ? '—' : `${r.winRatePct.toFixed(1)}%`,
    ])}
  />
);

export function SourcePerformanceChart({ data, filters }: Ctx & { data: SourcesResponse }) {
  const router = useRouter();
  const go = (d: { source?: string }) =>
    d.source && router.push(buildInboxHref(filters, data.period, { source: d.source }));
  return (
    <div className="grid grid-cols-2 gap-2" style={{ height: H }}>
      <ResponsiveContainer>
        <BarChart data={data.rows} layout="vertical" margin={{ left: 24 }}>
          <XAxis type="number" allowDecimals={false} />
          <YAxis type="category" dataKey="source" width={96} />
          <Tooltip />
          <Bar dataKey="leads" name="Leads" fill="var(--dash-1)" cursor="pointer" onClick={go} />
        </BarChart>
      </ResponsiveContainer>
      <ResponsiveContainer>
        <BarChart data={data.rows} layout="vertical">
          <XAxis type="number" unit="%" domain={[0, 100]} />
          <YAxis type="category" dataKey="source" hide />
          <Tooltip formatter={(v) => `${Number(v).toFixed(1)}%`} />
          {data.orgWinRatePct !== null && (
            <ReferenceLine x={data.orgWinRatePct} stroke="var(--dash-6)" strokeDasharray="4 2" />
          )}
          <Bar dataKey="winRatePct" name="Win rate" fill="var(--dash-2)" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export const LeadsOverTimeTable = ({ data }: { data: LeadsOverTimeResponse }) => (
  <SimpleTable
    head={['Date', ...data.groups, 'Total']}
    rows={data.rows.map((r) => [r.d, ...data.groups.map((g) => Number(r[g] ?? 0)), r.total])}
  />
);

export function LeadsOverTimeChart({ data }: { data: LeadsOverTimeResponse }) {
  return (
    <div style={{ height: H }}>
      <ResponsiveContainer>
        <BarChart data={data.rows}>
          <CartesianGrid vertical={false} strokeOpacity={0.2} />
          <XAxis dataKey="d" tickFormatter={(d: string) => d.slice(5)} minTickGap={16} />
          <YAxis allowDecimals={false} />
          <Tooltip cursor={{ fillOpacity: 0.1 }} />
          <Legend />
          {data.groups.map((g, i) => (
            <Bar key={g} dataKey={g} stackId="s" fill={COLORS[i % COLORS.length]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export const LostReasonsTable = ({ data }: { data: LostReasonsResponse }) => (
  <SimpleTable
    head={['Reason', 'Count', 'Share']}
    rows={data.rows.map((r) => [r.reason, r.count, `${r.pct.toFixed(1)}%`])}
  />
);

export function LostReasonsChart({ data }: { data: LostReasonsResponse }) {
  return (
    <div style={{ height: H }}>
      <ResponsiveContainer>
        <BarChart data={data.rows} layout="vertical" margin={{ left: 24 }}>
          <XAxis type="number" allowDecimals={false} />
          <YAxis type="category" dataKey="reason" width={120} />
          <Tooltip
            formatter={(v, _n, p) => [
              `${v} (${(p.payload as { pct: number }).pct.toFixed(1)}%)`,
              'Lost',
            ]}
          />
          <Bar dataKey="count" fill="var(--dash-3)" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TouchesPerDayChart({ series }: { series: { d: string; v: number }[] }) {
  return (
    <div style={{ height: H }}>
      <ResponsiveContainer>
        <BarChart data={series}>
          <CartesianGrid vertical={false} strokeOpacity={0.2} />
          <XAxis dataKey="d" tickFormatter={(d: string) => d.slice(5)} minTickGap={16} />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Bar dataKey="v" name="Touches" fill="var(--dash-1)" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export const TouchesTable = ({ series }: { series: { d: string; v: number }[] }) => (
  <SimpleTable head={['Date', 'Touches']} rows={series.map((p) => [p.d, p.v])} />
);
