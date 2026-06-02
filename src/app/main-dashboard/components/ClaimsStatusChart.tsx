'use client';
import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

const data = [
  { status: 'Ready for Submission', count: 18, color: 'var(--success)' },
  { status: 'Under Review', count: 12, color: 'var(--warning)' },
  { status: 'OCR Failed', count: 2, color: 'var(--danger)' },
  { status: 'Submitted', count: 31, color: 'var(--muted-foreground)' },
  { status: 'Approved', count: 24, color: 'var(--primary)' },
];

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) => {
  if (!active || !payload) return null;
  return (
    <div className="bg-white border border-border rounded-xl shadow-card-md px-3 py-2 text-sm">
      <p className="font-semibold text-foreground">{label}</p>
      <p className="text-muted-foreground font-tabular">{payload[0]?.value} claims</p>
    </div>
  );
};

export default function ClaimsStatusChart() {
  return (
    <div className="card p-5 h-full">
      <div className="mb-5">
        <h3 className="section-header">Claims by Status</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Current distribution across all stages
        </p>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }} barSize={28}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border)"
            horizontal={true}
            vertical={false}
          />
          <XAxis
            dataKey="status"
            tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--muted)', opacity: 0.5 }} />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {data.map((entry) => (
              <Cell key={`cell-${entry.status}`} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-3">
        {data.map((d) => (
          <div key={`legend-${d.status}`} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
            <span className="text-xs text-muted-foreground truncate">{d.status}</span>
            <span className="text-xs font-semibold text-foreground ml-auto font-tabular">
              {d.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
