/**
 * Sign-in. Two steps, both inside the app: ask for the email, then verify the
 * six-digit code that arrives. No bouncing out to Mail and back, which is the
 * part of the web magic-link flow that felt broken on a phone.
 */
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isSupabaseConfigured } from "@/lib/backend/client";
import { sendEmailCode, verifyEmailCode } from "@/lib/backend/auth";
import { APP } from "@/config/app";
import { Button } from "~/components/ui";
import { WalletIcon } from "~/components/icons";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SignInScreen() {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailValid = EMAIL_RE.test(email.trim());

  const requestCode = async () => {
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
        <Text className="text-center text-[15px] font-semibold text-chalk">Backend not configured</Text>
        <Text className="mt-2 text-center text-[14px] leading-relaxed text-chalk-mute">
          Create <Text className="font-semibold text-chalk">mobile/.env</Text> with EXPO_PUBLIC_SUPABASE_URL and
          EXPO_PUBLIC_SUPABASE_ANON_KEY, then restart with {"`npx expo start -c`"}.
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-ink-950"
      style={{ paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }}
    >
      <View className="flex-1 justify-center px-7">
        <View className="h-16 w-16 items-center justify-center rounded-[22px] border border-line bg-ink-800">
          <WalletIcon size={28} />
        </View>

        {step === "email" ? (
          <>
            <Text className="mt-6 text-[28px] font-bold leading-tight tracking-tight text-chalk">
              Welcome to {APP.name}
            </Text>
            <Text className="mt-2 text-[15px] leading-relaxed text-chalk-mute">
              Enter your email and we&apos;ll send you a six-digit code to sign in.
            </Text>

            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@email.com"
              placeholderTextColor="#AEAEB4"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              editable={!busy}
              onSubmitEditing={emailValid && !busy ? requestCode : undefined}
              className="mt-2 rounded-field border border-line-strong bg-ink-800 px-4 py-4 text-[16px] text-chalk"
            />

            <View className="mt-4">
              <Button fullWidth size="lg" disabled={!emailValid || busy} onPress={requestCode}>
                {busy ? "Sending…" : "Send code"}
              </Button>
            </View>
          </>
        ) : (
          <>
            <Text className="mt-6 text-[28px] font-bold leading-tight tracking-tight text-chalk">Check your email</Text>
            <Text className="mt-2 text-[15px] leading-relaxed text-chalk-mute">
              We sent a six-digit code to <Text className="font-semibold text-chalk">{email.trim()}</Text>.
            </Text>

            <TextInput
              value={code}
              onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
              placeholderTextColor="#AEAEB4"
              keyboardType="number-pad"
              autoComplete="sms-otp"
              textContentType="oneTimeCode"
              editable={!busy}
              maxLength={6}
              autoFocus
              className="mt-6 rounded-field border border-line-strong bg-ink-800 px-4 py-4 text-center text-[26px] font-semibold tracking-[8px] text-chalk"
            />

            <View className="mt-4">
              <Button fullWidth size="lg" disabled={code.length < 6 || busy} onPress={submitCode}>
                {busy ? "Verifying…" : "Sign in"}
              </Button>
            </View>
            <View className="mt-3">
              <Button
                fullWidth
                variant="secondary"
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
          </>
        )}

        {error ? <Text className="mt-4 text-[13px] leading-relaxed text-chalk-soft">{error}</Text> : null}
        {busy ? <ActivityIndicator className="mt-4" color="#0A0A0A" /> : null}

        <Text className="mt-8 text-[12px] leading-relaxed text-chalk-faint">
          By continuing you agree to the Terms of Service and acknowledge the Privacy Policy.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}
