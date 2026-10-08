import Link from "next/link";

/**
 * Global footer: NiMet disclaimer (every page — CONVENTIONS rule 13) and data
 * source attribution (rule 10). Keep lightweight — it renders on slow phones.
 */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t bg-muted/30 text-sm text-muted-foreground">
      <div className="mx-auto max-w-6xl px-4 py-6 space-y-3">
        <p className="font-medium">
          WeatherDesk is an independent information service. It is not affiliated with the
          Nigerian Meteorological Agency (NiMet). Advisories are automatic and are not
          official weather warnings.
        </p>
        <p>
          Forecast data by{" "}
          <a href="https://open-meteo.com/" className="underline" rel="noopener">
            Open-Meteo
          </a>
          . History and climate normals by{" "}
          <a href="https://power.larc.nasa.gov/" className="underline" rel="noopener">
            NASA POWER
          </a>
          . Boundaries by{" "}
          <a href="https://www.geoboundaries.org/" className="underline" rel="noopener">
            geoBoundaries
          </a>{" "}
          and settlements by{" "}
          <a href="https://grid3.org/" className="underline" rel="noopener">
            GRID3
          </a>
          . Map ©{" "}
          <a href="https://www.openstreetmap.org/copyright" className="underline" rel="noopener">
            OpenStreetMap
          </a>{" "}
          contributors.
        </p>
        <nav className="flex flex-wrap gap-x-4 gap-y-1">
          <Link href="/about" className="underline">
            About &amp; methods
          </Link>
          <Link href="/accuracy" className="underline">
            Forecast accuracy
          </Link>
          <Link href="/reports" className="underline">
            Reports
          </Link>
          <Link href="/alerts" className="underline">
            Alerts
          </Link>
          <Link href="/api-docs" className="underline">
            API
          </Link>
        </nav>
      </div>
    </footer>
  );
}
