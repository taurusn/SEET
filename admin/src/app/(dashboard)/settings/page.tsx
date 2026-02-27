"use client";

import { useEffect, useState } from "react";
import { useAdmin } from "@/lib/auth";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { CheckCircle, Plus, Shield, Eye } from "lucide-react";

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export default function SettingsPage() {
  const { admin } = useAdmin();
  const [admins, setAdmins] = useState<AdminUser[]>([]);

  // Password change
  const [pwForm, setPwForm] = useState({ current_password: "", new_password: "", confirm: "" });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Invite admin
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: "", password: "", name: "", role: "admin" });
  const [inviteSaving, setInviteSaving] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    api.get<AdminUser[]>("/api/v1/admin/admins").then(setAdmins).catch(() => {});
  }, []);

  if (!admin) return null;

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    if (pwForm.new_password !== pwForm.confirm) {
      setPwMsg({ type: "error", text: "Passwords do not match" });
      return;
    }
    if (pwForm.new_password.length < 8) {
      setPwMsg({ type: "error", text: "Password must be at least 8 characters" });
      return;
    }
    setPwSaving(true);
    try {
      await api.patch("/api/v1/admin/me/password", {
        current_password: pwForm.current_password,
        new_password: pwForm.new_password,
      });
      setPwMsg({ type: "success", text: "Password updated successfully" });
      setPwForm({ current_password: "", new_password: "", confirm: "" });
    } catch (err) {
      setPwMsg({ type: "error", text: err instanceof Error ? err.message : "Failed" });
    } finally {
      setPwSaving(false);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteMsg(null);
    setInviteSaving(true);
    try {
      await api.post("/api/v1/admin/admins", inviteForm);
      setInviteMsg({ type: "success", text: "Admin created successfully" });
      setInviteForm({ email: "", password: "", name: "", role: "admin" });
      setShowInvite(false);
      api.get<AdminUser[]>("/api/v1/admin/admins").then(setAdmins);
    } catch (err) {
      setInviteMsg({ type: "error", text: err instanceof Error ? err.message : "Failed" });
    } finally {
      setInviteSaving(false);
    }
  }

  const isAdmin = admin.role === "admin" || admin.role === "superadmin";

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <div className="space-y-6 max-w-2xl">
        {/* Profile Card */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Profile</h2>
          <div className="grid grid-cols-2 gap-4">
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
              <label className="block text-sm text-muted-foreground">Joined</label>
              <p className="font-medium">{formatDate(admin.created_at)}</p>
            </div>
          </div>
        </div>

        {/* Change Password */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-4">Change Password</h2>
          <form onSubmit={handlePasswordChange} className="space-y-3">
            <input
              type="password"
              placeholder="Current password"
              value={pwForm.current_password}
              onChange={(e) => setPwForm({ ...pwForm, current_password: e.target.value })}
              className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              required
            />
            <input
              type="password"
              placeholder="New password (min 8 chars)"
              value={pwForm.new_password}
              onChange={(e) => setPwForm({ ...pwForm, new_password: e.target.value })}
              className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              required
              minLength={8}
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={pwForm.confirm}
              onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
              className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              required
            />
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={pwSaving}
                className="px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {pwSaving ? "Saving..." : "Update Password"}
              </button>
              {pwMsg && (
                <span className={`text-sm font-medium ${pwMsg.type === "success" ? "text-green-600" : "text-red-500"}`}>
                  {pwMsg.text}
                </span>
              )}
            </div>
          </form>
        </div>

        {/* Team Management */}
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Team</h2>
            {isAdmin && (
              <button
                onClick={() => setShowInvite(!showInvite)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Admin
              </button>
            )}
          </div>

          {/* Invite form */}
          {showInvite && (
            <form onSubmit={handleInvite} className="mb-4 p-4 rounded-lg border border-primary/30 bg-primary/5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Name"
                  value={inviteForm.name}
                  onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
                  className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  required
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                  className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  required
                />
                <input
                  type="password"
                  placeholder="Password (min 8)"
                  value={inviteForm.password}
                  onChange={(e) => setInviteForm({ ...inviteForm, password: e.target.value })}
                  className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  required
                  minLength={8}
                />
                <select
                  value={inviteForm.role}
                  onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
                  className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="admin">Admin</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={inviteSaving}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {inviteSaving ? "Creating..." : "Create"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowInvite(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
                {inviteMsg && (
                  <span className={`text-xs font-medium ${inviteMsg.type === "success" ? "text-green-600" : "text-red-500"}`}>
                    {inviteMsg.text}
                  </span>
                )}
              </div>
            </form>
          )}

          {/* Admin list */}
          <div className="space-y-2">
            {admins.map((a) => (
              <div key={a.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    {a.role === "viewer" ? (
                      <Eye className="w-4 h-4 text-primary" />
                    ) : (
                      <Shield className="w-4 h-4 text-primary" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{a.name}</p>
                    <p className="text-xs text-muted-foreground">{a.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted capitalize">
                    {a.role}
                  </span>
                  {a.id === admin.id && (
                    <span className="text-xs text-primary font-medium">You</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
