import type { Metadata } from "next";
import Link from "next/link";

import {
  DeleteAccount,
  PasswordSettings,
  SessionSettings,
  SettingsCard,
  UsernameSettings,
} from "@/components/settings/settings-forms";
import { apiGetAsViewer, requireMember } from "@/lib/server-api";
import { AnimeHeading } from "@/components/anime-heading";

export const metadata: Metadata = { title: "Account settings", robots: { index: false } };

export default async function SettingsPage() {
  // Which ways this member can sign in: "credential" (a password) and/or "google".
  // Requested alongside the sign-in check rather than after it.
  const [user, accounts] = await Promise.all([
    requireMember("/settings"),
    apiGetAsViewer<{ providerId: string }[]>("/api/auth/list-accounts"),
  ]);
  const providers = new Set((accounts ?? []).map((a) => a.providerId));
  const hasPassword = providers.has("credential");
  const username = user.username ?? "";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-1">
        <AnimeHeading jp="設定" className="text-5xl">
          Settings
        </AnimeHeading>
        <p className="text-muted">
          Signed in as <strong className="text-ink">{user.email}</strong>
          {providers.has("google") && " with Google"}.{" "}
          <Link href={`/u/${username}`} className="font-semibold text-link hover:underline">
            View your profile
          </Link>
        </p>
      </header>

      <SettingsCard
        title="Username"
        description="How the club sees you, and the address of your profile."
      >
        <UsernameSettings current={user.displayUsername ?? username} />
      </SettingsCard>

      <SettingsCard title="Password">
        <PasswordSettings hasPassword={hasPassword} />
      </SettingsCard>

      <SettingsCard
        title="Devices"
        description="Signed in on a shared or lost device? Sign it out from here. You'll stay signed in on this one."
      >
        <SessionSettings />
      </SettingsCard>

      <SettingsCard title="Delete account" danger>
        <DeleteAccount username={username} hasPassword={hasPassword} />
      </SettingsCard>
    </div>
  );
}
