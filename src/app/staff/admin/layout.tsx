import { Suspense } from "react";
import { staffPageGuard } from "../_lib/guard";
import { TableSkeleton } from "../_components/ui";

/** Platform-admin gate (editors get a 404). Every page + action re-checks. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <AdminGate>{children}</AdminGate>
    </Suspense>
  );
}

async function AdminGate({ children }: { children: React.ReactNode }) {
  await staffPageGuard("admin");
  return <>{children}</>;
}
