"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { useLanguage } from "@/contexts/LanguageContext";

interface LogoutButtonProps {
  className?: string;
}

function formatUserName(user: User | null): string | null {
  if (!user) return null;
  const metadataName = String(user.user_metadata?.full_name || "").trim();
  if (metadataName) return metadataName;
  return user.email ?? null;
}

export function LogoutButton({ className }: LogoutButtonProps) {
  const router = useRouter();
  const { t } = useLanguage();
  const [pending, setPending] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const resolveInitialUser = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!active) return;
        setUserName(formatUserName(data.user));
      } catch (error) {
        console.error("[LogoutButton] Failed to get user", error);
      }
    };

    resolveInitialUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUserName(formatUserName(session?.user ?? null));
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleLogout() {
    if (pending) return;
    setPending(true);
    try {
      await supabase.auth.signOut();
      // Use window.location.href for a hard redirect to ensure clean state
      window.location.href = "/auth/login";
    } catch (error) {
      console.error("[LogoutButton] Failed to sign out", error);
    } finally {
      setPending(false);
    }
  }

  const label = pending ? t("common", "loading", "Loading...") : t("common", "logout", "Logout");
  const nameLabel = userName || t("common", "unknownUser", "Not signed in");

  return (
    <span
      style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
      aria-live="polite"
    >
      <span style={{ fontWeight: 600, color: "var(--home-ink, inherit)" }}>{nameLabel}</span>
      <button
        type="button"
        className={className || ""}
        onClick={handleLogout}
        disabled={pending}
        aria-busy={pending}
      >
        {label}
      </button>
    </span>
  );
}
