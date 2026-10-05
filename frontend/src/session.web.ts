import { Account } from "./api";
const KEY = "whatspoppin-session-v1";
// Browser auth is limited to this tab's session. Native auth uses SecureStore.
export async function readSession(): Promise<Account | null> {
  const raw = sessionStorage.getItem(KEY);
  return raw ? JSON.parse(raw) : null;
}
export async function saveSession(account: Account) {
  sessionStorage.setItem(KEY, JSON.stringify(account));
}
export async function clearSession() {
  sessionStorage.removeItem(KEY);
}
