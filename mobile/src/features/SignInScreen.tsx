/**
 * Sign-in. Layout, logo and type are the web sign-up screen's, ported over.
 *
 * The one deliberate change is the second step: the web build emailed a magic
 * *link*, which on a phone means leaving for Mail and hoping to land back in the
 * app. Here the same email carries a six-digit code typed in place.
 */
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isSupabaseConfigured } from "@/lib/backend/client";
import { sendEmailCode, verifyEmailCode } from "@/lib/backend/auth";
import { APP } from "@/config/app";
import type { LegalDocId } from "@/features/legal/content";
import { Button, Input } from "~/components/ui";
import { MailIcon } from "~/components/icons";
import { LogoMark } from "~/components/Logo";
import { LegalModal } from "./LegalDoc";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SignInScreen() {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [legalDoc, setLegalDoc] = useState<LegalDocId | null>(null);

  const emailValid = EMAIL_RE.test(email.trim());

  const requestCode = async () => {
    if (!emailValid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await sendEmailCode(email);
      setStep("code");
    } catch (e) {
      setError((e as Error)?.message || "Couldn't send the code. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async () => {
    if (code.length < 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      // On success the auth listener in AuthProvider swaps this screen out.
      await verifyEmailCode(email, code);
    } catch (e) {
      setError((e as Error)?.message || "That code didn't work.");
      setBusy(false);
    }
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
            {step === "email" ? "Create your account" : "Check your email"}
          </Text>
          {step === "email" ? (
            <Text className="mt-2 text-[15px] text-chalk-mute">{APP.tagline}</Text>
          ) : (
            <Text className="mt-3 max-w-[20rem] text-center text-[15px] leading-relaxed text-chalk-mute">
              We sent a six-digit code to <Text className="font-medium text-chalk">{email.trim()}</Text>. Enter it below
              to continue.
            </Text>
          )}
        </View>

        {step === "email" ? (
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
              returnKeyType="go"
              onSubmitEditing={requestCode}
            />
            <Button
              variant="primary"
              size="lg"
              fullWidth
              disabled={!emailValid || busy}
              onPress={requestCode}
              leadingIcon={<MailIcon size={18} color="#FFFFFF" />}
            >
              {busy ? "Sending…" : "Continue with email"}
            </Button>
          </View>
        ) : (
          <View className="gap-3">
            <Input
              value={code}
              onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              keyboardType="number-pad"
              autoComplete="sms-otp"
              textContentType="oneTimeCode"
              editable={!busy}
              maxLength={6}
              autoFocus
              returnKeyType="go"
              onSubmitEditing={submitCode}
              className="justify-center"
            />
            <Button variant="primary" size="lg" fullWidth disabled={code.length < 6 || busy} onPress={submitCode}>
              {busy ? "Verifying…" : "Sign in"}
            </Button>
            <Button
              variant="ghost"
              size="lg"
              fullWidth
              disabled={busy}
              onPress={() => {
                setStep("email");
                setCode("");
                setError(null);
              }}
            >
              Use a different email
            </Button>
          </View>
        )}

        {error ? <Text className="mt-4 text-center text-[13px] leading-relaxed text-chalk-soft">{error}</Text> : null}

        <Text className="mt-8 text-center text-[12px] leading-relaxed text-chalk-faint">
          By continuing you agree to the{" "}
          <Text className="underline text-chalk-mute" onPress={() => setLegalDoc("terms")}>
            Terms
          </Text>{" "}
          &amp;{" "}
          <Text className="underline text-chalk-mute" onPress={() => setLegalDoc("privacy")}>
            Privacy Policy
          </Text>
          .
        </Text>
      </ScrollView>

      <LegalModal doc={legalDoc} onClose={() => setLegalDoc(null)} />
    </KeyboardAvoidingView>
  );
}
