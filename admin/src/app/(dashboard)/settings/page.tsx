"use client";

import { useAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/utils";

export default function SettingsPage() {
  const { admin } = useAdmin();

  if (!admin) return null;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <div className="bg-card border border-border rounded-xl p-6 max-w-md space-y-4">
        <div>
          <label className="block text-sm text-muted-foreground">Name</label>
          <p className="font-medium">{admin.name}</p>
        </div>
        <div>
          <label className="block text-sm text-muted-foreground">Email</label>
          <p className="font-medium">{admin.email}</p>
        </div>
        <div>
          <label className="block text-sm text-muted-foreground">Role</label>
          <p className="font-medium capitalize">{admin.role}</p>
        </div>
        <div>
          <label className="block text-sm text-muted-foreground">
            Joined
          </label>
          <p className="font-medium">{formatDate(admin.created_at)}</p>
        </div>
      </div>
    </div>
  );
}
