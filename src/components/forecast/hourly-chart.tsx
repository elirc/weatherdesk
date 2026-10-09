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

/**
 * 48 h chart (client island). Labels are pre-formatted in WAT on the server
 * via src/lib/time.ts — this component only draws serialized props.
 */
export type HourlyChartPoint = {
  /** "14:00" */
  label: string;
  /** "Thu, 8 Oct, 14:00" for the tooltip */
  fullLabel: string;
  tempC: number | null;
  rainMm: number | null;
  rainProbPct: number | null;
};

export function HourlyChart({ data }: { data: HourlyChartPoint[] }) {
  if (data.length === 0) return null;
  return (
    <div className="h-56 w-full" role="img" aria-label="Temperature and rain for the next 48 hours">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e4e7" />
          <XAxis dataKey="label" interval={5} tick={{ fontSize: 11 }} tickLine={false} />
          <YAxis
            yAxisId="t"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            unit="°"
            domain={["dataMin - 2", "dataMax + 2"]}
            allowDecimals={false}
          />
          <YAxis
            yAxisId="r"
            orientation="right"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            unit="mm"
            width={44}
            domain={[0, (max: number) => Math.max(2, Math.ceil(max))]}
          />
          <Tooltip
            labelFormatter={(_l, payload) => {
              const p = payload?.[0]?.payload as HourlyChartPoint | undefined;
              return p ? `${p.fullLabel} WAT` : "";
            }}
            formatter={(value, name) => {
              const v = typeof value === "number" ? value : Number(value);
              if (name === "Temperature") return [`${v.toFixed(1)} °C`, name];
              return [`${v.toFixed(1)} mm`, name];
            }}
          />
          <Bar yAxisId="r" dataKey="rainMm" name="Rain" fill="#60a5fa" radius={[2, 2, 0, 0]} />
          <Line
            yAxisId="t"
            dataKey="tempC"
            name="Temperature"
            type="monotone"
            stroke="#ea580c"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
