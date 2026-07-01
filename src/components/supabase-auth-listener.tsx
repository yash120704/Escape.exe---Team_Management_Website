"use client";
import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { isAllowedEmailDomain } from "@/lib/auth-domain";

export function SupabaseAuthListener({ onLogin }: { onLogin?: (user: any) => void }) {
  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        if (!isAllowedEmailDomain(session.user.email)) {
          supabase.auth.signOut();
          return;
        }
        if (onLogin) onLogin(session.user);
      }
    });
    return () => {
      listener.subscription.unsubscribe();
    };
  }, [onLogin]);
  return null;
}
