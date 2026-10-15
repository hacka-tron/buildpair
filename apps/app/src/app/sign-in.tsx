import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { Wordmark } from "../components/kit";
import { useWide } from "../components/shell";
import { Button, ErrorText, Field, Screen } from "../components/ui";
import { authClient } from "../lib/auth";
import { colors, space } from "../lib/theme";

export default function SignIn() {
  const wide = useWide();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const sendCode = async () => {
    if (busy || !email.includes("@")) return;
    setBusy(true);
    setError("");
    const { error } = await authClient.emailOtp.sendVerificationOtp({ email: email.trim(), type: "sign-in" });
    setBusy(false);
    if (error) setError(error.message ?? "Couldn't send the code. Check the email address and try again.");
    else setStep("code");
  };

  const verify = async () => {
    if (busy || code.trim().length !== 6) return;
    setBusy(true);
    setError("");
    const { error } = await authClient.signIn.emailOtp({ email: email.trim(), otp: code.trim() });
    setBusy(false);
    if (error) setError(error.message ?? "That code didn't work. Check it or ask for a new one.");
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: wide ? "center" : "flex-end",
            padding: space.xl,
            paddingBottom: wide ? space.xl : space.xxl,
          }}
        >
          <View style={{ gap: space.lg, maxWidth: 420, width: "100%", alignSelf: "center" }}>
            <Wordmark size={22} />
            <Text
              style={{
                fontSize: 40,
                fontWeight: "800",
                color: colors.ink,
                letterSpacing: -1.6,
                lineHeight: 42,
              }}
            >
              Set goals.{"\n"}Bring people along.
            </Text>
            <Text style={{ fontSize: 16, color: colors.sub, lineHeight: 23 }}>
              Track what you're building and the life around it, with a few people who check in when you go
              quiet.
            </Text>
            <View style={{ height: space.sm }} />
            {step === "email" ? (
              <>
                <Field
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  inputMode="email"
                  placeholder="you@example.com"
                  onSubmitEditing={sendCode}
                />
                <ErrorText>{error}</ErrorText>
                <Button
                  label="Send me a code"
                  onPress={sendCode}
                  busy={busy}
                  disabled={!email.includes("@")}
                />
                <Text style={{ fontSize: 13, color: colors.faint, textAlign: "center" }}>
                  No password. We email you a 6-digit code.
                </Text>
              </>
            ) : (
              <>
                <Text style={{ fontSize: 15, color: colors.sub }}>
                  We sent a 6-digit code to{" "}
                  <Text style={{ fontWeight: "600", color: colors.ink }}>{email.trim()}</Text>. It expires in
                  10 minutes.
                </Text>
                <Field
                  label="Code"
                  value={code}
                  onChangeText={(t) => setCode(t.replace(/\D/g, ""))}
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="123456"
                  onSubmitEditing={verify}
                />
                <ErrorText>{error}</ErrorText>
                <Button label="Sign in" onPress={verify} busy={busy} disabled={code.trim().length !== 6} />
                <Button
                  label="Use a different email"
                  kind="secondary"
                  onPress={() => {
                    setStep("email");
                    setCode("");
                    setError("");
                  }}
                />
              </>
            )}
            <Text style={{ fontSize: 13, color: colors.faint, textAlign: "center" }}>
              Got an invite link? Open it after signing in and you'll land in the space.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
