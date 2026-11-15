import React, { useRef, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { Account, API_URL, ApiError, request } from "./api";
import { submissionGuard } from "./submissionGuard";
import { ArrowLeft, Eye, EyeOff, Info } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors as c, font as f } from "./theme";

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6)]
    .filter(Boolean)
    .join("-");
}

function parseBirthDate(value: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const [, month, day, year] = match;
  if (year === "0000") return null;
  const iso = year + "-" + month + "-" + day;
  const date = new Date(iso + "T00:00:00");
  if (
    date.getFullYear() !== Number(year) ||
    date.getMonth() + 1 !== Number(month) ||
    date.getDate() !== Number(day) ||
    date > new Date()
  ) return null;
  return iso;
}

function isAtLeast21(iso: string) {
  const today = new Date();
  const [year, month, day] = iso.split("-").map(Number);
  const beforeBirthday = today.getMonth() + 1 < month ||
    (today.getMonth() + 1 === month && today.getDate() < day);
  return today.getFullYear() - year - Number(beforeBirthday) >= 21;
}

export default function Registration({ complete, back }: { complete: (a: Account) => Promise<void>; back: () => void }) {
  const [form, setForm] = useState({username: "", email: "", phone: "", date_of_birth: "", password: "", confirm_password: ""});
  const [errors, setErrors] = useState<Record<string,string[]>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(false);
  const [visible, setVisible] = useState(false);
  const insets = useSafeAreaInsets();
  const [focused, setFocused] = useState<string | null>(null);
  const flight = useRef(submissionGuard());
  const submit = async () => {
    if (created || !API_URL || !flight.current.enter()) return;
    try {
      const e: Record<string,string[]> = {};
      for (const [key,value] of Object.entries(form)) if (!value.trim()) e[key] = ["This field is required."];
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = ["Enter a valid email address."];
      if (form.password.length < 10 || !/[A-Z]/.test(form.password) || !/[0-9]/.test(form.password)) e.password = ["Use 10+ characters, an uppercase letter, and a number."];
      if (form.password !== form.confirm_password) e.confirm_password = ["Passwords do not match."];
      if (!/^\d{3}-\d{3}-\d{4}$/.test(form.phone)) e.phone = ["Enter a 10-digit phone number."];
      const dob = parseBirthDate(form.date_of_birth);
      if (!dob) e.date_of_birth = ["Enter a valid date in MM/DD/YYYY format. It cannot be in the future."];
      else if (!isAtLeast21(dob)) e.date_of_birth = ["You must be at least 21 to create an account."];
      setErrors(e); setMessage("");
      if (Object.keys(e).length) return;
      setBusy(true);
      const account: Account = await request("/auth/register/", {method: "POST", body: JSON.stringify({...form, date_of_birth: dob, username: form.username.trim(), email: form.email.trim()})});
      setCreated(true);
      setForm({...form, password: "", confirm_password: ""});
      try { await complete(account); }
      catch { setMessage("Your account was created, but sign-in setup failed. Use Back to sign in."); }
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) { setErrors(e.fields); setMessage("Please correct the highlighted fields."); }
      else if (e instanceof ApiError && e.status === 429) setMessage("Too many attempts. Please wait before trying again.");
      else setMessage("We couldn't confirm registration. Your account may already exist. Try signing in before submitting again.");
    } finally { flight.current.release(); setBusy(false); }
  };
  const labels = {username: "Username", email: "Email", phone: "Phone number", date_of_birth: "Date of birth", password: "Password", confirm_password: "Confirm password"};
  const hints: Partial<Record<keyof typeof form, string>> = {
    phone: "In the format XXX-XXX-XXXX",
    date_of_birth: "Use MM/DD/YYYY. You must be at least 21.",
    password: "At least 10 characters, one uppercase letter, and one number. Avoid common passwords.",
  };
  const groups: {title: string; fields: (keyof typeof form)[]}[] = [
    {title: "Account details", fields: ["username", "email"]},
    {title: "Profile details", fields: ["phone", "date_of_birth"]},
    {title: "Password", fields: ["password", "confirm_password"]},
  ];
  const disabled = busy || created || !API_URL;
  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={[styles.page, {paddingBottom: Math.max(32, insets.bottom + 16), paddingLeft: Math.max(24, insets.left), paddingRight: Math.max(24, insets.right)}]}>
      <Pressable accessibilityRole="button" disabled={busy} onPress={back} style={({pressed}) => [styles.back, pressed && styles.pressed, busy && styles.disabled]}>
        <ArrowLeft size={20} color={c.ink} /><Text style={styles.backText}>Back to sign in</Text>
      </Pressable>
      <View style={styles.heading}>
        <Text accessibilityRole="header" style={styles.title}>Create account</Text>
        <Text style={styles.subtitle}>Save your spots. Share what the night looks like.</Text>
        <Text style={styles.hint}>All fields are required.</Text>
      </View>
      {!API_URL && <View style={styles.notice}><Info size={20} color={c.accent} /><Text style={[styles.body, {flex:1}]}>Account creation is unavailable in sample preview. You can still explore venues and save spots on this device.</Text></View>}
      {groups.map(group => <View key={group.title} style={styles.section}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>{group.title}</Text>
        {group.fields.map(key => <View key={key} style={styles.fieldGroup}>
          <Text style={styles.label}>{labels[key]}</Text>
          <TextInput accessibilityLabel={labels[key]} accessibilityHint={hints[key]} aria-invalid={Boolean(errors[key]?.length)} value={form[key]} editable={!busy && !created} autoCapitalize="none" autoCorrect={false} secureTextEntry={key.includes("password") && !visible} keyboardType={key === "email" ? "email-address" : key === "phone" ? "phone-pad" : "default"} placeholder={key === "date_of_birth" ? "MM/DD/YYYY" : key === "phone" ? "123-456-7890" : undefined} placeholderTextColor={c.muted} onFocus={() => setFocused(key)} onBlur={() => setFocused(null)} onChangeText={value => setForm(previous => ({...previous, [key]: key === "phone" ? formatPhone(value) : value}))} style={[styles.field, errors[key]?.length ? styles.invalid : undefined, focused === key && styles.focused]} />
          {hints[key] && <Text style={styles.hint}>{hints[key]}</Text>}
          {errors[key]?.map((error,i) => <Text key={i} accessibilityRole="alert" style={styles.error}>Error: {error}</Text>)}
        </View>)}
        {group.title === "Password" && <Pressable accessibilityRole="button" accessibilityState={{selected:visible}} onPress={() => setVisible(!visible)} style={({pressed}) => [styles.secondary, pressed && styles.pressed]}>
          {visible ? <EyeOff size={18} color={c.accent} /> : <Eye size={18} color={c.accent} />}<Text style={styles.secondaryText}>{visible ? "Hide passwords" : "Show passwords"}</Text>
        </Pressable>}
      </View>)}
      {message ? <View style={styles.notice}><Text accessibilityRole="alert" style={styles.body}>{message}</Text></View> : null}
      {errors.non_field_errors?.map((e,i) => <Text key={i} accessibilityRole="alert" style={styles.error}>Error: {e}</Text>)}
      <Pressable accessibilityRole="button" accessibilityState={{disabled, busy}} disabled={disabled} onPress={submit} style={({pressed}) => [styles.button, disabled && styles.disabled, pressed && styles.pressed]}>
        {busy && <ActivityIndicator color={c.white} />}<Text style={styles.buttonText}>{busy ? "Creating account..." : created ? "Account created" : "Create account"}</Text>
      </Pressable>
    </ScrollView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  screen: {flex:1, backgroundColor:c.white},
  page: {width:"100%", maxWidth:760, alignSelf:"center", paddingTop:16},
  back: {flexDirection:"row", alignItems:"center", gap:10, minHeight:44, alignSelf:"flex-start", marginBottom:20},
  backText: {fontFamily:f.semibold, fontSize:14, color:c.ink},
  heading: {gap:8, marginBottom:28},
  title: {fontFamily:f.extra, fontSize:28, lineHeight:36, letterSpacing:-1, color:c.ink},
  subtitle: {fontFamily:f.regular, fontSize:14, lineHeight:22, color:c.muted},
  section: {borderTopWidth:1, borderTopColor:c.border, paddingTop:24, marginBottom:28, gap:20},
  sectionTitle: {fontFamily:f.bold, fontSize:17, lineHeight:25, letterSpacing:-0.25, color:c.ink},
  fieldGroup: {gap:8},
  label: {fontFamily:f.semibold, fontSize:14, color:c.ink},
  field: {borderWidth:1, borderColor:c.muted, borderRadius:8, paddingHorizontal:14, paddingVertical:12, minHeight:48, fontFamily:f.regular, fontSize:16, color:c.ink},
  focused: {borderColor:c.focus, boxShadow:"0 0 0 2px #EDF5EF"},
  invalid: {borderColor:c.packed},
  hint: {fontFamily:f.regular, fontSize:12, lineHeight:19, color:c.muted},
  error: {fontFamily:f.medium, fontSize:13, lineHeight:20, color:c.packed},
  notice: {backgroundColor:c.accentLight, borderRadius:8, padding:16, flexDirection:"row", gap:12, marginBottom:24},
  body: {fontFamily:f.regular, fontSize:14, lineHeight:22, color:c.ink},
  secondary: {flexDirection:"row", gap:8, alignItems:"center", minHeight:44, alignSelf:"flex-start"},
  secondaryText: {fontFamily:f.semibold, fontSize:14, color:c.accent},
  button: {minHeight:50, borderRadius:8, backgroundColor:c.accent, paddingHorizontal:20, paddingVertical:14, flexDirection:"row", alignItems:"center", justifyContent:"center", gap:10},
  buttonText: {fontFamily:f.bold, fontSize:14, color:c.white},
  disabled: {opacity:0.45},
  pressed: {opacity:0.8},
});
