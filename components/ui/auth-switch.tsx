import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { 
  User, 
  Mail, 
  Lock, 
  Eye, 
  EyeOff, 
  ArrowRight, 
  ShieldCheck, 
  KeyRound, 
  CheckCircle2 
} from "lucide-react";

export interface AuthSwitchProps {
  defaultMode?: "login" | "register";
  onLogin?: (credentials: { email: string; password: string }) => void;
  onRegister?: (data: { name: string; email: string; password: string }) => void;
  onSocialLogin?: (provider: string) => void;
  className?: string;
  bgImageUrl?: string;
}

export const Component = ({
  defaultMode = "login",
  onLogin,
  onRegister,
  onSocialLogin,
  className,
  bgImageUrl = "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1200&q=80"
}: AuthSwitchProps) => {
  const [mode, setMode] = useState<"login" | "register">(defaultMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!email || !password) {
      setError("Please fill in all required fields.");
      return;
    }

    if (mode === "register") {
      if (!name) {
        setError("Please enter your full citizen name.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
      if (password.length < 6) {
        setError("Password must be at least 6 characters.");
        return;
      }
    }

    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      if (mode === "login") {
        setSuccess("Login authenticated successfully! Redirecting...");
        onLogin?.({ email, password });
      } else {
        setSuccess("Citizen account created! Redirecting to login...");
        onRegister?.({ name, email, password });
      }
    }, 800);
  };

  return (
    <div
      className={cn(
        "relative min-h-[640px] w-full max-w-md overflow-hidden rounded-2xl border border-border/40 bg-card/90 shadow-2xl backdrop-blur-xl transition-all duration-300",
        className
      )}
    >
      {/* Dynamic Background Image Vignette */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center opacity-10 transition-all duration-700 hover:scale-105"
        style={{ backgroundImage: `url('${bgImageUrl}')` }}
      />
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-background/95 via-background/85 to-background" />

      {/* Content Container */}
      <div className="relative z-10 flex flex-col p-6 sm:p-8">
        {/* Header with Civic Brand Seal */}
        <div className="flex items-center justify-between pb-6 border-b border-border/40">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-sm">
              <ShieldCheck className="h-5 w-5 text-sky-500" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-foreground font-sans">
                ChronicAI
              </h2>
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-mono">
                Civic Access Portal
              </span>
            </div>
          </div>

        </div>

        {/* Animated Segmented Auth Mode Switcher */}
        <div className="mt-6 flex rounded-xl bg-muted/60 p-1 border border-border/40">
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setError(null);
              setSuccess(null);
            }}
            className={cn(
              "flex-1 rounded-lg py-2.5 text-sm font-semibold transition-all duration-200",
              mode === "login"
                ? "bg-background text-foreground shadow-sm border border-border/50"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("register");
              setError(null);
              setSuccess(null);
            }}
            className={cn(
              "flex-1 rounded-lg py-2.5 text-sm font-semibold transition-all duration-200",
              mode === "register"
                ? "bg-background text-foreground shadow-sm border border-border/50"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Create Account
          </button>
        </div>

        {/* Title & Prompt */}
        <div className="mt-6 mb-4">
          <h3 className="text-xl font-bold tracking-tight text-foreground">
            {mode === "login" ? "Citizen Verification" : "Register Citizen Record"}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            {mode === "login"
              ? "Access district sitreps, report incidents, and monitor operations."
              : "Create an authorized municipal account for rapid civic response."}
          </p>
        </div>

        {/* Status Alerts */}
        {error && (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive flex items-center gap-2">
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-400 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            <span>{success}</span>
          </div>
        )}

        {/* Interactive Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "register" && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Full Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Inspector John Doe"
                  className="w-full rounded-lg border border-border/60 bg-background/70 pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all"
                  required
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Citizen Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full rounded-lg border border-border/60 bg-background/70 pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-xs font-medium text-foreground">Password</label>
              {mode === "login" && (
                <button
                  type="button"
                  className="text-xs text-sky-400 hover:underline"
                  onClick={() => alert("Please contact your municipal administrator for password recovery.")}
                >
                  Forgot?
                </button>
              )}
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-border/60 bg-background/70 pl-9 pr-10 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {mode === "register" && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Confirm Password</label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-border/60 bg-background/70 pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all"
                  required
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-6 flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-sky-500 active:scale-[0.99] disabled:opacity-50 transition-all"
          >
            {isLoading ? (
              <span className="animate-pulse">Authenticating Record...</span>
            ) : (
              <>
                <span>{mode === "login" ? "Sign In to ChronicAI" : "Complete Registration"}</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        {/* Footer Security Badge */}
        <div className="mt-8 pt-4 border-t border-border/40 text-center">
          <p className="text-[11px] text-muted-foreground font-mono flex items-center justify-center gap-1.5">
            <Lock className="h-3 w-3 text-sky-400" />
            <span>256-bit Encrypted Municipal Verification Protocol</span>
          </p>
        </div>
      </div>
    </div>
  );
};

export const AuthSwitch = Component;
export default Component;
