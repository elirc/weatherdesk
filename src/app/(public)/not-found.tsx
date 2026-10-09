import Link from "next/link";
import { Button } from "@/components/ui/button";

/** Rendered when a place, report or other public resource is not found. */
export default function PublicNotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="mt-2 text-2xl font-semibold">We can’t find that page</h1>
      <p className="mt-3 text-muted-foreground">
        The place or report you’re looking for doesn’t exist or may have been
        unpublished. Try searching for a state, LGA or town from the home page.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link href="/">Search for a place</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/reports">Browse reports</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/alerts">Active advisories</Link>
        </Button>
      </div>
    </div>
  );
}
