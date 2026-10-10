import { useState } from "react";
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { Button, ErrorText, Field, Screen, styles } from "../components/ui";
import { authClient } from "../lib/auth";
import { colors, space } from "../lib/theme";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const sendCode = async () => {
    setBusy(true);
    setError("");
    const { error } = await authClient.emailOtp.sendVerificationOtp({ email: email.trim(), type: "sign-in" });
    setBusy(false);
    if (error) setError(error.message ?? "Couldn't send the code. Check the email address and try again.");
    else setStep("code");
  };

  const verify = async () => {
    setBusy(true);
    setError("");
    const { error } = await authClient.signIn.emailOtp({ email: email.trim(), otp: code.trim() });
    setBusy(false);
    if (error) setError(error.message ?? "That code didn't work. Check it or ask for a new one.");
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View
          style={{
            flex: 1,
            justifyContent: "flex-end",
            padding: space.xl,
            gap: space.lg,
            maxWidth: 440,
            width: "100%",
            alignSelf: "center",
          }}
        >
          <Text style={{ fontSize: 22, fontWeight: "700", color: colors.ink, letterSpacing: -0.5 }}>
            Buildpair
          </Text>
          <Text
            style={{ fontSize: 32, fontWeight: "700", color: colors.ink, letterSpacing: -1, lineHeight: 36 }}
          >
            Set goals.{"\n"}Bring people along.
          </Text>
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
              <Button label="Send me a code" onPress={sendCode} busy={busy} disabled={!email.includes("@")} />
            </>
          ) : (
            <>
              <Text style={styles.sub}>We sent a 6-digit code to {email.trim()}.</Text>
              <Field
                label="Code"
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                onSubmitEditing={verify}
              />
              <ErrorText>{error}</ErrorText>
              <Button label="Sign in" onPress={verify} busy={busy} disabled={code.trim().length !== 6} />
              <Button label="Use a different email" kind="secondary" onPress={() => setStep("email")} />
            </>
          )}
          <Text style={[styles.sub, { textAlign: "center", fontSize: 11 }]}>
            Got an invite link? Open it after signing in and you'll land in the space.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
