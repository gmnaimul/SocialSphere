import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type ProfileRow = Tables<"profiles">;

type AuthContextValue = {
  user: User | null;
  profile: ProfileRow | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const applyProfilePreferences = (profile: ProfileRow | null) => {
  if (!profile) return;

  if (profile.theme === "dark") {
    document.documentElement.classList.add("dark");
  } else if (profile.theme === "light") {
    document.documentElement.classList.remove("dark");
  }

  const fontSize =
    profile.font_size === "small" ? "13px" : profile.font_size === "large" ? "17px" : "15px";

  document.documentElement.style.setProperty("--app-font-size", fontSize);
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  const setOffline = useCallback(async (userId: string) => {
    await supabase.from("profiles").update({ is_online: false }).eq("id", userId);
  }, []);

  const signOut = useCallback(async () => {
    if (user?.id) {
      await setOffline(user.id);
    }

    await supabase.auth.signOut();
  }, [setOffline, user?.id]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setUser(nextSession?.user ?? null);
      if (!nextSession?.user) {
        setProfile(null);
      }
      setAuthLoading(false);
    });

    void supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }

    let isMounted = true;
    setProfileLoading(true);

    const fetchProfile = async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (!isMounted) return;
      if (error) {
        setProfileLoading(false);
        return;
      }

      let nextProfile = (data as ProfileRow | null) ?? null;

      if (!nextProfile) {
        const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
        const fallbackName =
          (typeof metadata.full_name === "string" && metadata.full_name.trim()) ||
          (typeof metadata.name === "string" && metadata.name.trim()) ||
          user.email?.split("@")[0] ||
          "New user";

        const birthDate = typeof metadata.date_of_birth === "string" ? metadata.date_of_birth : null;
        const avatarUrl =
          typeof metadata.avatar_url === "string"
            ? metadata.avatar_url
            : typeof metadata.picture === "string"
              ? metadata.picture
              : null;

        const { data: createdProfile } = await supabase
          .from("profiles")
          .upsert(
            {
              id: user.id,
              full_name: fallbackName,
              date_of_birth: birthDate,
              avatar_url: avatarUrl,
            },
            { onConflict: "id" },
          )
          .select("*")
          .maybeSingle();

        if (!isMounted) return;
        nextProfile = (createdProfile as ProfileRow | null) ?? null;
      }

      setProfile(nextProfile);
      applyProfilePreferences(nextProfile);
      setProfileLoading(false);
    };

    const setOnline = async () => {
      await supabase.from("profiles").update({ is_online: true }).eq("id", user.id);
    };

    const handleBeforeUnload = () => {
      void setOffline(user.id);
    };

    const profileChannel = supabase
      .channel(`profile-self-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          const nextProfile = payload.new as ProfileRow;
          setProfile(nextProfile);
          applyProfilePreferences(nextProfile);
        },
      )
      .subscribe();

    void fetchProfile();
    void setOnline();
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      isMounted = false;
      window.removeEventListener("beforeunload", handleBeforeUnload);
      supabase.removeChannel(profileChannel);
    };
  }, [setOffline, user?.id]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, profile, loading: authLoading || profileLoading, signOut }),
    [authLoading, profile, profileLoading, signOut, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
};
