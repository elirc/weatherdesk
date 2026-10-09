import Link from "next/link";

/** Global 404 for URLs outside any route group. */
export default function RootNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold">We can’t find that page</h1>
      <p className="max-w-md text-muted-foreground">
        Try searching for a state, LGA or town from the WeatherDesk home page.
      </p>
      <Link
        href="/"
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        Go to WeatherDesk
      </Link>
    </div>
  );
}
