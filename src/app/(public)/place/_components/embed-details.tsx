import Link from "next/link";
import { embedSnippet, widgetPath, type WidgetKind } from "@/components/forecast/embed-snippet";
import { env } from "@/lib/env";

/** "Embed" disclosure on place pages with the copy-paste iframe snippet. */
export function EmbedDetails({ kind, id, name }: { kind: WidgetKind; id: string; name: string }) {
  const snippet = embedSnippet({ origin: env.APP_URL, kind, id, name });
  return (
    <details className="rounded-lg border px-4 py-3 text-sm">
      <summary className="cursor-pointer font-medium">Embed this forecast on your site</summary>
      <p className="mt-2 text-muted-foreground">
        Paste this into your web page. Preview:{" "}
        <Link href={widgetPath(kind, id)} className="underline">
          widget
        </Link>
        .
      </p>
      <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap break-all">
        <code>{snippet}</code>
      </pre>
    </details>
  );
}
