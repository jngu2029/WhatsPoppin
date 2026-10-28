import * as SecureStore from "expo-secure-store";
import { Account } from "./api";
const KEY = "whatspoppin-session-v1";
export async function readSession(): Promise<Account | null> {
  const raw = await SecureStore.getItemAsync(KEY);
  return raw ? JSON.parse(raw) : null;
}
export async function saveSession(account: Account) {
  await SecureStore.setItemAsync(KEY, JSON.stringify(account));
}
export async function clearSession() {
  await SecureStore.deleteItemAsync(KEY);
}
