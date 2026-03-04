import { FormEvent, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const passwordStrength = (password: string) => {
  let score = 0;

  if (password.length >= 8) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 1) return { label: "Weak", width: "w-1/3", tone: "auth-strength-weak" };
  if (score <= 2) return { label: "Fair", width: "w-2/3", tone: "auth-strength-fair" };
  return { label: "Strong", width: "w-full", tone: "auth-strength-strong" };
};

const GoogleLogo = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[18px] w-[18px]" role="img">
    <path
      fill="#EA4335"
      d="M12 10.2v3.9h5.5c-.2 1.2-1.5 3.5-5.5 3.5-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.9 1.5l2.7-2.6C16.8 2.8 14.6 2 12 2 6.5 2 2 6.5 2 12s4.5 10 10 10c5.8 0 9.6-4 9.6-9.6 0-.6-.1-1.2-.2-1.8H12z"
    />
  </svg>
);

const Auth = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  const [activeTab, setActiveTab] = useState<"login" | "signup">("login");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [showSignupPassword, setShowSignupPassword] = useState(false);

  const strength = useMemo(() => passwordStrength(signupPassword), [signupPassword]);

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    });

    setIsLoading(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    navigate("/feed", { replace: true });
  };

  const handleSignup = async (event: FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);

    const { error } = await supabase.auth.signUp({
      email: signupEmail,
      password: signupPassword,
      options: {
        data: {
          full_name: fullName,
          date_of_birth: dateOfBirth,
        },
        emailRedirectTo: `${window.location.origin}/feed`,
      },
    });

    setIsLoading(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    navigate("/feed", { replace: true });
  };

  const handleGoogle = async () => {
    setErrorMessage(null);
    setIsLoading(true);

    const { error, redirected } = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });

    if (redirected) return;

    setIsLoading(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    navigate("/feed", { replace: true });
  };

  if (loading) {
    return <div className="min-h-screen bg-background" />;
  }

  if (user) {
    return <Navigate to="/feed" replace />;
  }

  return (
    <div className="auth-mesh-background flex min-h-screen items-center justify-center px-4 py-8">
      <section className="auth-card auth-card-enter w-full max-w-[440px] rounded-2xl p-8">
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <span className="brand-gradient flex h-12 w-12 items-center justify-center rounded-full text-sm font-semibold text-primary-foreground">
            S
          </span>
          <h1 className="text-xl font-bold">SocialSphere</h1>
        </div>

        <div className="mb-6 grid grid-cols-2 rounded-full bg-muted p-1">
          <button
            type="button"
            onClick={() => {
              setActiveTab("login");
              setErrorMessage(null);
            }}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium transition-all duration-200",
              activeTab === "login" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
            )}
          >
            Log In
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("signup");
              setErrorMessage(null);
            }}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium transition-all duration-200",
              activeTab === "signup" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
            )}
          >
            Sign Up
          </button>
        </div>

        {activeTab === "login" ? (
          <form className="space-y-4" onSubmit={handleLogin}>
            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <Input
                type="email"
                value={loginEmail}
                onChange={(event) => setLoginEmail(event.target.value)}
                className="h-12 rounded-xl"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Password</label>
              <div className="relative">
                <Input
                  type={showLoginPassword ? "text" : "password"}
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                  className="h-12 rounded-xl pr-11"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={showLoginPassword ? "Hide password" : "Show password"}
                >
                  {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <div className="flex justify-end">
                <button type="button" className="text-xs text-primary hover:underline">
                  Forgot password?
                </button>
              </div>
            </div>

            <Button type="submit" disabled={isLoading} className="auth-cta-btn h-12 w-full rounded-full font-semibold">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Log In"}
            </Button>

            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">or</span>
              <span className="h-px flex-1 bg-border" />
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={handleGoogle}
              disabled={isLoading}
              className="h-12 w-full rounded-full border-border bg-card font-medium hover:bg-accent"
            >
              <GoogleLogo />
              Continue with Google
            </Button>
          </form>
        ) : (
          <form className="space-y-4" onSubmit={handleSignup}>
            <div className="space-y-2">
              <label className="text-sm font-medium">Full Name</label>
              <Input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Alex Morgan"
                className="h-12 rounded-xl"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Date of Birth</label>
              <Input
                type="date"
                value={dateOfBirth}
                onChange={(event) => setDateOfBirth(event.target.value)}
                className="h-12 rounded-xl"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <Input
                type="email"
                value={signupEmail}
                onChange={(event) => setSignupEmail(event.target.value)}
                className="h-12 rounded-xl"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Password</label>
              <div className="relative">
                <Input
                  type={showSignupPassword ? "text" : "password"}
                  value={signupPassword}
                  onChange={(event) => setSignupPassword(event.target.value)}
                  className="h-12 rounded-xl pr-11"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowSignupPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={showSignupPassword ? "Hide password" : "Show password"}
                >
                  {showSignupPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className={cn("h-full rounded-full transition-all duration-200", strength.width, strength.tone)} />
              </div>
              <p className="text-xs text-muted-foreground">Strength: {strength.label}</p>
            </div>

            <Button type="submit" disabled={isLoading} className="auth-cta-btn h-12 w-full rounded-full font-semibold">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Account"}
            </Button>
          </form>
        )}

        {errorMessage && (
          <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {errorMessage}
          </div>
        )}
      </section>
    </div>
  );
};

export default Auth;
