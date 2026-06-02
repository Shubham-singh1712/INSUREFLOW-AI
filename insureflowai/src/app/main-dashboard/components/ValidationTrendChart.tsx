'use client';
import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { TrendingUp } from 'lucide-react';

const data = [
  { date: 'Apr 24', successRate: 84.2, rejectionRate: 9.1 },
  { date: 'Apr 25', successRate: 86.5, rejectionRate: 8.3 },
  { date: 'Apr 26', successRate: 83.1, rejectionRate: 10.2 },
  { date: 'Apr 27', successRate: 87.4, rejectionRate: 7.8 },
  { date: 'Apr 28', successRate: 88.9, rejectionRate: 7.1 },
  { date: 'Apr 29', successRate: 86.2, rejectionRate: 8.4 },
  { date: 'Apr 30', successRate: 89.7, rejectionRate: 6.9 },
  { date: 'May 1', successRate: 90.1, rejectionRate: 6.4 },
  { date: 'May 2', successRate: 88.4, rejectionRate: 7.2 },
  { date: 'May 3', successRate: 91.2, rejectionRate: 5.8 },
  { date: 'May 4', successRate: 89.6, rejectionRate: 6.1 },
  { date: 'May 5', successRate: 90.8, rejectionRate: 5.9 },
  { date: 'May 6', successRate: 92.1, rejectionRate: 5.2 },
  { date: 'May 7', successRate: 91.4, rejectionRate: 4.7 },
];

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) => {
  if (!active || !payload) return null;
  return (
    <div className="bg-white border border-border rounded-xl shadow-card-md px-4 py-3 text-sm">
      <p className="font-semibold text-foreground mb-2">{label}</p>
      {payload.map((p) => (
        <div key={`tooltip-${p.name}`} className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-semibold text-foreground font-tabular">{p.value}%</span>
        </div>
      ))}
    </div>
  );
};

export default function ValidationTrendChart() {
  return (
    <div className="card p-5 h-full">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="section-header">Validation Trend — 14 Days</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Success rate vs. TPA rejection rate
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-semibold text-success">
          <TrendingUp size={13} />
          +7.2% this period
        </div>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="gradSuccess" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--success)" stopOpacity={0.15} />
              <stop offset="95%" stopColor="var(--success)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradRejection" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--danger)" stopOpacity={0.12} />
              <stop offset="95%" stopColor="var(--danger)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
            axisLine={false}
            tickLine={false}
            interval={1}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
            axisLine={false}
            tickLine={false}
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }}
          />
          <Area
            type="monotone"
            dataKey="successRate"
            name="Validation Success"
            stroke="var(--success)"
            strokeWidth={2}
            fill="url(#gradSuccess)"
            dot={false}
            activeDot={{ r: 4, fill: 'var(--success)' }}
          />
          <Area
            type="monotone"
            dataKey="rejectionRate"
            name="TPA Rejection Rate"
            stroke="var(--danger)"
            strokeWidth={2}
            fill="url(#gradRejection)"
            dot={false}
            activeDot={{ r: 4, fill: 'var(--danger)' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
