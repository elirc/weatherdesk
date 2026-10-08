export const revalidate = 600;

/** Placeholder home — replaced by the public-site agent (A3) with the LGA map. */
export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-semibold">WeatherDesk</h1>
      <p className="mt-2 text-muted-foreground">
        Weather for all of Nigeria — build in progress.
      </p>
    </div>
  );
}
