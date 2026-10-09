"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useStaffAction } from "../../_components/use-action";
import { selectClass } from "../../_components/ui";
import { ROLES } from "../../_lib/policy";
import { setUserRoleAction } from "./actions";

export function RoleSelect({ userId, email, role, isSelf }: { userId: string; email: string; role: string; isSelf: boolean }) {
  const [value, setValue] = useState(role);
  const [save, saving] = useStaffAction(setUserRoleAction, `Role updated for ${email}`);
  if (isSelf) {
    return (
      <span className="text-sm" title="You cannot change your own role">
        {role} <span className="text-xs text-muted-foreground">(you)</span>
      </span>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <select value={value} onChange={(e) => setValue(e.target.value)} className={selectClass} aria-label={`Role for ${email}`}>
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      {value !== role && (
        <Button
          size="sm"
          disabled={saving}
          onClick={() => {
            if (window.confirm(`Change ${email} from ${role} to ${value}?`)) save({ userId, role: value });
          }}
        >
          Save
        </Button>
      )}
    </div>
  );
}
