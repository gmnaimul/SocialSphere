import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, Check, HelpCircle, Lock, Moon, Palette, Sun, User } from "lucide-react";
import { appToast } from "@/lib/app-toast";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type SettingsSection = "appearance" | "account" | "privacy" | "help";
type ThemeMode = "light" | "dark";
type FontSizeMode = "small" | "default" | "large";

const sectionItems: Array<{ id: SettingsSection; label: string; icon: typeof Palette }> = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "account", label: "Account", icon: User },
  { id: "privacy", label: "Privacy", icon: Lock },
  { id: "help", label: "Help", icon: HelpCircle },
];

const fontMap: Record<FontSizeMode, string> = {
  small: "12px",
  default: "15px",
  large: "18px",
};

const applyTheme = (theme: ThemeMode) => {
  document.documentElement.classList.toggle("dark", theme === "dark");
};

const applyFontSize = (fontSize: FontSizeMode) => {
  document.documentElement.style.setProperty("--app-font-size", fontMap[fontSize]);
};

const SettingsPage = () => {
  const navigate = useNavigate();
  const { user, profile, signOut, loading } = useAuth();

  const [activeSection, setActiveSection] = useState<SettingsSection>("appearance");
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [fontSize, setFontSize] = useState<FontSizeMode>("default");
  const [isLogoutOpen, setIsLogoutOpen] = useState(false);

  useEffect(() => {
    if (!profile) return;

    const nextTheme: ThemeMode = profile.theme === "dark" ? "dark" : "light";
    const nextFont: FontSizeMode =
      profile.font_size === "small" || profile.font_size === "large" ? profile.font_size : "default";

    setTheme(nextTheme);
    setFontSize(nextFont);
    applyTheme(nextTheme);
    applyFontSize(nextFont);
  }, [profile]);

  const updatePreferenceMutation = useMutation({
    mutationFn: async (payload: Partial<{ theme: ThemeMode; font_size: FontSizeMode }>) => {
      if (!user?.id) throw new Error("You must be signed in.");
      const { error } = await supabase.from("profiles").update(payload).eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      appToast.settingsSaved();
    },
    onError: (error: Error) => {
      appToast.error(error);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await signOut();
    },
    onSuccess: () => {
      navigate("/auth", { replace: true });
    },
    onError: (error: Error) => appToast.error(error),
  });

  const handleThemeChange = (next: ThemeMode) => {
    const previous = theme;
    setTheme(next);
    applyTheme(next);

    updatePreferenceMutation.mutate(
      { theme: next },
      {
        onError: () => {
          setTheme(previous);
          applyTheme(previous);
        },
      },
    );
  };

  const handleFontSizeChange = (next: FontSizeMode) => {
    const previous = fontSize;
    setFontSize(next);
    applyFontSize(next);

    updatePreferenceMutation.mutate(
      { font_size: next },
      {
        onError: () => {
          setFontSize(previous);
          applyFontSize(previous);
        },
      },
    );
  };

  const activeSectionLabel = useMemo(
    () => sectionItems.find((section) => section.id === activeSection)?.label ?? "Appearance",
    [activeSection],
  );

  if (loading) {
    return <div className="min-h-[calc(100dvh-7rem)] bg-background" />;
  }

  return (
    <div className="min-h-[calc(100dvh-7rem)]">
      <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <h1 className="mb-4 text-xl font-bold">Settings</h1>
          <nav className="space-y-1.5">
            {sectionItems.map(({ id, label, icon: Icon }) => {
              const isActive = activeSection === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveSection(id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border-l-[3px] border-transparent px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "border-primary bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="font-medium">{label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <section className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-3 lg:hidden">
            <p className="mb-2 text-xs text-muted-foreground">Section</p>
            <select
              value={activeSection}
              onChange={(event) => setActiveSection(event.target.value as SettingsSection)}
              className="h-10 w-full rounded-full border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              aria-label="Select settings section"
            >
              {sectionItems.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.label}
                </option>
              ))}
            </select>
          </div>

          {activeSection === "appearance" ? (
            <div className="space-y-4">
              <header>
                <h2 className="text-2xl font-bold">Appearance</h2>
                <p className="mt-1 text-sm text-muted-foreground">Customise how SocialSphere looks and feels for you</p>
              </header>

              <article className="rounded-2xl border border-border bg-card p-4">
                <h3 className="font-semibold">Theme</h3>
                <p className="mt-1 text-sm text-muted-foreground">Switch between light and dark mode</p>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleThemeChange("light")}
                    className={cn(
                      "relative rounded-xl border bg-background p-3 text-left transition-colors duration-150",
                      theme === "light" ? "border-2 border-primary" : "border-border",
                    )}
                  >
                    {theme === "light" ? (
                      <span className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-3 w-3" />
                      </span>
                    ) : null}
                    <div className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                      <Sun className="h-4 w-4" />
                    </div>
                    <p className="text-sm font-semibold">Light</p>
                    <div className="mt-2 rounded-lg border border-border bg-card p-2">
                      <div className="h-2 w-2/3 rounded bg-muted" />
                      <div className="mt-2 h-8 rounded bg-muted" />
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleThemeChange("dark")}
                    className={cn(
                      "relative rounded-xl border bg-secondary p-3 text-left transition-colors duration-150",
                      theme === "dark" ? "border-2 border-primary" : "border-border",
                    )}
                  >
                    {theme === "dark" ? (
                      <span className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-3 w-3" />
                      </span>
                    ) : null}
                    <div className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-background">
                      <Moon className="h-4 w-4" />
                    </div>
                    <p className="text-sm font-semibold">Dark</p>
                    <div className="mt-2 rounded-lg border border-border bg-background p-2">
                      <div className="h-2 w-2/3 rounded bg-muted" />
                      <div className="mt-2 h-8 rounded bg-muted" />
                    </div>
                  </button>
                </div>
              </article>

              <article className="rounded-2xl border border-border bg-card p-4">
                <h3 className="font-semibold">Text Size</h3>
                <p className="mt-1 text-sm text-muted-foreground">Adjust the reading size across the app</p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={fontSize === "small" ? "default" : "outline"}
                    className="rounded-full"
                    onClick={() => handleFontSizeChange("small")}
                  >
                    Small <span style={{ fontSize: "12px" }}>(Aa)</span>
                  </Button>
                  <Button
                    type="button"
                    variant={fontSize === "default" ? "default" : "outline"}
                    className="rounded-full"
                    onClick={() => handleFontSizeChange("default")}
                  >
                    Default <span style={{ fontSize: "15px" }}>(Aa)</span>
                  </Button>
                  <Button
                    type="button"
                    variant={fontSize === "large" ? "default" : "outline"}
                    className="rounded-full"
                    onClick={() => handleFontSizeChange("large")}
                  >
                    Large <span style={{ fontSize: "18px" }}>(Aa)</span>
                  </Button>
                </div>

                <div className="mt-4 rounded-xl border border-border bg-background p-3" style={{ fontSize: fontMap[fontSize] }}>
                  The quick brown fox jumps over the lazy dog. This is how your text will appear across SocialSphere.
                </div>
              </article>

              <article className="mt-6 flex flex-col justify-between gap-4 rounded-2xl border border-destructive/20 bg-card p-4 sm:flex-row sm:items-center">
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-5 w-5 text-destructive" />
                  <div>
                    <p className="font-semibold text-destructive">Log Out</p>
                    <p className="text-xs text-muted-foreground">You&apos;ll be signed out and redirected to the login page.</p>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="destructive"
                  className="rounded-full"
                  onClick={() => setIsLogoutOpen(true)}
                >
                  Log Out
                </Button>
              </article>
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-card p-6 text-center">
              <h2 className="text-xl font-semibold">{activeSectionLabel}</h2>
              <p className="mt-2 text-sm text-muted-foreground">Coming soon</p>
            </div>
          )}
        </section>
      </div>

      <AlertDialog open={isLogoutOpen} onOpenChange={setIsLogoutOpen}>
        <AlertDialogContent className="rounded-2xl border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to log out?</AlertDialogTitle>
            <AlertDialogDescription>You&apos;ll need to sign back in to access your account.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                logoutMutation.mutate();
              }}
            >
              Log Out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SettingsPage;
