import { SiteFooter } from "@/components/layout/footer";
import { SiteHeader } from "@/components/layout/header";

export default function ApiDocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
      <SiteFooter />
    </>
  );
}
