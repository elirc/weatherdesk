"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type AccuracySeries = { key: string; label: string; color: string; bold?: boolean };

/** Rain hit-rate (%) by lead day; one line per zone, national in bold. */
export function AccuracyChart({ data, series }: { data: Record<string, number | null>[]; series: AccuracySeries[] }) {
  return (
    <div className="h-72 w-full" role="img" aria-label="Rain hit rate by forecast lead day">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
          <XAxis dataKey="lead" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}d`} />
          <YAxis tick={{ fontSize: 11 }} unit="%" domain={[(min: number) => Math.max(0, Math.floor(min / 10) * 10), 100]} width={48} />
          <Tooltip
            labelFormatter={(v) => `${v} day${Number(v) === 1 ? "" : "s"} ahead`}
            formatter={(value, name) => [`${Number(value).toFixed(0)}%`, name]}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {series.map((s) => (
            <Line
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={s.bold ? 3 : 1.5}
              dot={s.bold}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
