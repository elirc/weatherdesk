"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type NormalsChartPoint = {
  label: string;
  rainMm: number | null;
  tmaxC: number | null;
  tminC: number | null;
};

/** Monthly normals: rain bars (mm, left axis) + tmax/tmin lines (°C, right axis). */
export function NormalsChart({ data }: { data: NormalsChartPoint[] }) {
  return (
    <div className="h-72 w-full" role="img" aria-label="Monthly rainfall bars with maximum and minimum temperature lines">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} />
          <YAxis yAxisId="rain" tick={{ fontSize: 11 }} unit=" mm" width={56} />
          <YAxis yAxisId="temp" orientation="right" tick={{ fontSize: 11 }} unit="°C" width={44} domain={["dataMin - 2", "dataMax + 2"]} />
          <Tooltip
            formatter={(value, name) => {
              const v = typeof value === "number" ? value : Number(value);
              return name === "Rain" ? [`${v.toFixed(1)} mm`, name] : [`${v.toFixed(1)} °C`, name];
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar yAxisId="rain" dataKey="rainMm" name="Rain" fill="#3b82f6" radius={[3, 3, 0, 0]} />
          <Line yAxisId="temp" dataKey="tmaxC" name="Max temp" stroke="#ef4444" strokeWidth={2} dot={false} />
          <Line yAxisId="temp" dataKey="tminC" name="Min temp" stroke="#f59e0b" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
