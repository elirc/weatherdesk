import type { Metadata } from "next";

/**
 * Bare layout for the embeddable widget — no site header/footer (it sits
 * outside the (public) group). Next.js sets no X-Frame-Options / frame-
 * ancestors by default and next.config.ts adds no headers, so the widget is
 * frameable from any origin.
 */
export const metadata: Metadata = { robots: { index: false } };

export default function WidgetLayout({ children }: { children: React.ReactNode }) {
  return <div className="p-2">{children}</div>;
}
