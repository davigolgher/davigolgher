import { useState } from "react";
import { APP } from "@/config/app";
import { Button, Input } from "@/components/ui";
import { LogoMark } from "@/components/brand/Logo";
import { MailIcon } from "@/components/icons";
import { useFlow } from "@/features/flow/FlowProvider";

/**
 * Sign-up gate shown before the app. Email / Google / Apple.
 * NOTE: real accounts need a backend — these proceed locally for now.
 */
export function SignUpScreen() {
  const { signUp } = useFlow();
  const [email, setEmail] = useState("");

  return (
    <div className="app-shell flex min-h-full flex-col justify-center px-6 py-10">
      <div className="mb-10 text-center">
        <LogoMark size={44} className="mx-auto text-chalk" />
        <h1 className="mt-5 text-3xl font-bold tracking-tight text-chalk">Create your account</h1>
        <p className="mt-2 text-[15px] text-chalk-mute">{APP.tagline}</p>
      </div>

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (email.trim()) signUp(email.trim());
        }}
      >
        <Input type="email" inputMode="email" autoComplete="email" placeholder="Email address" aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Button type="submit" variant="primary" size="lg" fullWidth disabled={!email.trim()} leadingIcon={<MailIcon size={18} />}>
          Continue with email
        </Button>
      </form>

      <div className="my-5 flex items-center gap-3 text-[12px] uppercase tracking-wide text-chalk-faint">
        <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
      </div>

      <div className="space-y-3">
        <Button variant="secondary" size="lg" fullWidth onClick={() => signUp()} leadingIcon={<GoogleGlyph />}>
          Continue with Google
        </Button>
        <Button variant="secondary" size="lg" fullWidth onClick={() => signUp()} leadingIcon={<AppleGlyph />}>
          Continue with Apple
        </Button>
      </div>

      <p className="mt-8 text-center text-[12px] leading-relaxed text-chalk-faint">
        By continuing you agree to the Terms &amp; Privacy Policy.
        <br />
        Real Google / Apple sign-in connects with the backend.
      </p>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.05l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

function AppleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.37 12.6c.02 2.5 2.19 3.33 2.22 3.34-.02.06-.35 1.2-1.15 2.37-.69 1.02-1.4 2.03-2.53 2.05-1.1.02-1.46-.65-2.72-.65s-1.66.63-2.7.67c-1.09.04-1.92-1.1-2.62-2.11-1.42-2.06-2.5-5.83-1.05-8.38.72-1.26 2.02-2.06 3.42-2.08 1.07-.02 2.08.72 2.72.72.65 0 1.87-.89 3.16-.76.54.02 2.05.22 3.02 1.64-.08.05-1.8 1.05-1.79 3.13M14.3 5.24c.57-.7.96-1.66.85-2.62-.83.03-1.83.55-2.42 1.24-.53.61-1 1.6-.87 2.54.92.07 1.87-.47 2.44-1.16" />
    </svg>
  );
}
