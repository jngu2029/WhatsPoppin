import { useCallback, useEffect, useState } from "react";
import { AppState, Linking, Platform } from "react-native";
import * as Location from "expo-location";

// granted: location works.
// askable: not granted yet, and the system will still show its prompt.
// blocked: denied, and the system will not prompt again. Only the device or
//   browser settings can change it.
export type LocationAccess = "granted" | "askable" | "blocked";

export async function checkLocationAccess(): Promise<LocationAccess> {
  const permission = await Location.getForegroundPermissionsAsync();
  return permission.granted
    ? "granted"
    : permission.canAskAgain
      ? "askable"
      : "blocked";
}

// Browsers have no settings page an app can open, so this does nothing on web.
export function openLocationSettings() {
  if (Platform.OS !== "web") void Linking.openSettings();
}

// Tracks the current permission and re-checks it when the app comes back to
// the foreground, so turning location on in Settings shows up without a retry.
export function useLocationAccess(): [LocationAccess | null, () => void] {
  const [access, setAccess] = useState<LocationAccess | null>(null);
  const recheck = useCallback(() => {
    checkLocationAccess()
      .then(setAccess)
      .catch(() => setAccess(null));
  }, []);
  useEffect(() => {
    recheck();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") recheck();
    });
    return () => subscription.remove();
  }, [recheck]);
  return [access, recheck];
}
