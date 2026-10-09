"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const COLORS = ["#2563eb", "#16a34a", "#d97706", "#dc2626", "#7c3aed", "#0891b2", "#64748b"];

/** API calls per organisation per day (stacked). Days are Lagos civil dates (YYYY-MM-DD). */
export function UsageChart({ data, series }: { data: Record<string, string | number>[]; series: { key: string; label: string }[] }) {
  return (
    <div className="h-72 w-full" role="img" aria-label="API calls per organisation per day, last 30 days">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
          <XAxis dataKey="day" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11 }} width={56} allowDecimals={false} />
          <Tooltip formatter={(value, name) => [Number(value).toLocaleString("en-NG"), name]} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} stackId="calls" fill={COLORS[i % COLORS.length]} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
