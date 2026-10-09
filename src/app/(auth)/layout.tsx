import { SiteFooter } from "@/components/layout/footer";
import { SiteHeader } from "@/components/layout/header";

/** Centered auth layout (keeps the global header with the NiMet disclaimer). */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 items-start justify-center px-4 py-10 sm:py-16">
        <div className="w-full max-w-md space-y-6">{children}</div>
      </main>
      <SiteFooter />
    </>
  );
}
