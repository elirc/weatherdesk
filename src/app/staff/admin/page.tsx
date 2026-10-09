import { redirect } from "next/navigation";

/** /staff/admin → Health (the admin layout has already gated the request). */
export default function AdminIndex() {
  redirect("/staff/admin/health");
}
