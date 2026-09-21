/**
 * Sign-in / sign-up. Layout, logo and type are the web sign-up screen's, ported.
 *
 * Email and password, with no verification step: you type both and you're in.
 * See `auth.native.ts` for why (and for the one Supabase setting it depends on).
 */
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isSupabaseConfigured } from "@/lib/backend/client";
import { MIN_PASSWORD_LENGTH, signInWithPassword, signUpWithPassword } from "@/lib/backend/auth";
import { isEmailShaped, normalizeEmail, suggestEmailFix } from "@/lib/email";
import { APP } from "@/config/app";
import type { LegalDocId } from "@/features/legal/content";
import { Button, Input } from "~/components/ui";
import { MailIcon } from "~/components/icons";
import { LogoMark } from "~/components/Logo";
import { LegalModal } from "./LegalDoc";

export function SignInScreen() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<"signUp" | "signIn">("signUp");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [legalDoc, setLegalDoc] = useState<LegalDocId | null>(null);

  const creating = mode === "signUp";
  const emailValid = isEmailShaped(email);
  const passwordValid = password.length >= MIN_PASSWORD_LENGTH;
  const canSubmit = emailValid && passwordValid && !busy;

  // Offered, never enforced. Nothing here can tell whether a mailbox exists —
  // this only catches a slip in the address you'd reset your password with.
  const typo = creating && emailValid ? suggestEmailFix(email) : null;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      // On success the auth listener in AuthProvider swaps this screen out.
      const address = normalizeEmail(email);
      if (creating) await signUpWithPassword(address, password);
      else await signInWithPassword(address, password);
    } catch (e) {
      const message = (e as Error)?.message || "Something went wrong. Try again.";
      // Supabase deliberately returns the same error for a wrong password and an
      // unknown email, so point at both rather than guessing.
      setError(
        /invalid login credentials/i.test(message)
          ? "That email and password don't match an account."
          : /already registered|already exists/i.test(message)
            ? "That email already has an account — switch to Sign in."
            : message,
      );
      setBusy(false);
    }
  };

  const switchMode = () => {
    setMode(creating ? "signIn" : "signUp");
    setError(null);
  };

  if (!isSupabaseConfigured) {
    return (
      <View className="flex-1 items-center justify-center bg-ink-950 px-8" style={{ paddingTop: insets.top }}>
        <LogoMark size={44} />
        <Text className="mt-5 text-center text-[15px] font-semibold text-chalk">Backend not configured</Text>
        <Text className="mt-2 text-center text-[14px] leading-relaxed text-chalk-mute">
          Create <Text className="font-medium text-chalk">mobile/.env</Text> with EXPO_PUBLIC_SUPABASE_URL and
          EXPO_PUBLIC_SUPABASE_ANON_KEY, then restart with {"`npx expo start -c`"}.
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 bg-ink-950">
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          paddingHorizontal: 24,
          paddingTop: insets.top + 40,
          paddingBottom: insets.bottom + 40,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="mb-10 items-center">
          <LogoMark size={44} />
          <Text className="mt-5 text-[30px] font-bold tracking-tight text-chalk">
            {creating ? "Create your account" : "Welcome back"}
          </Text>
          <Text className="mt-2 text-[15px] text-chalk-mute">
            {creating ? APP.tagline : `Sign in to continue to ${APP.name}`}
          </Text>
        </View>

        <View className="gap-3">
          <Input
            value={email}
            onChangeText={setEmail}
            placeholder="Email address"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            editable={!busy}
          />

          {typo ? (
            <Pressable onPress={() => setEmail(typo)} disabled={busy} className="active:opacity-60">
              <Text className="text-[12px] leading-relaxed text-chalk-mute">
                Did you mean <Text className="font-semibold text-chalk underline">{typo}</Text>?
              </Text>
            </Pressable>
          ) : null}

          <Input
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            secureTextEntry={!show}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete={creating ? "new-password" : "current-password"}
            textContentType={creating ? "newPassword" : "password"}
            editable={!busy}
            returnKeyType="go"
            onSubmitEditing={submit}
            trailing={
              <Pressable onPress={() => setShow((v) => !v)} hitSlop={8} className="active:opacity-60">
                <Text className="text-[13px] font-medium text-chalk-mute">{show ? "Hide" : "Show"}</Text>
              </Pressable>
            }
          />

          {creating && !passwordValid ? (
            <Text className="text-[12px] text-chalk-faint">At least {MIN_PASSWORD_LENGTH} characters.</Text>
          ) : null}

          {creating ? (
            <Text className="text-[12px] leading-relaxed text-chalk-faint">
              Use an address you can actually open. It&apos;s the only way back into your account if you forget your
              password.
            </Text>
          ) : null}

          <Button
            variant="primary"
            size="lg"
            fullWidth
            disabled={!canSubmit}
            onPress={submit}
            leadingIcon={<MailIcon size={18} color="#FFFFFF" />}
          >
            {busy ? (creating ? "Creating…" : "Signing in…") : creating ? "Create account" : "Sign in"}
          </Button>
        </View>

        {error ? <Text className="mt-4 text-center text-[13px] leading-relaxed text-chalk-soft">{error}</Text> : null}

        <Pressable onPress={switchMode} disabled={busy} className="mt-5 items-center py-2 active:opacity-60">
          <Text className="text-[14px] text-chalk-mute">
            {creating ? "Already have an account? " : "New here? "}
            <Text className="font-semibold text-chalk">{creating ? "Sign in" : "Create one"}</Text>
          </Text>
        </Pressable>

        <Text className="mt-6 text-center text-[12px] leading-relaxed text-chalk-faint">
          By continuing you agree to the{" "}
          <Text className="text-chalk-mute underline" onPress={() => setLegalDoc("terms")}>
            Terms
          </Text>{" "}
          &amp;{" "}
          <Text className="text-chalk-mute underline" onPress={() => setLegalDoc("privacy")}>
            Privacy Policy
          </Text>
          .
        </Text>
      </ScrollView>

      <LegalModal doc={legalDoc} onClose={() => setLegalDoc(null)} />
    </KeyboardAvoidingView>
  );
}
