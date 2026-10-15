import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { Wordmark } from "../components/kit";
import { useWide } from "../components/shell";
import { Button, ErrorText, Field, Screen } from "../components/ui";
import { authClient } from "../lib/auth";
import { colors, space } from "../lib/theme";

type Step = "sign-in" | "sign-up" | "confirm" | "forgot" | "reset";

const MIN_PASSWORD = 8;

/** Plain words for the errors people can hit here. */
function plain(error: { code?: string; message?: string } | null, fallback: string): string {
  const known: Record<string, string> = {
    INVALID_EMAIL_OR_PASSWORD: "That email and password don't match. Check them, or reset your password.",
    INVALID_EMAIL: "That email doesn't look right. Check it and try again.",
    INVALID_OTP: "That code isn't right. Check the email, or ask for a new code.",
    OTP_EXPIRED: "That code has expired. Ask for a new one.",
    TOO_MANY_ATTEMPTS: "Too many wrong codes. Ask for a new one.",
    PASSWORD_TOO_SHORT: `Use at least ${MIN_PASSWORD} characters for your password.`,
  };
  return (error?.code && known[error.code]) || error?.message || fallback;
}

export default function SignIn() {
  const wide = useWide();
  const [step, setStep] = useState<Step>("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  const go = (next: Step, message = "") => {
    setStep(next);
    setCode("");
    setError("");
    setNote(message);
  };
  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch {
      setError("We couldn't reach Buildpair. Check your connection and try again.");
    }
    setBusy(false);
  };
  const address = email.trim();

  const signIn = () =>
    run(async () => {
      const { error } = await authClient.signIn.email({ email: address, password });
      if (error?.code === "EMAIL_NOT_VERIFIED") {
        const sent = await authClient.emailOtp.sendVerificationOtp({
          email: address,
          type: "email-verification",
        });
        if (sent.error) return setError(plain(sent.error, "Couldn't send a code. Try again in a moment."));
        return go("confirm", "Confirm your email first. We sent you a new code.");
      }
      if (error) setError(plain(error, "Couldn't sign you in. Try again in a moment."));
    });

  const signUp = () =>
    run(async () => {
      if (!name.trim()) return setError("Add your name so your people know it's you.");
      if (password.length < MIN_PASSWORD)
        return setError(`Use at least ${MIN_PASSWORD} characters for your password.`);
      const { error } = await authClient.signUp.email({ name: name.trim(), email: address, password });
      if (error) return setError(plain(error, "Couldn't make your account. Try again in a moment."));
      go("confirm");
    });

  const confirm = () =>
    run(async () => {
      // The password goes along so the person who proves the inbox is the one whose password counts.
      // Better Auth's types don't know the server takes it (see verify-email in apps/edge/src/app.ts).
      const body: { email: string; otp: string } = { email: address, otp: code.trim(), ...{ password } };
      const { error } = await authClient.emailOtp.verifyEmail(body);
      if (error) setError(plain(error, "That code didn't work. Check it or ask for a new one."));
    });

  const resendConfirm = () =>
    run(async () => {
      const { error } = await authClient.emailOtp.sendVerificationOtp({
        email: address,
        type: "email-verification",
      });
      if (error) setError(plain(error, "Couldn't send a code. Try again in a moment."));
      else setNote("We sent a new code.");
    });

  const forgot = () =>
    run(async () => {
      const { error } = await authClient.emailOtp.requestPasswordReset({ email: address });
      if (error) return setError(plain(error, "Couldn't send a code. Try again in a moment."));
      setPassword("");
      go("reset");
    });

  const reset = () =>
    run(async () => {
      if (password.length < MIN_PASSWORD)
        return setError(`Use at least ${MIN_PASSWORD} characters for your password.`);
      const { error } = await authClient.emailOtp.resetPassword({
        email: address,
        otp: code.trim(),
        password,
      });
      if (error) return setError(plain(error, "That code didn't work. Check it or ask for a new one."));
      const signedIn = await authClient.signIn.email({ email: address, password });
      if (signedIn.error) go("sign-in", "Your password is set. Sign in with it.");
    });

  const emailField = (onSubmit: () => void) => (
    <Field
      label="Email"
      value={email}
      onChangeText={setEmail}
      autoCapitalize="none"
      autoComplete="email"
      keyboardType="email-address"
      inputMode="email"
      placeholder="you@example.com"
      onSubmitEditing={onSubmit}
    />
  );
  const passwordField = (onSubmit: () => void, fresh: boolean) => (
    <Field
      label="Password"
      value={password}
      onChangeText={setPassword}
      secureTextEntry
      accessibilityLabel="Password"
      autoCapitalize="none"
      autoComplete={fresh ? "new-password" : "current-password"}
      textContentType={fresh ? "newPassword" : "password"}
      placeholder={fresh ? `At least ${MIN_PASSWORD} characters` : undefined}
      onSubmitEditing={onSubmit}
    />
  );
  const codeField = (onSubmit: () => void) => (
    <Field
      label="Code"
      value={code}
      onChangeText={(t) => setCode(t.replace(/\D/g, ""))}
      keyboardType="number-pad"
      autoComplete="one-time-code"
      maxLength={6}
      placeholder="123456"
      onSubmitEditing={onSubmit}
    />
  );
  const sentTo = (lead: string) => (
    <Text style={{ fontSize: 15, color: colors.sub }}>
      {lead} <Text style={{ fontWeight: "600", color: colors.ink }}>{address}</Text>. It expires in 10
      minutes.
    </Text>
  );
  const link = (label: string, onPress: () => void) => (
    <Button label={label} kind="secondary" onPress={onPress} />
  );
  const hasEmail = address.length > 0;

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
            {note ? <Text style={{ fontSize: 15, color: colors.ink }}>{note}</Text> : null}
            {step === "sign-in" ? (
              <>
                {emailField(signIn)}
                {passwordField(signIn, false)}
                <ErrorText>{error}</ErrorText>
                <Button label="Sign in" onPress={signIn} busy={busy} disabled={!hasEmail || !password} />
                {link("Forgot your password?", () => go("forgot"))}
                {link("New here? Make an account", () => go("sign-up"))}
              </>
            ) : null}
            {step === "sign-up" ? (
              <>
                <Field
                  label="Your name"
                  value={name}
                  onChangeText={setName}
                  autoComplete="name"
                  placeholder="Maya Chen"
                  maxLength={80}
                />
                {emailField(signUp)}
                {passwordField(signUp, true)}
                <ErrorText>{error}</ErrorText>
                <Button
                  label="Make my account"
                  onPress={signUp}
                  busy={busy}
                  disabled={!hasEmail || !password || !name.trim()}
                />
                <Text style={{ fontSize: 13, color: colors.faint, textAlign: "center" }}>
                  We email you a code once, to check the address is yours.
                </Text>
                {link("Have an account? Sign in", () => go("sign-in"))}
              </>
            ) : null}
            {step === "confirm" ? (
              <>
                {sentTo("We sent a 6-digit code to")}
                {codeField(confirm)}
                <ErrorText>{error}</ErrorText>
                <Button
                  label="Confirm and sign in"
                  onPress={confirm}
                  busy={busy}
                  disabled={code.length !== 6}
                />
                {link("Send a new code", resendConfirm)}
                <Text style={{ fontSize: 13, color: colors.faint, textAlign: "center" }}>
                  No code? If you already have an account, sign in or reset your password instead.
                </Text>
                {link("Back to sign in", () => go("sign-in"))}
              </>
            ) : null}
            {step === "forgot" ? (
              <>
                <Text style={{ fontSize: 15, color: colors.sub }}>
                  Enter your email and we'll send a code to set a new password.
                </Text>
                {emailField(forgot)}
                <ErrorText>{error}</ErrorText>
                <Button
                  label="Email me a code"
                  onPress={forgot}
                  busy={busy}
                  disabled={!address.includes("@")}
                />
                {link("Back to sign in", () => go("sign-in"))}
              </>
            ) : null}
            {step === "reset" ? (
              <>
                {sentTo("If there's an account for it, we sent a 6-digit code to")}
                {codeField(reset)}
                {passwordField(reset, true)}
                <ErrorText>{error}</ErrorText>
                <Button
                  label="Set password and sign in"
                  onPress={reset}
                  busy={busy}
                  disabled={code.length !== 6 || !password}
                />
                {link("Back to sign in", () => go("sign-in"))}
              </>
            ) : null}
            <Text style={{ fontSize: 13, color: colors.faint, textAlign: "center" }}>
              Got an invite link? Open it after signing in and you'll land in the space.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
