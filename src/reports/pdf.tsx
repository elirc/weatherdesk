import type * as ReactPdf from "@react-pdf/renderer";
import type { ReactNode } from "react";
import type { ReportContent, ReportSvg, ReportTableRow } from "./content-types";
import { DISCLAIMER } from "./compute";
import { fmtC, fmtMm } from "./narrative";
import { scaleFor } from "./scales";
import { MAP_ATTRIBUTION, parseMapSvg, SVG_KEY_SCALE } from "./svg-maps";
import { formatLagos } from "@/lib/time";

/**
 * PDF rendering with @react-pdf/renderer. Pure with respect to the DB: takes
 * the stored content + row metadata + resolved branding and returns a Buffer.
 * Maps are REBUILT with react-pdf Svg primitives from the same projected path
 * data as the web SVGs (parseMapSvg), since react-pdf cannot rasterise SVG
 * strings. Standard Helvetica (WinAnsi) — text avoids glyphs outside it.
 *
 * @react-pdf/renderer is loaded with a dynamic import(): it is ESM-only and
 * its dependency @react-pdf/textkit imports '@react-pdf/hyphenate/en-us',
 * a subpath exported only for the "import" condition. Under tsx (worker,
 * seed — the repo is not "type": "module") a static import is transpiled to
 * require() and fails with ERR_PACKAGE_PATH_NOT_EXPORTED.
 */

type RendererModule = typeof ReactPdf;
let R: RendererModule;

async function loadRenderer(): Promise<RendererModule> {
  if (!R) R = await import("@react-pdf/renderer");
  return R;
}

export type PdfBranding = {
  title: string;
  /** org logo bytes (png/jpg) from the storage adapter */
  logo: { data: Buffer; format: "png" | "jpg" } | null;
  organizationName: string | null;
};

export type PdfInput = {
  type: "weekly" | "monthly";
  status: "draft" | "preliminary" | "final";
  content: ReportContent;
  narrative: string;
  publishedAt: Date | null;
  correctionNote: string | null;
  branding: PdfBranding;
};

const C = { ink: "#111111", muted: "#555555", line: "#d9d9d9", accent: "#0f5132", soft: "#f3f6f4" };

const s = {
  page: { paddingTop: 32, paddingHorizontal: 36, paddingBottom: 64, fontFamily: "Helvetica", fontSize: 9.5, color: C.ink },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 2, borderBottomColor: C.accent, paddingBottom: 8, marginBottom: 10 },
  brand: { fontFamily: "Helvetica-Bold", fontSize: 16, color: C.accent },
  brandSub: { fontSize: 8, color: C.muted, marginTop: 2 },
  logo: { width: 90, height: 36, objectFit: "contain" },
  title: { fontFamily: "Helvetica-Bold", fontSize: 14, marginBottom: 2 },
  period: { fontSize: 10, color: C.muted, marginBottom: 8 },
  badge: { fontSize: 8, color: "#7a4b00", backgroundColor: "#fff3cd", paddingVertical: 2, paddingHorizontal: 5, alignSelf: "flex-start", marginBottom: 6 },
  headline: { fontFamily: "Helvetica-Bold", fontSize: 11.5, lineHeight: 1.35, marginBottom: 10 },
  statsRow: { flexDirection: "row", marginBottom: 10 },
  stat: { flex: 1, backgroundColor: C.soft, padding: 6, marginRight: 4 },
  statLabel: { fontSize: 7.5, color: C.muted },
  statValue: { fontFamily: "Helvetica-Bold", fontSize: 12, marginTop: 2 },
  h2: { fontFamily: "Helvetica-Bold", fontSize: 11, color: C.accent, marginTop: 10, marginBottom: 5 },
  para: { lineHeight: 1.4, marginBottom: 6 },
  mapBox: { flexDirection: "row", marginBottom: 8 },
  mapTitle: { fontFamily: "Helvetica-Bold", fontSize: 10, marginBottom: 3 },
  legendItem: { flexDirection: "row", alignItems: "center", marginBottom: 2 },
  swatch: { width: 10, height: 8, borderWidth: 0.5, borderColor: "#999999", marginRight: 4 },
  small: { fontSize: 7.5, color: C.muted },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.line, paddingVertical: 2 },
  th: { fontFamily: "Helvetica-Bold", fontSize: 8 },
  td: { fontSize: 8 },
  footer: { position: "absolute", left: 36, right: 36, bottom: 22, borderTopWidth: 0.5, borderTopColor: C.line, paddingTop: 4 },
  footerText: { fontSize: 7, color: C.muted, lineHeight: 1.3 },
} satisfies Record<string, ReactPdf.Styles[string]>;

const dash = "–";
const n1 = (v: number | null, unit = "") => (v == null ? dash : `${v.toFixed(1)}${unit}`);
const signed = (v: number | null, unit = "") => (v == null ? dash : `${v > 0 ? "+" : ""}${v.toFixed(1)}${unit}`);
const pct = (v: number | null) => (v == null ? dash : `${v}%`);

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <R.View style={s.stat}>
      <R.Text style={s.statLabel}>{label}</R.Text>
      <R.Text style={s.statValue}>{value}</R.Text>
    </R.View>
  );
}

function MapBlock({ map }: { map: ReportSvg }) {
  const parsed = parseMapSvg(map.svg);
  const legend = scaleFor(SVG_KEY_SCALE[map.key] ?? "rain").legend;
  const w = 360;
  const h = (w * parsed.height) / parsed.width;
  return (
    <R.View style={s.mapBox} wrap={false}>
      <R.View>
        <R.Text style={s.mapTitle}>{map.title}</R.Text>
        <R.Svg width={w} height={h} viewBox={`0 0 ${parsed.width} ${parsed.height}`}>
          {parsed.context ? <R.Path d={parsed.context} fill="#efefef" stroke="#bdbdbd" strokeWidth={0.4} /> : null}
          <R.G>
            {parsed.paths.map((p, i) => (
              <R.Path key={i} d={p.d} fill={p.fill} stroke="#ffffff" strokeWidth={0.35} />
            ))}
          </R.G>
        </R.Svg>
        <R.Text style={s.small}>{MAP_ATTRIBUTION}</R.Text>
      </R.View>
      <R.View style={{ marginLeft: 10, marginTop: 40 }}>
        {legend.map((l) => (
          <R.View key={l.label} style={s.legendItem}>
            <R.View style={[s.swatch, { backgroundColor: l.color }]} />
            <R.Text style={s.small}>{l.label}</R.Text>
          </R.View>
        ))}
      </R.View>
    </R.View>
  );
}

function Table({ cols, rows }: { cols: { label: string; flex: number; align?: "right" }[]; rows: string[][] }) {
  return (
    <R.View>
      <R.View style={s.tr} fixed>
        {cols.map((c, i) => (
          <R.Text key={i} style={[s.th, { flex: c.flex, textAlign: c.align ?? "left" }]}>
            {c.label}
          </R.Text>
        ))}
      </R.View>
      {rows.map((r, i) => (
        <R.View key={i} style={s.tr} wrap={false}>
          {r.map((cell, j) => (
            <R.Text key={j} style={[s.td, { flex: cols[j].flex, textAlign: cols[j].align ?? "left" }]}>
              {cell}
            </R.Text>
          ))}
        </R.View>
      ))}
    </R.View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <R.View>
      <R.Text style={s.h2} minPresenceAhead={40}>
        {title}
      </R.Text>
      {children}
    </R.View>
  );
}

export function ReportPdfDocument({ input }: { input: PdfInput }) {
  const { content: c, branding } = input;
  const kind = input.type === "weekly" ? "Weekly weather report" : "Monthly climate report";
  const tableRows = c.table.rows.map((r: ReportTableRow) => [
    r.name,
    n1(r.rainMm),
    pct(r.rainPctOfNormal),
    r.band ?? dash,
    n1(r.meanTmaxC),
    signed(r.tmaxAnomalyC),
  ]);
  return (
    <R.Document title={`${kind} — ${c.scopeLabel} — ${c.periodLabel}`} author={branding.title} creator="WeatherDesk">
      <R.Page size="A4" style={s.page}>
        <R.View style={s.header} fixed>
          <R.View>
            <R.Text style={s.brand}>{branding.title}</R.Text>
            <R.Text style={s.brandSub}>
              {branding.organizationName ? `Prepared for ${branding.organizationName} · ` : ""}Weather intelligence for Nigeria
            </R.Text>
          </R.View>
          {branding.logo ? <R.Image style={s.logo} src={branding.logo} /> : null}
        </R.View>

        <R.Text style={s.title}>
          {kind}: {c.scopeLabel}
        </R.Text>
        <R.Text style={s.period}>
          {c.periodLabel}
          {input.publishedAt ? ` · Published ${formatLagos(input.publishedAt)} WAT` : ""}
        </R.Text>
        {input.status === "preliminary" ? (
          <R.Text style={s.badge}>PRELIMINARY — figures may change when final data arrives</R.Text>
        ) : null}
        {input.correctionNote ? <R.Text style={s.badge}>Correction: {input.correctionNote}</R.Text> : null}

        <R.Text style={s.headline}>{c.headline}</R.Text>

        <R.View style={s.statsRow}>
          <Stat label="Rain (area mean)" value={c.stats.rainTotalMm == null ? dash : fmtMm(c.stats.rainTotalMm)} />
          <Stat label="% of normal" value={pct(c.stats.rainPctOfNormal)} />
          <Stat label="Rainy days (mean)" value={n1(c.stats.rainyDays)} />
          <Stat label="Mean max temp" value={c.stats.meanTmaxC == null ? dash : fmtC(c.stats.meanTmaxC)} />
          <Stat label="Max temp anomaly" value={signed(c.stats.tmaxAnomalyC, " °C")} />
        </R.View>

        <Section title="Summary">
          {input.narrative.split(/\n{2,}/).map((p, i) => (
            <R.Text key={i} style={s.para}>
              {p}
            </R.Text>
          ))}
        </Section>

        <Section title="Maps">
          {c.svgs.map((m) => (
            <MapBlock key={m.key} map={m} />
          ))}
        </Section>

        <Section title="Extremes">
          <Table
            cols={[
              { label: "Wettest", flex: 3 },
              { label: "mm", flex: 1, align: "right" },
              { label: "Driest", flex: 3 },
              { label: "mm", flex: 1, align: "right" },
              { label: "Hottest", flex: 3 },
              { label: "°C", flex: 1, align: "right" },
            ]}
            rows={[0, 1, 2].map((i) => [
              c.extremes.wettest[i]?.name ?? "",
              c.extremes.wettest[i] ? c.extremes.wettest[i].valueMm.toFixed(1) : "",
              c.extremes.driest[i]?.name ?? "",
              c.extremes.driest[i] ? c.extremes.driest[i].valueMm.toFixed(1) : "",
              c.extremes.hottest[i]?.name ?? "",
              c.extremes.hottest[i] ? c.extremes.hottest[i].valueC.toFixed(1) : "",
            ])}
          />
        </Section>

        <Section title={c.scopeLabel === "Nigeria" ? "By state" : "By LGA"}>
          <Table
            cols={[
              { label: "Name", flex: 3 },
              { label: "Rain mm", flex: 1.2, align: "right" },
              { label: "% normal", flex: 1.2, align: "right" },
              { label: "Band", flex: 1.6, align: "right" },
              { label: "Max °C", flex: 1.2, align: "right" },
              { label: "Anom. °C", flex: 1.2, align: "right" },
            ]}
            rows={tableRows}
          />
          <R.Text style={[s.small, { marginTop: 3 }]}>{c.table.unitNote}</R.Text>
        </Section>

        <Section title="Advisories issued">
          {c.alertsIssued.length ? (
            <Table
              cols={[
                { label: "Type", flex: 3 },
                { label: "Count", flex: 1, align: "right" },
              ]}
              rows={c.alertsIssued.map((a) => [a.type.replaceAll("_", " "), String(a.count)])}
            />
          ) : (
            <R.Text style={s.para}>No advisories were issued during the period.</R.Text>
          )}
          <R.Text style={s.small}>Advisories are not official warnings.</R.Text>
        </Section>

        {c.outlook ? (
          <Section title="Outlook — next 7 days">
            <R.Text style={s.para}>{c.outlook.text}</R.Text>
            {c.outlook.days.length ? (
              <Table
                cols={[
                  { label: "Date", flex: 2 },
                  { label: "Rain mm (area mean)", flex: 2, align: "right" },
                  { label: "Max °C (area mean)", flex: 2, align: "right" },
                ]}
                rows={c.outlook.days.map((d) => [d.date, n1(d.rainMm), n1(d.tmaxC)])}
              />
            ) : null}
          </Section>
        ) : null}

        {c.seasonProgress ? (
          <Section title="Rainy-season progress">
            <Table
              cols={[
                { label: "Zone", flex: 1.3 },
                { label: "Status", flex: 5 },
              ]}
              rows={c.seasonProgress.map((z) => [z.zone, z.status])}
            />
          </Section>
        ) : null}

        {c.comingMonth ? (
          <Section title="The coming month">
            <R.Text style={s.para}>{c.comingMonth.text}</R.Text>
          </Section>
        ) : null}

        {c.accuracy ? (
          <Section title="Forecast accuracy">
            <R.Text style={s.para}>{c.accuracy.text}</R.Text>
          </Section>
        ) : null}

        <Section title="Methods and sources">
          <R.Text style={s.para}>{c.methodsNote}</R.Text>
          {c.sources.map((line) => (
            <R.Text key={line} style={s.small}>
              {line}
            </R.Text>
          ))}
        </Section>

        <R.View style={s.footer} fixed>
          <R.Text style={s.footerText}>{DISCLAIMER}</R.Text>
          <R.Text style={s.footerText}>
            Data: Open-Meteo, NASA POWER · Boundaries: geoBoundaries/GRID3 · © OpenStreetMap contributors
          </R.Text>
          <R.Text
            style={[s.footerText, { position: "absolute", right: 0, top: 4 }]}
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          />
        </R.View>
      </R.Page>
    </R.Document>
  );
}

export async function renderPdfBuffer(input: PdfInput): Promise<Buffer> {
  const r = await loadRenderer();
  return r.renderToBuffer(<ReportPdfDocument input={input} />);
}
