"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/** Compact tuples keep the client payload small: [date, rainMm, tmaxC]. */
export type HistoryPoint = [string, number | null, number | null];

export function HistoryChart({ points }: { points: HistoryPoint[] }) {
  const data = points.map(([date, rainMm, tmaxC]) => ({ date, rainMm, tmaxC }));
  return (
    <div className="h-64 w-full" role="img" aria-label="Daily rainfall bars and maximum temperature line">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={40} tickFormatter={(d: string) => d.slice(2, 7)} />
          <YAxis yAxisId="rain" tick={{ fontSize: 11 }} unit=" mm" width={56} />
          <YAxis yAxisId="temp" orientation="right" tick={{ fontSize: 11 }} unit="°C" width={44} domain={["dataMin - 1", "dataMax + 1"]} />
          <Tooltip
            labelFormatter={(d) => String(d)}
            formatter={(value, name) => {
              const v = typeof value === "number" ? value : Number(value);
              return name === "Rain" ? [`${v.toFixed(1)} mm`, name] : [`${v.toFixed(1)} °C`, name];
            }}
          />
          <Bar yAxisId="rain" dataKey="rainMm" name="Rain" fill="#3b82f6" isAnimationActive={false} />
          <Line yAxisId="temp" dataKey="tmaxC" name="Max temp" stroke="#ef4444" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
