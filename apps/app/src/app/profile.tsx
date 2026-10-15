import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Avatar, Card, Icon } from "../components/kit";
import { PageHeader, Shell, signOut, useWide } from "../components/shell";
import { Button, ErrorText, Field } from "../components/ui";
import { authClient } from "../lib/auth";
import { useSpaces } from "../lib/spaces";
import { colors, space } from "../lib/theme";

const deviceZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
};

/** Your profile: name, what you're building and time zone; then the account (email, password, sign out). */
export default function Profile() {
  const wide = useWide();
  const { data: session } = authClient.useSession();
  const user = session?.user;
  const [name, setName] = useState(user?.name ?? "");
  const [building, setBuilding] = useState(user?.building ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");
  const zone = user?.timeZone ?? null;
  const here = deviceZone();

  // Keep the time zone in step with the device (people travel); it's only ever set to a real zone.
  useEffect(() => {
    if (user && here && zone !== here) void authClient.updateUser({ timeZone: here });
  }, [user, here, zone]);

  const dirty =
    Boolean(user) && (name.trim() !== (user?.name ?? "") || building.trim() !== (user?.building ?? ""));
  const save = async () => {
    if (!name.trim()) return setError("Add your name so your people know it's you.");
    setSaving(true);
    setError("");
    const { error } = await authClient.updateUser({
      name: name.trim(),
      building: building.trim() || null,
    });
    setSaving(false);
    if (error) setError(error.message ?? "Couldn't save. Try again in a moment.");
    else setSaved("Saved.");
  };

  return (
    <Shell active="profile">
      <ScrollView
        contentContainerStyle={{
          padding: wide ? space.xxl : space.lg,
          paddingBottom: 120,
          maxWidth: 640,
          width: "100%",
          alignSelf: wide ? "flex-start" : "center",
          gap: space.lg,
        }}
      >
        {!wide ? (
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={10}
            style={{ flexDirection: "row", alignItems: "center", alignSelf: "flex-start" }}
          >
            <Icon name="chevron-left" size={18} color={colors.sub} />
            <Text style={{ fontSize: 14, color: colors.sub }}>Back</Text>
          </Pressable>
        ) : null}
        <PageHeader title="Profile" />
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.lg }}>
          <Avatar id={user?.id ?? "me"} name={user?.name || "?"} size={64} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontSize: 20, fontWeight: "700", color: colors.ink }}>
              {user?.name || "You"}
            </Text>
            <Text numberOfLines={2} style={{ fontSize: 14, color: colors.sub }}>
              {user?.building || "Say what you're building so your people know."}
            </Text>
          </View>
        </View>

        <Card style={{ gap: space.md }}>
          <Field
            label="Name"
            value={name}
            onChangeText={(t) => {
              setName(t);
              setSaved("");
            }}
            maxLength={80}
            autoComplete="name"
          />
          <Field
            label="What you're building"
            value={building}
            onChangeText={(t) => {
              setBuilding(t);
              setSaved("");
            }}
            maxLength={140}
            placeholder="Ledgerly, invoicing for freelancers"
          />
          <View style={{ gap: 2 }}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: colors.sub }}>Time zone</Text>
            <Text style={{ fontSize: 15, color: colors.ink }}>
              {(zone ?? here ?? "Unknown").replace(/_/g, " ")}
            </Text>
            <Text style={{ fontSize: 12, color: colors.faint }}>Set from this device.</Text>
          </View>
          <ErrorText>{error}</ErrorText>
          {saved ? <Text style={{ fontSize: 13, color: colors.online }}>{saved}</Text> : null}
          <Button label="Save" onPress={save} busy={saving} disabled={!dirty} />
        </Card>

        <ChangePassword />

        <Card style={{ gap: space.md }}>
          <Text style={{ fontSize: 15, fontWeight: "700", color: colors.ink }}>Account</Text>
          <View style={{ gap: 2 }}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: colors.sub }}>Email</Text>
            <Text style={{ fontSize: 15, color: colors.ink }}>{user?.email}</Text>
          </View>
          <Button label="Sign out" kind="secondary" onPress={() => void signOut()} />
        </Card>

        <DeleteAccount />
      </ScrollView>
    </Shell>
  );
}

function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const submit = async () => {
    if (next.length < 8) return setError("Use at least 8 characters for your new password.");
    setBusy(true);
    setError("");
    const { error } = await authClient.changePassword({
      currentPassword: current,
      newPassword: next,
      revokeOtherSessions: true,
    });
    setBusy(false);
    if (error)
      return setError(
        error.code === "INVALID_PASSWORD"
          ? "Your current password isn't right."
          : (error.message ?? "Couldn't change it. Try again in a moment."),
      );
    setDone(true);
    setOpen(false);
    setCurrent("");
    setNext("");
  };
  return (
    <Card style={{ gap: space.md }}>
      <Text style={{ fontSize: 15, fontWeight: "700", color: colors.ink }}>Password</Text>
      {done ? (
        <Text style={{ fontSize: 13, color: colors.online }}>
          Password changed. You're signed out everywhere else.
        </Text>
      ) : null}
      {open ? (
        <>
          <Field
            label="Current password"
            value={current}
            onChangeText={setCurrent}
            secureTextEntry
            autoComplete="current-password"
            accessibilityLabel="Current password"
          />
          <Field
            label="New password"
            value={next}
            onChangeText={setNext}
            secureTextEntry
            autoComplete="new-password"
            placeholder="At least 8 characters"
            accessibilityLabel="New password"
            onSubmitEditing={submit}
          />
          <ErrorText>{error}</ErrorText>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <Button label="Cancel" kind="secondary" onPress={() => setOpen(false)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Change password" onPress={submit} busy={busy} disabled={!current || !next} />
            </View>
          </View>
        </>
      ) : (
        <Button
          label="Change password"
          kind="secondary"
          onPress={() => {
            setDone(false);
            setOpen(true);
          }}
        />
      )}
    </Card>
  );
}

/** Deleting your account, with what it removes spelled out and your password to confirm. */
function DeleteAccount() {
  const { spaces } = useSpaces();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const owned = (spaces ?? []).filter((s) => s.role === "owner");
  const submit = async () => {
    setBusy(true);
    setError("");
    const { error } = await authClient.deleteUser({ password });
    setBusy(false);
    if (error)
      return setError(
        error.code === "INVALID_PASSWORD"
          ? "That password isn't right."
          : (error.message ?? "Couldn't delete your account. Try again in a moment."),
      );
    // The account is gone on the server. Clear this device the same way signing out does.
    await signOut();
  };
  return (
    <Card style={{ gap: space.md }}>
      <Text style={{ fontSize: 15, fontWeight: "700", color: colors.ink }}>Delete account</Text>
      {open ? (
        <>
          <Text style={{ fontSize: 14, color: colors.ink }}>
            This can't be undone. Your profile and everything you added are deleted.
          </Text>
          <Text style={{ fontSize: 14, color: colors.ink }}>
            {owned.length === 0
              ? "You don't own any spaces. Your items, messages and reactions are removed from the spaces you joined."
              : `${owned.length === 1 ? "The space you own" : `The ${owned.length} spaces you own`} (${owned
                  .map((s) => s.name)
                  .join(", ")}) ${owned.length === 1 ? "is" : "are"} deleted for everyone in ${
                  owned.length === 1 ? "it" : "them"
                }. In spaces you joined, your items, messages and reactions are removed.`}
          </Text>
          <Field
            label="Your password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            accessibilityLabel="Your password"
          />
          <ErrorText>{error}</ErrorText>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <Button
                label="Cancel"
                kind="secondary"
                onPress={() => {
                  setOpen(false);
                  setPassword("");
                  setError("");
                }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label="Delete my account"
                kind="danger"
                onPress={submit}
                busy={busy}
                disabled={!password}
              />
            </View>
          </View>
        </>
      ) : (
        <>
          <Text style={{ fontSize: 13, color: colors.sub }}>
            Removes your account and everything you added. Spaces you own are deleted for everyone in them.
          </Text>
          <Button label="Delete account" kind="secondary" onPress={() => setOpen(true)} />
        </>
      )}
    </Card>
  );
}
