import React, { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { API_URL, ApiError, request } from "./api";
import { submissionGuard } from "./submissionGuard";
import { ArrowLeft, Eye, EyeOff, Info } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors as c, font as f } from "./theme";
import { formatBirthDate, isAtLeast21, parseBirthDate, passwordError, emailError, resendLabel } from "./signup";

// Sign-up runs as three pages. The server holds the progress under signupToken
// and only creates the account once the email is confirmed.
type Step = "email" | "emailCode" | "details";
const STEPS: Step[] = ["email", "emailCode", "details"];
type Resend = { availableAt: number; left: number };
type Errors = Record<string, string[]>;
// DRF puts general messages in "detail" as a plain string.
const detailOf = (e: ApiError): string | undefined => {
  const detail = (e.fields as Record<string, unknown> | undefined)?.detail;
  return typeof detail === "string" ? detail : undefined;
};

const titles: Record<Step, { title: string; subtitle: string }> = {
  email: { title: "What’s your email?", subtitle: "We’ll email you a code to confirm it’s yours." },
  emailCode: { title: "Enter the code we emailed you", subtitle: "" },
  details: { title: "Finish your account", subtitle: "Pick a username and password." },
};

export default function Registration({ complete, back }: { complete: (username: string) => void; back: () => void }) {
  const [step, setStep] = useState<Step>("email");
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [resend, setResend] = useState<Resend | null>(null);
  const [form, setForm] = useState({ username: "", first_name: "", last_name: "", date_of_birth: "", password: "", confirm_password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const flight = useRef(submissionGuard());
  const insets = useSafeAreaInsets();

  // Tick once a second on the code pages so the resend countdown stays current.
  const onCodeStep = step === "emailCode";
  useEffect(() => {
    if (!onCodeStep) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [onCodeStep]);

  const go = (next: Step) => {
    setStep(next);
    setCode("");
    setErrors({});
    setMessage("");
  };
  const readResend = (data: any): Resend | null =>
    data?.resend_available_at
      ? { availableAt: Date.parse(data.resend_available_at), left: data.resends_left ?? 0 }
      : null;

  // Runs one request at a time and turns server errors into messages on the page.
  const run = async (action: () => Promise<void>) => {
    if (!API_URL || !flight.current.enter()) return;
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (e) {
      if (e instanceof ApiError && e.fields?.restart) {
        setToken(null);
        setStep("email");
        setErrors({});
        setMessage(e.fields.non_field_errors?.[0] ?? "Please start again.");
      } else if (e instanceof ApiError && e.status === 429) {
        setResend(readResend(e.fields) ?? resend);
        setMessage(detailOf(e) ?? "Too many attempts. Please wait before trying again.");
      } else if (e instanceof ApiError && e.status === 400) {
        setErrors(e.fields);
        if (e.fields.non_field_errors) setMessage(e.fields.non_field_errors[0]);
      } else if (e instanceof ApiError && detailOf(e)) {
        setMessage(detailOf(e)!);
      } else {
        setMessage("Something went wrong. Check your connection and try again.");
      }
    } finally {
      flight.current.release();
      setBusy(false);
    }
  };

  const start = () => {
    const value = email;
    const invalid = emailError(value);
    if (invalid) {
      setErrors({ email: [invalid] });
      return;
    }
    setErrors({});
    void run(async () => {
      const data = await request("/auth/signup/email/", {
        method: "POST",
        body: JSON.stringify({ email: value, signup_token: token }),
      });
      setToken(data.signup_token);
      setEmail(data.email);
      if (data.verified) go("details");
      else {
        setResend(readResend(data));
        go("emailCode");
      }
    });
  };

  const resendCode = () =>
    run(async () => {
      const data = await request("/auth/signup/email/resend/", {
        method: "POST",
        body: JSON.stringify({ signup_token: token }),
      });
      setResend(readResend(data));
      setCode("");
      setErrors({});
      setMessage("We sent a new code to your email.");
    });

  const verify = () => {
    if (!/^\d{6}$/.test(code)) {
      setErrors({ code: ["Enter the 6-digit code."] });
      return;
    }
    void run(async () => {
      await request("/auth/signup/email/verify/", {
        method: "POST",
        body: JSON.stringify({ signup_token: token, code }),
      });
      go("details");
    });
  };

  const createAccount = () => {
    const e: Errors = {};
    if (!form.username.trim()) e.username = ["Choose a username."];
    else if (/[^\p{L}\p{N}_]/u.test(form.username)) {
      e.username = ["Use only letters, numbers, and underscores."];
    }
    const dob = parseBirthDate(form.date_of_birth);
    if (!dob) e.date_of_birth = ["Enter a real date in MM/DD/YYYY format. It can’t be in the future."];
    else if (!isAtLeast21(dob)) e.date_of_birth = ["You must be at least 21 to create an account."];
    const badPassword = passwordError(form.password);
    if (badPassword) e.password = [badPassword];
    if (!form.confirm_password) e.confirm_password = ["Re-enter your password."];
    else if (form.password !== form.confirm_password) e.confirm_password = ["Passwords do not match."];
    setErrors(e);
    if (Object.keys(e).length) return;
    void run(async () => {
      const data = await request("/auth/register/", {
        method: "POST",
        body: JSON.stringify({ ...form, date_of_birth: dob, signup_token: token }),
      });
      complete(data.username);
    });
  };

  const goBack = () => {
    if (busy) return;
    const index = STEPS.indexOf(step);
    if (index === 0) return back();
    // From the code page or the final page, go back to the email page.
    go("email");
  };

  const field = (
    key: string,
    label: string,
    props: React.ComponentProps<typeof TextInput>,
    hint?: string,
  ) => (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={hint}
        aria-invalid={Boolean(errors[key]?.length)}
        editable={!busy}
        autoCapitalize="none"
        autoCorrect={false}
        placeholderTextColor={c.placeholder}
        onFocus={() => setFocused(key)}
        onBlur={() => setFocused(null)}
        style={[styles.field, errors[key]?.length ? styles.invalid : undefined, focused === key && styles.focused]}
        {...props}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {errors[key]?.map((error, i) => (
        <Text key={i} accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ))}
    </View>
  );

  const toggle = (shown: boolean, set: (v: boolean) => void, what: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: shown }}
      onPress={() => set(!shown)}
      style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
    >
      {shown ? <EyeOff size={18} color={c.accent} /> : <Eye size={18} color={c.accent} />}
      <Text style={styles.secondaryText}>{shown ? `Hide ${what}` : `Show ${what}`}</Text>
    </Pressable>
  );

  const codePage = () => {
    const waiting = resend !== null && now < resend.availableAt;
    return (
      <>
        <Text style={styles.body}>
          Sent to <Text style={styles.strong}>{email}</Text>. It expires in 10 minutes.
        </Text>
        {field("code", "Verification code", {
          value: code,
          onChangeText: (v) => setCode(v.replace(/\D/g, "").slice(0, 6)),
          keyboardType: "number-pad",
          autoComplete: "one-time-code",
          textContentType: "oneTimeCode",
          maxLength: 6,
          placeholder: "123456",
        })}
        {primary("Confirm", verify, code.length !== 6)}
        <View style={styles.resendRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: waiting || busy }}
            disabled={waiting || busy}
            onPress={() => void resendCode()}
            style={({ pressed }) => [styles.secondary, (waiting || busy) && styles.disabled, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryText}>{resendLabel(resend, now)}</Text>
          </Pressable>
          {resend && !waiting && resend.left > 0 ? (
            <Text style={styles.hint}>
              {resend.left} {resend.left === 1 ? "resend" : "resends"} left
            </Text>
          ) : null}
        </View>
        <Pressable accessibilityRole="button" onPress={() => go("email")} style={styles.secondary}>
          <Text style={styles.secondaryText}>Use a different email</Text>
        </Pressable>
      </>
    );
  };

  const primary = (label: string, onPress: () => void, disabled = false) => {
    const off = disabled || busy || !API_URL;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: off, busy }}
        disabled={off}
        onPress={onPress}
        style={({ pressed }) => [styles.button, off && styles.disabled, pressed && styles.pressed]}
      >
        {busy && <ActivityIndicator color={c.white} />}
        <Text style={styles.buttonText}>{label}</Text>
      </Pressable>
    );
  };

  const index = STEPS.indexOf(step);
  const { title, subtitle } = titles[step];
  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[
          styles.page,
          { paddingBottom: Math.max(32, insets.bottom + 16), paddingLeft: Math.max(24, insets.left), paddingRight: Math.max(24, insets.right) },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={goBack}
          style={({ pressed }) => [styles.back, pressed && styles.pressed, busy && styles.disabled]}
        >
          <ArrowLeft size={20} color={c.ink} />
          <Text style={styles.backText}>{index === 0 ? "Back to sign in" : "Back"}</Text>
        </Pressable>
        <Text style={styles.stepLabel}>Step {index + 1} of {STEPS.length}</Text>
        <View style={styles.progress} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {STEPS.map((s, i) => (
            <View key={s} style={[styles.progressPart, i <= index && styles.progressDone]} />
          ))}
        </View>
        <View style={styles.heading}>
          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {!API_URL && (
          <View style={styles.notice}>
            <Info size={20} color={c.accent} />
            <Text style={[styles.body, { flex: 1 }]}>
              Account creation is unavailable in sample preview. You can still explore venues and save spots on this device.
            </Text>
          </View>
        )}
        {message ? (
          <View style={styles.notice}>
            <Text accessibilityRole="alert" style={[styles.body, { flex: 1 }]}>{message}</Text>
          </View>
        ) : null}

        <View style={styles.form}>
          {step === "email" && (
            <>
              {field("email", "Email address", {
                value: email,
                onChangeText: setEmail,
                keyboardType: "email-address",
                autoComplete: "email",
                textContentType: "emailAddress",
                placeholder: "you@example.com",
              })}
              {primary("Send code", start, !email.trim())}
            </>
          )}
          {step === "emailCode" && codePage()}
          {step === "details" && (
            <>
              {field("first_name", "First name (optional)", {
                value: form.first_name,
                onChangeText: (value) => setForm((previous) => ({
                  ...previous,
                  first_name: value.replace(/[^\p{L}]/gu, ""),
                })),
                autoComplete: "given-name",
                textContentType: "givenName",
                maxLength: 150,
              })}
              {field("last_name", "Last name (optional)", {
                value: form.last_name,
                onChangeText: (value) => setForm((previous) => ({
                  ...previous,
                  last_name: value.replace(/[^\p{L}]/gu, ""),
                })),
                autoComplete: "family-name",
                textContentType: "familyName",
                maxLength: 150,
              })}
              {field("username", "Username", {
                value: form.username,
                onChangeText: (v) => setForm((p) => ({ ...p, username: v })),
                autoComplete: "username-new",
                textContentType: "username",
              })}
              {field("date_of_birth", "Date of birth", {
                value: form.date_of_birth,
                onChangeText: (v) => setForm((p) => ({ ...p, date_of_birth: formatBirthDate(v) })),
                keyboardType: "number-pad",
                placeholder: "MM/DD/YYYY",
              }, "You must be at least 21.")}
              {field("password", "Password", {
                value: form.password,
                onChangeText: (v) => setForm((p) => ({ ...p, password: v })),
                secureTextEntry: !showPassword,
                autoComplete: "new-password",
                textContentType: "newPassword",
              }, "At least 10 characters, one uppercase letter, and one number.")}
              {toggle(showPassword, setShowPassword, "password")}
              {field("confirm_password", "Confirm password", {
                value: form.confirm_password,
                onChangeText: (v) => setForm((p) => ({ ...p, confirm_password: v })),
                secureTextEntry: !showConfirm,
                autoComplete: "new-password",
                textContentType: "newPassword",
              })}
              {toggle(showConfirm, setShowConfirm, "password")}
              {primary(busy ? "Creating account..." : "Create account", createAccount)}
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.background },
  page: { width: "100%", maxWidth: 560, alignSelf: "center", paddingTop: 16 },
  back: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44, alignSelf: "flex-start", marginBottom: 16 },
  backText: { fontFamily: f.semibold, fontSize: 14, color: c.ink },
  stepLabel: { fontFamily: f.semibold, fontSize: 12, color: c.muted, marginBottom: 8 },
  progress: { flexDirection: "row", gap: 6, marginBottom: 24 },
  progressPart: { flex: 1, height: 4, borderRadius: 2, backgroundColor: c.border },
  progressDone: { backgroundColor: c.highlight },
  heading: { gap: 8, marginBottom: 24 },
  title: { fontFamily: f.extra, fontSize: 26, lineHeight: 34, letterSpacing: -1, color: c.ink },
  subtitle: { fontFamily: f.regular, fontSize: 14, lineHeight: 22, color: c.muted },
  form: { gap: 20 },
  fieldGroup: { gap: 8 },
  label: { fontFamily: f.semibold, fontSize: 14, color: c.ink },
  field: { borderWidth: 1, borderColor: c.muted, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, minHeight: 48, fontFamily: f.regular, fontSize: 16, color: c.ink, backgroundColor: c.white },
  focused: { borderColor: c.focus, boxShadow: `0 0 0 2px ${c.highlightLight}` },
  invalid: { borderColor: c.packed },
  hint: { fontFamily: f.regular, fontSize: 12, lineHeight: 19, color: c.muted },
  error: { fontFamily: f.medium, fontSize: 13, lineHeight: 20, color: c.packed },
  notice: { backgroundColor: c.accentLight, borderRadius: 8, padding: 16, flexDirection: "row", gap: 12, marginBottom: 20 },
  body: { fontFamily: f.regular, fontSize: 14, lineHeight: 22, color: c.ink },
  strong: { fontFamily: f.semibold },
  resendRow: { flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" },
  secondary: { flexDirection: "row", gap: 8, alignItems: "center", minHeight: 44, alignSelf: "flex-start" },
  secondaryText: { fontFamily: f.semibold, fontSize: 14, color: c.accent },
  button: { minHeight: 50, borderRadius: 8, backgroundColor: c.cta, paddingHorizontal: 20, paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  buttonText: { fontFamily: f.bold, fontSize: 14, color: c.white },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
});
