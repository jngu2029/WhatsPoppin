// Checks and formatting for the sign-up pages. The server repeats every check.

export function emailError(value: string): string | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim()) ? null : "Enter a valid email address.";
}

export function passwordError(value: string): string | null {
  return value.length >= 10 && /[A-Z]/.test(value) && /[0-9]/.test(value)
    ? null
    : "Use at least 10 characters, one uppercase letter, and one number.";
}

export function formatBirthDate(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)]
    .filter(Boolean)
    .join("/");
}

// MM/DD/YYYY -> YYYY-MM-DD, or null when it isn't a real date or is in the future.
export function parseBirthDate(value: string, today = new Date()) {
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
    date > today
  )
    return null;
  return iso;
}

export function isAtLeast21(iso: string, today = new Date()) {
  const [year, month, day] = iso.split("-").map(Number);
  const beforeBirthday =
    today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day);
  return today.getFullYear() - year - Number(beforeBirthday) >= 21;
}

// Text for the resend button: a countdown while waiting, otherwise "Resend code".
export function resendLabel(resend: { availableAt: number; left: number } | null, now: number) {
  if (!resend || now >= resend.availableAt) return "Resend code";
  const seconds = Math.ceil((resend.availableAt - now) / 1000);
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return resend.left === 0 ? `Too many codes sent. Try again in ${clock}` : `Resend code in ${clock}`;
}
