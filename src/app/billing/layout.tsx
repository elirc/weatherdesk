import { SiteFooter } from "@/components/layout/footer";
import { SiteHeader } from "@/components/layout/header";

export default function BillingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-10">{children}</main>
      <SiteFooter />
    </>
  );
}
