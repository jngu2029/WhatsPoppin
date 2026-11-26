import Registration from "./src/Registration";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import {
  useFonts,
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from "@expo-google-fonts/manrope";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import {
  NavigationContainer,
  useFocusEffect,
  useNavigationContainerRef,
  useNavigation,
  NavigatorScreenParams,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import {
  createBottomTabNavigator,
  BottomTabBarProps,
} from "@react-navigation/bottom-tabs";
import {
  ArrowLeft,
  ArrowUpRight,
  Bookmark,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Clock3,
  Compass,
  Eye,
  EyeOff,
  Info,
  List,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  Search,
  Settings2,
  UserRound,
  Users,
  X,
} from "lucide-react-native";
import Svg, { Line, Circle, Text as SvgText } from "react-native-svg";
import { colors as c, font as f, levels } from "./src/theme";
import {
  Venue,
  Report,
  ServerCrowd,
  demoVenues,
  seedReports,
  collegePark,
  crowdSummary,
  crowdTrendBuckets,
  crowdTrendLabel,
  crowdTrendRange,
  distanceMiles,
  ageLabel,
  signInIdentifierError,
} from "./src/data";
import { API_URL, Account, ApiError, loadVenues, request } from "./src/api";
import MapPanel from "./src/MapPanel";
import { readSession, saveSession, clearSession } from "./src/session";
import { useReducedMotion } from "./src/useReducedMotion";
import {
  LocationAccess,
  openLocationSettings,
  useLocationAccess,
} from "./src/locationAccess";
import { useAppDimensions, MOBILE_PREVIEW_WIDTH } from "./src/useAppDimensions";

type Store = {
  venues: Venue[];
  reports: Report[];
  crowd: Record<number, ServerCrowd>;
  saved: number[];
  ready: boolean;
  error: string;
  refreshing: boolean;
  account: Account | null;
  origin: typeof collegePark;
  radius: number;
  reportVenue: Venue | null;
  toggleSave: (id: number) => Promise<void>;
  refresh: () => Promise<void>;
  openReport: (v?: Venue) => void;
  // Resolves to whether the server confirmed the reporter was at the venue (null when it can't tell).
  submitReport: (level: number, wait: number | null) => Promise<boolean | null>;
  setReportVenue: (v: Venue | null) => void;
  setOrigin: (o: typeof collegePark) => void;
  setRadius: (r: number) => void;
  signIn: (u: string, p: string) => Promise<void>;
  signOut: () => Promise<void>;
  toast: (text: string) => void;
  setPicker: (p: boolean) => void;
  setLocationSheet: (p: boolean) => void;
  // The page title shown in the top bar once the page's own title scrolls away.
  headerTitle: string | null;
  setHeaderTitle: React.Dispatch<React.SetStateAction<string | null>>;
};
const Context = createContext<Store>(null!);
const useStore = (): Store => useContext(Context);

// Puts `title` in the top bar while the page's own title is scrolled out of view.
// Attach onTitleLayout to a direct child of the ScrollView content that holds the title.
function useScrollTitle(title: string | null) {
  const { setHeaderTitle } = useStore();
  const titleBottom = useRef(Infinity);
  const offset = useRef(0);
  const focused = useRef(false);
  const update = useCallback(() => {
    if (!focused.current) return;
    setHeaderTitle(title && offset.current > titleBottom.current ? title : null);
  }, [title, setHeaderTitle]);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      update();
      return () => {
        focused.current = false;
        // Only clear our own title, in case the next page already set its own.
        setHeaderTitle((current) => (current === title ? null : current));
      };
    }, [update, title, setHeaderTitle]),
  );
  return {
    scrollProps: {
      scrollEventThrottle: 16,
      onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        offset.current = e.nativeEvent.contentOffset.y;
        update();
      },
    },
    onTitleLayout: (e: LayoutChangeEvent) => {
      const { y, height } = e.nativeEvent.layout;
      titleBottom.current = y + height;
      update();
    },
  };
}
type Routes = {
  Main: NavigatorScreenParams<{
    Nearby: undefined;
    Saved: undefined;
    Profile: { auth?: "signIn" | "register" } | undefined;
  }>;
  Venue: { id: number };
  Search: undefined;
};
const Stack = createNativeStackNavigator<Routes>();
const Tabs = createBottomTabNavigator();
const STORAGE = "whatspoppin-preview-v1";
const LOGO = require("./assets/logo.png");
// How long saving/unsaving a venue waits before it can be pressed again.
const SAVE_COOLDOWN_MS = 500;
// Native builds: hold the splash screen (logo on plum, see app.json) until App hides it.
void SplashScreen.preventAutoHideAsync().catch(() => {});
const waitLabels = ["0–5 min", "5–10 min", "10–20 min", "20–30 min", "30+ min"];

function Copy({
  children,
  style,
  ...props
}: React.ComponentProps<typeof Text>): React.JSX.Element {
  return (
    <Text {...props} style={[s.text, style]}>
      {children}
    </Text>
  );
}
function IconButton({
  icon: Icon,
  label,
  onPress,
  active = false,
}: {
  icon: any;
  label: string;
  onPress: () => void;
  active?: boolean;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [s.iconButton, pressed && s.pressed]}
    >
      <Icon
        size={22}
        color={active ? c.accent : c.ink}
        fill={active ? (Icon === Bookmark ? c.savedFill : c.accentLight) : "none"}
        strokeWidth={1.7}
      />
    </Pressable>
  );
}
function Button({
  children,
  onPress,
  outline = false,
  disabled = false,
  busy = false,
  icon: Icon,
  style,
}: {
  children: string;
  onPress: () => void;
  outline?: boolean;
  disabled?: boolean;
  busy?: boolean;
  icon?: any;
  style?: any;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        outline && s.buttonOutline,
        (disabled || busy) && s.disabled,
        pressed && { opacity: 0.8 },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={outline ? c.accent : c.white} />
      ) : Icon ? (
        <Icon
          size={19}
          color={outline ? c.accent : c.white}
          strokeWidth={1.8}
        />
      ) : null}
      <Copy
        style={[s.buttonText, outline && { color: c.accent }]}
        numberOfLines={1}
      >
        {children}
      </Copy>
    </Pressable>
  );
}
function Crowd({
  venueId,
  large = false,
}: {
  venueId: number;
  large?: boolean;
}): React.JSX.Element {
  const { reports, crowd } = useStore();
  const now = Date.now();
  const summary = crowdSummary(venueId, reports, now, crowd[venueId]);
  const trend = summary.stale ? null : crowdTrendRange(venueId, reports, now);
  const low = trend?.low ?? summary.level;
  const high = trend?.high ?? summary.level;
  const filledSegments =
    summary.stale || low === null || high === null ? 0 : 1 + (low + high) / 2;
  const darkness = Math.max(0, (filledSegments - 1) / (levels.length - 1));
  const meterColor = `hsl(140, 70%, ${52 - 32 * darkness}%)`;
  const color = summary.stale || high === null ? c.muted : levels[high].color;
  const label = summary.stale ? "Needs update" : trend?.label ?? levels[summary.level ?? 0].name;
  return (
    <View style={[s.crowd, large && { alignItems: "flex-start" }]}>
      <Copy
        style={[
          s.crowdName,
          { color },
          large && { fontSize: 30, lineHeight: 40 },
        ]}
      >
        {label}
      </Copy>
      <View
        accessibilityLabel={
          summary.stale
            ? "No recent crowd report"
            : `Crowd level: ${label}`
        }
        style={[s.meter, large && { width: 132, height: 7 }]}
      >
        {levels.map((level, i) => {
          const fill = Math.max(0, Math.min(1, filledSegments - i));
          return (
            <View key={level.name} style={s.meterPart}>
              {fill > 0 && (
                <View
                  style={{ width: `${fill * 100}%`, height: "100%", backgroundColor: meterColor }}
                />
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}
function VenuePhoto({
  venue,
  style,
}: {
  venue: Venue;
  style?: any;
}): React.JSX.Element {
  const [failed, setFailed] = useState(false);
  return (
    <View style={[s.photo, style]}>
      {venue.image && !failed ? (
        <Image
          source={{ uri: venue.image }}
          resizeMode="cover"
          style={StyleSheet.absoluteFill}
          onError={() => setFailed(true)}
          accessibilityLabel={`${venue.name}, illustrative venue photo`}
        />
      ) : (
        <View style={s.photoFallback}>
          <Users color={c.accent} size={30} strokeWidth={1.4} />
        </View>
      )}
    </View>
  );
}
// The bookmark as a status icon only (same look as the tappable one on Nearby).
function SavedMark({ saved }: { saved: boolean }): React.JSX.Element {
  return (
    <View
      accessible
      accessibilityLabel={saved ? "Saved" : "Not saved"}
      style={s.iconButton}
    >
      <Bookmark
        size={22}
        color={saved ? c.accent : c.ink}
        fill={saved ? c.savedFill : "none"}
        strokeWidth={1.7}
      />
    </View>
  );
}
// Venue page: one button that saves or unsaves, then waits 0.5 s before it
// can be pressed again. Saved state is shared, so every bookmark icon updates.
function SaveVenueButton({ venueId }: { venueId: number }): React.JSX.Element {
  const store = useStore();
  const saved = store.saved.includes(venueId);
  const [coolingDown, setCoolingDown] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: coolingDown }}
      disabled={coolingDown}
      onPress={async () => {
        setCoolingDown(true);
        try {
          await store.toggleSave(venueId);
        } finally {
          timer.current = setTimeout(() => setCoolingDown(false), SAVE_COOLDOWN_MS);
        }
      }}
      style={({ pressed }) => [
        s.saveVenueButton,
        // Saved: the saved-icon pink. Not saved: the "Moderate" crowd color.
        { backgroundColor: saved ? c.savedFill : levels[1].color },
        pressed && { opacity: 0.85 },
      ]}
    >
      <Bookmark size={16} color={c.white} fill={saved ? c.white : "none"} strokeWidth={1.8} />
      <Copy style={s.saveVenueText}>
        {saved ? "Remove venue from saved" : "Save this venue"}
      </Copy>
    </Pressable>
  );
}
function VenueRow({
  venue,
  compact = false,
  canSave = false,
}: {
  venue: Venue;
  compact?: boolean;
  // Only the Nearby list lets people save or unsave from the bookmark icon.
  // Elsewhere it just shows whether the venue is saved.
  canSave?: boolean;
}): React.JSX.Element {
  const store = useStore();
  const nav = useNavigation<any>();
  const { width } = useAppDimensions();
  const summary = crowdSummary(venue.id, store.reports, Date.now(), store.crowd[venue.id]);
  const distance = distanceMiles(venue, store.origin);
  return (
    <View style={[s.venueRow, compact && { paddingVertical: 12 }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View ${venue.name}, ${summary.stale ? "needs update" : crowdTrendLabel(venue.id, store.reports) ?? levels[summary.level!].name}`}
        onPress={() => nav.navigate("Venue", { id: venue.id })}
        style={({ pressed }) => [s.rowMain, pressed && { opacity: 0.7 }]}
      >
        <VenuePhoto
          venue={venue}
          style={compact || width < 600 ? { width: 64, height: 80 } : undefined}
        />
        <View style={s.rowContent}>
          <Copy style={s.venueName}>{venue.name}</Copy>
          <Copy style={s.meta}>{distance.toFixed(1)} mi</Copy>
          <View style={s.freshness}>
            <Clock3 size={12} color={c.muted} strokeWidth={1.7} />
            <Copy style={s.small}>{ageLabel(summary.age)}</Copy>
            {summary.total > 1 && (
              <>
                <View style={s.metaDot} />
                <CheckCheck size={13} color={c.muted} />
                <Copy style={s.small}>{summary.agreeing} agree</Copy>
              </>
            )}
          </View>
        </View>
      </Pressable>
      <View style={s.rowTrailing}>
        {canSave ? (
          <IconButton
            icon={Bookmark}
            label={
              store.saved.includes(venue.id)
                ? `Unsave ${venue.name}`
                : `Save ${venue.name}`
            }
            active={store.saved.includes(venue.id)}
            onPress={() => void store.toggleSave(venue.id)}
          />
        ) : (
          <SavedMark saved={store.saved.includes(venue.id)} />
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`View crowd at ${venue.name}`}
          onPress={() => nav.navigate("Venue", { id: venue.id })}
        >
          <Crowd venueId={venue.id} />
        </Pressable>
      </View>
    </View>
  );
}
function Brand(): React.JSX.Element {
  const { headerTitle } = useStore();
  const { top } = useSafeAreaInsets();
  const { height } = useAppDimensions();
  return (
    <View style={[s.brandOuter, { paddingTop: top }]}>
      {/* Equal-width sides keep the text centered, lined up with page titles. */}
      <View style={[s.brandBar, height < 500 && { height: 44 }]}>
        <View style={s.brandSide}>
          <Image
            source={LOGO}
            style={[s.brandLogo, height < 500 && { width: 30, height: 30 }]}
            accessible={false}
          />
        </View>
        <Copy accessibilityRole="header" style={s.wordmark} numberOfLines={1}>
          {headerTitle ?? "WhatsPoppin"}
        </Copy>
        <View style={[s.brandSide, { alignItems: "flex-end" }]}>
          {!API_URL && (
            <View style={s.previewTag}>
              <View style={s.previewDot} />
              <Copy style={s.previewText} numberOfLines={1}>
                Sample preview
              </Copy>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}
function BottomBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps): React.JSX.Element {
  const { bottom } = useSafeAreaInsets();
  const { height } = useAppDimensions();
  const icons: Record<string, any> = {
    Nearby: Compass,
    Saved: Bookmark,
    Profile: UserRound,
  };
  return (
    <View style={[s.tabOuter, { paddingBottom: Math.max(bottom, 8) }]}>
      <View style={s.tabInner}>
        {state.routes.map((route, i) => {
          const selected = state.index === i;
          const Icon = icons[route.name];
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => {
                const event = navigation.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!selected && !event.defaultPrevented)
                  navigation.navigate(route.name);
              }}
              style={({ pressed }) => [
                s.tab,
                height < 500 && { minHeight: 48, paddingTop: 6 },
                pressed && s.pressed,
              ]}
            >
              <Icon
                color={selected ? c.accent : c.muted}
                size={23}
                strokeWidth={selected ? 2.1 : 1.6}
              />
              <Copy
                style={[
                  s.tabText,
                  selected && { color: c.accent, fontFamily: f.bold },
                ]}
              >
                {route.name === "Profile" ? "You" : route.name}
              </Copy>
              {selected && <View style={s.tabIndicator} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
function Nearby(): React.JSX.Element {
  const store = useStore();
  const nav = useNavigation<any>();
  const { width, height } = useAppDimensions();
  const compact = height < 500;
  const desktop = width >= 1000;
  // On narrow phones List/Map show icons only so the location row stays on one line.
  const narrow = width < 420;
  const [mode, setMode] = useState("List");
  const [filter, setFilter] = useState<number | null>(null);
  const [sort, setSort] = useState<"distance" | "crowd">("distance");
  const venues = store.venues
    .filter((v) => distanceMiles(v, store.origin) <= store.radius)
    .filter(
      (v) =>
        filter === null ||
        (!crowdSummary(v.id, store.reports, Date.now(), store.crowd[v.id]).stale &&
          crowdSummary(v.id, store.reports, Date.now(), store.crowd[v.id]).level === filter),
    )
    .sort((a, b) =>
      sort === "distance"
        ? distanceMiles(a, store.origin) - distanceMiles(b, store.origin)
        : (crowdSummary(a.id, store.reports, Date.now(), store.crowd[a.id]).stale
            ? 5
            : crowdSummary(a.id, store.reports, Date.now(), store.crowd[a.id]).level!) -
          (crowdSummary(b.id, store.reports, Date.now(), store.crowd[b.id]).stale
            ? 5
            : crowdSummary(b.id, store.reports, Date.now(), store.crowd[b.id]).level!),
    );
  const { scrollProps, onTitleLayout } = useScrollTitle("Nearby Tonight");
  return (
    <ScrollView
      {...scrollProps}
      style={s.screen}
      contentContainerStyle={[s.page, compact && { paddingTop: 8 }]}
      refreshControl={
        <RefreshControl
          refreshing={store.refreshing}
          onRefresh={() => void store.refresh()}
          tintColor={c.accent}
        />
      }
    >
      <View onLayout={onTitleLayout} style={[s.pageHeading, compact && { marginBottom: 8 }]}>
        <View style={{ flex: 1 }}>
          <Copy
            accessibilityRole="header"
            style={[s.title, compact && { fontSize: 22, lineHeight: 30 }]}
          >
            Nearby Tonight
          </Copy>
        </View>
      </View>
      {!compact && (
        <Pressable
          accessibilityRole="button"
          onPress={() => nav.navigate("Search")}
          style={({ pressed }) => [s.searchBar, pressed && s.pressed]}
        >
          <Search size={19} color={c.muted} strokeWidth={1.7} />
          <Copy style={s.searchPlaceholder} numberOfLines={1}>
            Search bars and neighborhoods
          </Copy>
        </Pressable>
      )}
      <View style={[s.controls, compact && { marginBottom: 8 }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.filters}
        >
          {[
            { name: "All crowds", value: null },
            ...levels.map((l, value) => ({ name: l.name, value })),
          ].map((item) => (
            <Pressable
              key={item.name}
              accessibilityRole="button"
              accessibilityState={{ selected: filter === item.value }}
              onPress={() => setFilter(item.value)}
              style={({ pressed }) => [
                s.filter,
                filter === item.value && s.filterSelected,
                pressed && { opacity: 0.75 },
              ]}
            >
              <Copy
                style={[
                  s.filterText,
                  filter === item.value && { color: c.white },
                ]}
              >
                {item.name}
              </Copy>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      {store.error ? (
        <View style={s.errorBanner}>
          <Info color={c.packed} size={18} />
          <Copy style={[s.small, { color: c.packed, flex: 1 }]}>
            {store.error}
          </Copy>
          <Pressable
            onPress={() => void store.refresh()}
            accessibilityRole="button"
          >
            <Copy style={s.link}>Retry</Copy>
          </Pressable>
        </View>
      ) : null}
      <View style={s.resultsHeader}>
        <View style={s.locationBlock}>
          <View style={s.locationLine}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Change search area"
              onPress={() => store.setLocationSheet(true)}
              style={s.locationButton}
            >
              <MapPin size={17} color={c.accent} strokeWidth={1.8} />
              <Copy style={s.locationText} numberOfLines={1}>
                {store.origin === collegePark
                  ? "College Park, MD"
                  : "Near your location"}
              </Copy>
            </Pressable>
            <IconButton
              icon={Settings2}
              label="Set search area and radius"
              onPress={() => store.setLocationSheet(true)}
            />
          </View>
        </View>
        <View style={s.resultsRight}>
          <View style={s.resultActions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setSort(sort === "distance" ? "crowd" : "distance")}
              style={s.sortButton}
            >
              <Copy style={s.small}>
                {sort === "distance"
                  ? desktop
                    ? "Nearest first"
                    : "Nearest"
                  : desktop
                    ? "Quietest first"
                    : "Quietest"}
              </Copy>
              <ChevronDown size={14} color={c.muted} />
            </Pressable>
            {!desktop && (
              <View style={s.segment}>
                {["List", "Map"].map((item) => {
                  const Icon = item === "List" ? List : MapIcon;
                  return (
                    <Pressable
                      key={item}
                      accessibilityRole="button"
                      accessibilityLabel={item}
                      accessibilityState={{ selected: mode === item }}
                      onPress={() => setMode(item)}
                      style={[s.segmentItem, narrow && { paddingHorizontal: 12 }, mode === item && s.segmentActive]}
                    >
                      <Icon size={15} color={mode === item ? c.ink : c.muted} />
                      {!narrow && (
                        <Copy
                          style={[s.segmentText, mode === item && { color: c.ink }]}
                        >
                          {item}
                        </Copy>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        </View>
      </View>
      {!store.ready ? (
        <View style={s.empty}>
          <ActivityIndicator color={c.accent} />
          <Copy style={s.meta}>Finding your nearby spots…</Copy>
        </View>
      ) : (
        <View
          style={[s.discovery, desktop && { flexDirection: "row", gap: 32 }]}
        >
          {(desktop || mode === "List") && (
            <View style={s.listColumn}>
              {venues.length ? (
                venues.map((v) => <VenueRow key={v.id} venue={v} canSave />)
              ) : (
                <Empty
                  icon={Search}
                  title="No spots here yet"
                  detail={
                    filter !== null
                      ? "Try another crowd level or widen your search area."
                      : "Widen your search area to see more venues."
                  }
                  action="Reset filters"
                  onPress={() => {
                    setFilter(null);
                    store.setRadius(5);
                  }}
                />
              )}
              <View style={s.reportPrompt}>
                <View style={s.promptIcon}>
                  <Users size={22} color={c.accent} strokeWidth={1.7} />
                </View>
                <View style={{ flex: 1 }}>
                  <Copy style={s.promptTitle}>Out right now?</Copy>
                  <Copy style={s.small}>
                    A quick report helps the next person.
                  </Copy>
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => store.openReport()}
                  style={s.promptAction}
                >
                  <Copy style={s.link}>Report</Copy>
                  <ArrowUpRight size={17} color={c.accent} />
                </Pressable>
              </View>
            </View>
          )}
          {(desktop || mode === "Map") && (
            <View style={[s.mapColumn, !desktop && { width: "100%" }]}>
              <View
                style={[
                  s.mapContainer,
                  !desktop && { height: compact ? 240 : 360 },
                ]}
              >
                <MapPanel
                  venues={venues}
                  reports={store.reports}
                  crowd={store.crowd}
                  origin={store.origin}
                  onSelect={(id) => nav.navigate("Venue", { id })}
                />
                <View pointerEvents="none" style={s.mapLabel}>
                  <MapPin size={14} color={c.accent} />
                  <Copy style={s.mapLabelText}>
                    {store.origin === collegePark
                      ? "College Park"
                      : "Your search area"}
                  </Copy>
                </View>
              </View>
              <View style={s.mapLegend}>
                {levels.map((l) => (
                  <View key={l.name} style={s.legendItem}>
                    <View style={[s.legendDot, { backgroundColor: l.color }]} />
                    <Copy style={s.small}>{l.name}</Copy>
                  </View>
                ))}
              </View>
              <Copy style={[s.small, { textAlign: "center", marginTop: 12 }]}>
                {API_URL
                  ? "Tap a marker to see the venue."
                  : "Sample reports and locations. Tap a marker for details."}
              </Copy>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}
function Empty({
  icon: Icon,
  title,
  detail,
  action,
  onPress,
}: {
  icon: any;
  title: string;
  detail: string;
  action?: string;
  onPress?: () => void;
}): React.JSX.Element {
  return (
    <View style={s.empty}>
      <View style={s.emptyIcon}>
        <Icon size={30} color={c.accent} strokeWidth={1.5} />
      </View>
      <Copy style={s.sectionTitle}>{title}</Copy>
      <Copy style={[s.meta, { textAlign: "center", maxWidth: 300 }]}>
        {detail}
      </Copy>
      {action && onPress && (
        <Button outline onPress={onPress}>
          {action}
        </Button>
      )}
    </View>
  );
}
function matchesVenue(venue: Venue, query: string) {
  return `${venue.name} ${venue.kind} ${venue.city} ${venue.address}`
    .toLowerCase()
    .includes(query.trim().toLowerCase());
}

function VenueSearchBar({ query, setQuery, autoFocus = false, label = "Search venues" }: {
  query: string;
  setQuery: (query: string) => void;
  autoFocus?: boolean;
  label?: string;
}) {
  const input = useRef<TextInput>(null);
  return (
    <View style={s.searchBar}>
      <Search size={19} color={c.muted} strokeWidth={1.7} />
      <TextInput
        ref={input}
        autoFocus={autoFocus}
        accessibilityLabel={label}
        value={query}
        onChangeText={setQuery}
        placeholder="Bar, neighborhood, or street"
        placeholderTextColor={c.placeholder}
        style={s.searchInput}
        returnKeyType="search"
        autoCorrect={false}
      />
      {query ? (
        <IconButton
          icon={X}
          label="Clear search"
          onPress={() => {
            setQuery("");
            input.current?.focus();
          }}
        />
      ) : null}
    </View>
  );
}

function Saved(): React.JSX.Element {
  const store = useStore();
  const nav = useNavigation<any>();
  const [query, setQuery] = useState("");
  const venues = store.venues.filter((v) => store.saved.includes(v.id));
  const results = venues.filter((v) => matchesVenue(v, query));
  const searching = Boolean(query.trim());
  const { scrollProps, onTitleLayout } = useScrollTitle("Saved Spots");
  return (
    <ScrollView {...scrollProps} keyboardShouldPersistTaps="handled" style={s.screen} contentContainerStyle={s.page}>
      <View onLayout={onTitleLayout} style={s.pageHeading}>
        <View style={{ flex: 1 }}>
          <Copy style={s.title}>Saved Spots</Copy>
        </View>
      </View>
      <VenueSearchBar query={query} setQuery={setQuery} label="Search saved venues" />
      <View style={s.resultsHeader}>
        <Copy style={s.sectionTitle}>
          {searching
            ? `${results.length} ${results.length === 1 ? "match" : "matches"}`
            : `${venues.length} saved ${venues.length === 1 ? "spot" : "spots"}`}
        </Copy>
      </View>
      {results.length ? (
        results.map((v) => <VenueRow key={v.id} venue={v} />)
      ) : searching && venues.length ? (
        <Empty icon={Search} title="No matching saved spots" detail="Try another venue name or street." />
      ) : (
        <Empty
          icon={Bookmark}
          title="Keep a few good spots close"
          detail="Tap the bookmark on a venue to find it here, with its latest crowd report."
          action="Explore nearby"
          onPress={() => nav.navigate("Nearby")}
        />
      )}
    </ScrollView>
  );
}
function BackHeader({ title }: { title: string }): React.JSX.Element {
  const nav = useNavigation<any>();
  return (
    <View style={s.backHeader}>
      <IconButton
        icon={ArrowLeft}
        label="Go back"
        onPress={() => (nav.canGoBack() ? nav.goBack() : nav.navigate("Main"))}
      />
      <Copy style={s.backTitle}>{title}</Copy>
      <View style={{ width: 44 }} />
    </View>
  );
}
function SearchScreen(): React.JSX.Element {
  const store = useStore();
  const [query, setQuery] = useState("");
  const results = store.venues
    .filter((v) => matchesVenue(v, query))
    .sort(
      (a, b) => distanceMiles(a, store.origin) - distanceMiles(b, store.origin),
    );
  return (
    <View style={s.screen}>
      <BackHeader title="Search" />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.page}
      >
        <VenueSearchBar query={query} setQuery={setQuery} autoFocus />
        <View style={s.resultsHeader}>
          <Copy style={s.sectionTitle}>
            {query
              ? `${results.length} ${results.length === 1 ? "match" : "matches"}`
              : "Around College Park"}
          </Copy>
        </View>
        {results.length ? (
          results.map((v) => <VenueRow key={v.id} venue={v} />)
        ) : (
          <Empty
            icon={Search}
            title="No matching spots"
            detail="Try a venue name or a nearby street."
          />
        )}
      </ScrollView>
    </View>
  );
}
// Everything is drawn inside one SVG sized to the real width, so labels sit exactly
// on their gridlines and data points and nothing can overlap or stretch.
const TREND_LABEL_COLUMN = 52;
const TREND_PLOT_HEIGHT = 125;
const TREND_HEIGHT = TREND_PLOT_HEIGHT + 17;
function Trend({ reports }: { reports: Report[] }): React.JSX.Element {
  const [width, setWidth] = useState(344);
  const buckets = crowdTrendBuckets(reports);
  const plotLeft = TREND_LABEL_COLUMN;
  const plotRight = width - 8;
  const spacing = (plotRight - plotLeft - 32) / 4;
  const bucketX = (i: number) => plotLeft + 16 + i * spacing;
  const points = buckets.flatMap((value, i) =>
    value === null ? [] : [{ x: bucketX(i), y: 105 - value * 27, bucket: i }],
  );
  const label = { fontFamily: f.regular, fontSize: 11, fill: c.muted };
  return (
    <View
      style={s.trend}
      onLayout={(e) => setWidth(Math.max(240, e.nativeEvent.layout.width))}
    >
      <Svg height={TREND_HEIGHT} width={width} viewBox={`0 0 ${width} ${TREND_HEIGHT}`}>
        {[24, 51, 78, 105].map((y) => (
          <Line
            key={y}
            x1={plotLeft}
            y1={y}
            x2={plotRight}
            y2={y}
            stroke={c.border}
            strokeDasharray="4 4"
          />
        ))}
        <SvgText x={0} y={24 + 4} {...label}>
          Packed
        </SvgText>
        <SvgText x={0} y={105 + 4} {...label}>
          Quiet
        </SvgText>
        {points
          .slice(1)
          .map((p, i) =>
            p.bucket === points[i].bucket + 1 ? (
              <Line
                key={`segment-${i}`}
                x1={points[i].x}
                y1={points[i].y}
                x2={p.x}
                y2={p.y}
                stroke={c.accent}
                strokeWidth={2.5}
              />
            ) : null,
          )}
        {points.map((p, i) => (
          <Circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={4}
            fill={c.accent}
            stroke={c.white}
            strokeWidth={2}
          />
        ))}
        {[
          { text: "1 hr ago", i: 0 },
          { text: "30 min ago", i: 2 },
          { text: "Now", i: 4 },
        ].map(({ text, i }) => (
          <SvgText
            key={text}
            x={bucketX(i)}
            y={105 + 30}
            textAnchor="middle"
            {...label}
          >
            {text}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}
function RecentReport({ report: r }: { report: Report }): React.JSX.Element {
  return (
    <View style={s.recentReport}>
      <View style={s.reportAvatar}>
        <UserRound size={17} color={c.muted} />
      </View>
      <View style={{ flex: 1 }}>
        <Copy style={s.factValue}>
          {r.mine
            ? "Your report"
            : API_URL
              ? "Community member"
              : "Sample community member"}
        </Copy>
        <Copy style={s.small}>
          {ageLabel(
            Math.max(
              0,
              Math.floor((Date.now() - Date.parse(r.createdAt)) / 60000),
            ),
          )}
        </Copy>
      </View>
      <Copy style={{ color: levels[r.level].color, fontFamily: f.bold }}>
        {levels[r.level].name}
      </Copy>
    </View>
  );
}
function VenueDetail({ route }: any): React.JSX.Element {
  const store = useStore();
  const venue = store.venues.find((v) => v.id === route.params.id);
  const { width } = useWindowDimensions();
  const { bottom } = useSafeAreaInsets();
  if (!venue)
    return (
      <View style={s.screen}>
        <BackHeader title="Venue" />
        <Empty
          icon={MapPin}
          title="Venue not found"
          detail="Go back to Nearby to choose another spot."
        />
      </View>
    );
  const summary = crowdSummary(venue.id, store.reports, Date.now(), store.crowd[venue.id]);
  const saved = store.saved.includes(venue.id);
  const distance = distanceMiles(venue, store.origin);
  const venueReports = store.reports
    .filter((r) => r.venueId === venue.id)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const twoColumns = Platform.OS !== "web" && width >= 900;
  return (
    <View style={s.screen}>
      <BackHeader title="Venue details" />
      <ScrollView
        contentContainerStyle={[s.detailPage, { paddingBottom: 108 + bottom }]}
      >
        <View
          style={[
            s.detailLayout,
            twoColumns && { flexDirection: "row", gap: 36 },
          ]}
        >
          {/* flex: 1 only splits width side by side. When stacked it would split the
              height in half and let the first column's content spill over the second. */}
          <View style={twoColumns ? { flex: 1 } : undefined}>
            <View style={s.detailPhoto}>
              <VenuePhoto
                venue={venue}
                style={{ width: "100%", height: "100%", borderRadius: 12 }}
              />
              {!API_URL && (
                <View style={s.photoCaption}>
                  <Copy style={s.photoCaptionText}>Illustrative photo</Copy>
                </View>
              )}
            </View>
            <View style={s.detailHeading}>
              <View style={{ flex: 1 }}>
                <Copy style={s.detailTitle}>{venue.name}</Copy>
                <Copy style={s.meta}>
                  {distance.toFixed(1)} mi away
                </Copy>
              </View>
              <SavedMark saved={saved} />
            </View>
            <SaveVenueButton venueId={venue.id} />
            <View style={s.detailCrowd}>
              <View>
                <Copy style={s.meta}>The crowd right now</Copy>
                <Crowd venueId={venue.id} large />
                <Copy style={[s.meta, { marginTop: 10 }]}>
                  {summary.stale
                    ? summary.latest
                      ? "No recent reports for this venue."
                      : "Be the first to report the crowd."
                    : "Based on the past hour of crowd reports."}
                </Copy>
              </View>
              <View style={s.crowdContext}>
                <View style={s.contextLine}>
                  <Clock3 size={15} color={c.muted} />
                  <Copy style={s.small}>{ageLabel(summary.age)}</Copy>
                </View>
                <View style={s.contextLine}>
                  <Users size={15} color={c.muted} />
                  <Copy style={s.small}>
                    {summary.total > 1
                      ? summary.level === null
                        ? `${summary.agreeing} of ${summary.total} agree`
                        : `${summary.agreeing} of ${summary.total} agree with “${levels[summary.level].name}”`
                      : summary.total === 1
                        ? "1 recent report"
                        : "No recent reports"}
                  </Copy>
                </View>
                <Copy style={s.tiny}>
                  {summary.total > 1
                    ? "Reported in the last 30 min"
                    : "A new report would help"}
                </Copy>
              </View>
            </View>
            <View style={s.detailFacts}>
              <View style={s.fact}>
                <Clock3 size={18} color={c.muted} />
                <View>
                  <Copy style={s.small}>Door wait</Copy>
                  <Copy style={s.factValue}>
                    {!summary.stale &&
                    summary.latest?.wait !== null &&
                    summary.latest?.wait !== undefined
                      ? waitLabels[summary.latest.wait]
                      : "Not reported"}
                  </Copy>
                </View>
              </View>
              <View style={s.fact}>
                <Copy style={s.dollar}>$</Copy>
                <View>
                  <Copy style={s.small}>Cover</Copy>
                  <Copy style={s.factValue}>
                    {venue.cover === null
                      ? "Not listed"
                      : venue.cover === 0
                        ? "No cover"
                        : `$${venue.cover}`}
                  </Copy>
                </View>
              </View>
            </View>
            <View style={s.detailSection}>
              <Copy style={s.sectionTitle}>Recent crowd trend</Copy>
              <Copy style={[s.small, { marginTop: 4 }]}>
                Based on reports from the past hour
              </Copy>
              {venueReports.some(
                (r) => Date.now() - Date.parse(r.createdAt) <= 3600000,
              ) ? (
                <>
                  <Trend reports={venueReports} />
                  <Copy style={s.tiny}>
                    Gaps mean there are no reports for that time.
                  </Copy>
                </>
              ) : (
                <Copy style={[s.meta, { marginTop: 20 }]}>
                  Not enough recent reports to show a trend.
                </Copy>
              )}
            </View>
          </View>
          <View style={twoColumns ? { flex: 1 } : undefined}>
            <View style={s.detailSection}>
              <Copy style={s.sectionTitle}>Getting there</Copy>
              <View
                style={[
                  s.contextLine,
                  { marginTop: 20, alignItems: "flex-start" },
                ]}
              >
                <MapPin color={c.accent} size={20} />
                <View style={{ flex: 1 }}>
                  <Copy style={s.factValue}>{venue.address}</Copy>
                  <Copy style={s.meta}>{venue.city}</Copy>
                </View>
              </View>
              <View style={[s.contextLine, { marginTop: 16 }]}>
                <Clock3 color={c.accent} size={20} />
                <Copy style={s.factValue}>
                  {venue.hours ?? "Hours not listed"}
                </Copy>
              </View>
              <View style={s.miniMap}>
                <MapPanel
                  venues={[venue]}
                  reports={store.reports}
                  crowd={store.crowd}
                  origin={{
                    latitude: venue.latitude,
                    longitude: venue.longitude,
                  }}
                  onSelect={() => {}}
                />
              </View>
              <Button
                outline
                icon={ArrowUpRight}
                onPress={() =>
                  void Linking.openURL(
                    `https://www.google.com/maps/dir/?api=1&destination=${venue.latitude},${venue.longitude}`,
                  )
                }
              >
                Get directions
              </Button>
            </View>
            <View style={s.detailSection}>
              <Copy style={s.sectionTitle}>Latest reports</Copy>
              {venueReports.slice(0, 3).map((r) => (
                <RecentReport key={r.id} report={r} />
              ))}
              {!venueReports.length && (
                <Copy style={[s.meta, { marginTop: 16 }]}>
                  No reports yet. Share what you’re seeing.
                </Copy>
              )}
            </View>
            {!API_URL && (
              <View style={s.sampleNote}>
                <Info color={c.muted} size={16} />
                <Copy style={[s.small, { flex: 1 }]}>
                  Preview data: crowd levels, hours, cover, and venue locations
                  are illustrative.
                </Copy>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
      <View style={[s.detailCta, { paddingBottom: Math.max(bottom, 16) }]}>
        <View style={s.detailCtaInner}>
          <Button icon={Users} onPress={() => store.openReport(venue)}>
            Report the crowd
          </Button>
          <Copy style={[s.tiny, { textAlign: "center", marginTop: 8 }]}>
            At the venue? Share a quick update.
          </Copy>
        </View>
      </View>
    </View>
  );
}
function Profile({ route }: { route: { params?: { auth?: "signIn" | "register" } } }): React.JSX.Element {
  const store = useStore();
  const nav = useNavigation<any>();
  // No page title here: once the name scrolls away, the top bar shows "Your Profile".
  const profileScroll = useScrollTitle(store.account ? "Your Profile" : null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [about, setAbout] = useState(false);
  const auth = route.params?.auth;
  const token = store.account?.token;
  const [history, setHistory] = useState<Report[] | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const [visibleReportCount, setVisibleReportCount] = useState(3);
  useEffect(() => setVisibleReportCount(3), [token]);
  useFocusEffect(
    useCallback(() => {
      setHistory(null);
      setHistoryError(false);
      if (!API_URL || !token) return;

      let active = true;
      let timer: ReturnType<typeof setTimeout> | undefined;
      async function refreshHistory() {
        try {
          const reports: Report[] = await request("/reports/mine/", {}, token);
          if (active) {
            setHistory(reports);
            setHistoryError(false);
          }
        } catch {
          if (active) {
            setHistory(null);
            setHistoryError(true);
          }
        } finally {
          if (active) timer = setTimeout(refreshHistory, 30_000);
        }
      }

      void refreshHistory();
      return () => {
        active = false;
        clearTimeout(timer);
      };
    }, [token]),
  );
  useEffect(() => {
    if (!auth) return;
    setRegister(auth === "register");
    nav.setParams({ auth: undefined });
  }, [auth, nav]);
  if (register)
    return (
      <Registration
        complete={(newUsername) => {
          // Back to the sign-in page with the new username filled in.
          setRegister(false);
          setUsername(newUsername);
          setPassword("");
          setError("");
          store.toast("Account created. Sign in to continue.");
        }}
        back={() => setRegister(false)}
      />
    );
  const historyLimit = Math.min(history?.length ?? 0, 30);
  const recentReports = history?.slice(0, Math.min(visibleReportCount, historyLimit)) ?? [];
  const nextReportCount = Math.min(10, historyLimit - recentReports.length);
  return (
    <ScrollView
      {...profileScroll.scrollProps}
      keyboardShouldPersistTaps="handled"
      style={s.screen}
      contentContainerStyle={[s.page, { maxWidth: 760 }, !store.account && s.guestProfilePage]}
    >
      {store.account && (
        <>
          <View onLayout={profileScroll.onTitleLayout} style={s.profileIdentity}>
            <View style={s.profileAvatar}>
              <UserRound size={30} color={c.accent} strokeWidth={1.4} />
            </View>
            <Copy accessibilityRole="header" style={s.profileName}>
              {store.account.first_name || store.account.username}
            </Copy>
            <Copy style={[s.meta, { textAlign: "center" }]}>
              Community member
            </Copy>
          </View>
          <View style={s.profileCounts}>
            <Pressable
              accessibilityRole="button"
              onPress={() => nav.navigate("Saved")}
              style={s.countBlock}
            >
              <Copy style={s.count}>{store.saved.length}</Copy>
              <Copy style={s.meta}>Saved spots</Copy>
            </Pressable>
            <View style={s.countDivider} />
            <View style={s.countBlock}>
              <Copy style={s.count}>{history?.length ?? "—"}</Copy>
              <Copy style={s.meta}>Your reports</Copy>
            </View>
          </View>
        </>
      )}
      {!store.account && (
        <View style={s.guestAuth}>
          <Copy accessibilityRole="header" style={[s.title, { marginBottom: 12 }]}>{API_URL ? "Sign In" : "Sample Preview"}</Copy>
          {API_URL && (
            <View style={{ gap: 12 }}>
              <Copy style={s.factValue}>Username or email</Copy>
              <TextInput
                accessibilityLabel="Username or email"
                value={username}
                onChangeText={setUsername}
                style={s.field}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                keyboardType="email-address"
              />
              <Copy style={s.factValue}>Password</Copy>
              <TextInput
                accessibilityLabel="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                style={s.field}
                autoComplete="current-password"
              />
              <Pressable
                accessibilityRole="button"
                onPress={() => setShowPassword((shown) => !shown)}
                style={({ pressed }) => [s.passwordToggle, pressed && s.pressed]}
              >
                {showPassword ? <EyeOff size={18} color={c.accent} /> : <Eye size={18} color={c.accent} />}
                <Copy style={s.passwordToggleText}>
                  {showPassword ? "Hide password" : "Show password"}
                </Copy>
              </Pressable>
              {error ? (
                <Copy accessibilityRole="alert" style={{ color: c.packed }}>
                  {error}
                </Copy>
              ) : null}
              <Button
                busy={busy}
                disabled={!username || !password}
                onPress={async () => {
                  const invalid = signInIdentifierError(username);
                  if (invalid) {
                    setError(invalid);
                    return;
                  }
                  setBusy(true);
                  setError("");
                  try {
                    await store.signIn(username.trim(), password);
                    setPassword("");
                    setShowPassword(false);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Sign in
              </Button>
            </View>
          )}
          <Button outline disabled={busy} onPress={() => setRegister(true)}>Create account</Button>
        </View>
      )}
      {store.account && (
        <View style={s.detailSection}>
          <Copy style={s.sectionTitle}>Your recent reports</Copy>
          {history === null ? (
            <Copy style={s.meta}>
              {historyError ? "Couldn’t load your reports." : "Loading your reports…"}
            </Copy>
          ) : recentReports.length ? (
            recentReports.map((r) => (
              <View key={r.id} style={s.recentReport}>
                <View style={s.reportAvatar}>
                  <Check size={18} color={c.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Copy style={s.factValue}>
                    {store.venues.find((v) => v.id === r.venueId)?.name ??
                      "Venue"}
                  </Copy>
                  <Copy style={s.small}>
                    {ageLabel(
                      Math.floor((Date.now() - Date.parse(r.createdAt)) / 60000),
                    )}
                  </Copy>
                </View>
                <Copy
                  style={{ color: levels[r.level].color, fontFamily: f.bold }}
                >
                  {levels[r.level].name}
                </Copy>
              </View>
            ))
          ) : (
            <View style={{ paddingVertical: 24 }}>
              <Copy style={s.meta}>Nothing to report yet.</Copy>
              <Copy style={[s.small, { marginTop: 4 }]}>
                Your updates will appear here after you share one.
              </Copy>
            </View>
          )}
          {nextReportCount > 0 && (
            <Pressable
              accessibilityRole="button"
              onPress={() => setVisibleReportCount((count) => Math.min(count + 10, 30))}
              style={({ pressed }) => [s.passwordToggle, pressed && s.pressed]}
            >
              <ChevronDown size={18} color={c.accent} />
              <Copy style={s.passwordToggleText}>
                Show more reports
              </Copy>
            </Pressable>
          )}
          {recentReports.length > 3 && (
            <Pressable
              accessibilityRole="button"
              onPress={() => setVisibleReportCount(3)}
              style={({ pressed }) => [s.passwordToggle, pressed && s.pressed]}
            >
              <Copy style={s.passwordToggleText}>Show fewer reports</Copy>
            </Pressable>
          )}
        </View>
      )}
      <View style={!store.account && s.guestFooter}>
      <Pressable
        accessibilityRole="button"
        onPress={() => store.setLocationSheet(true)}
        style={store.account ? s.settingsRow : s.guestUtility}
      >
        <MapPin size={store.account ? 20 : 15} color={c.muted} />
        <Copy style={store.account ? s.factValue : s.guestUtilityText}>Search area</Copy>
        <View style={{ flex: 1 }} />
        <Copy style={s.small}>{store.radius} mi</Copy>
        <ChevronRight size={store.account ? 18 : 14} color={c.muted} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: about }}
        onPress={() => setAbout(!about)}
        style={store.account ? s.settingsRow : s.guestUtility}
      >
        <Info size={store.account ? 20 : 15} color={c.muted} />
        <Copy style={store.account ? s.factValue : s.guestUtilityText}>How crowd reports work</Copy>
        <View style={{ flex: 1 }} />
        <ChevronDown size={store.account ? 18 : 14} color={c.muted} />
      </Pressable>
      {about && (
        <View style={s.about}>
          <Copy style={s.meta}>
            Reports are snapshots from people at a venue. We show the latest
            crowd level, its age, and how many reports agree in the past 30
            minutes. After 30 minutes, a crowd level needs an update. Conditions
            can change between reports.
          </Copy>
        </View>
      )}
      </View>
      {store.account && (
        <Button
          outline
          style={{ marginTop: 24 }}
          onPress={() => void store.signOut()}
        >
          Sign out
        </Button>
      )}
      {!API_URL && (
        <View style={[s.sampleNote, { marginTop: 28 }]}>
          <Info size={18} color={c.muted} />
          <Copy style={[s.small, { flex: 1 }]}>
            Sample preview. Account features require a connection to WhatsPoppin.
          </Copy>
        </View>
      )}
      {store.account && <Copy style={[s.tiny, { textAlign: "center", marginTop: 32 }]}>
        WhatsPoppin · College Park
      </Copy>}
    </ScrollView>
  );
}
function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const { bottom } = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  return (
    <Modal
      visible={visible}
      transparent
      animationType={reducedMotion ? "none" : "fade"}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={s.modalRoot}
      >
        <Pressable
          accessibilityLabel="Close dialog"
          accessibilityRole="button"
          onPress={onClose}
          style={s.scrim}
        />
        <View
          accessibilityViewIsModal
          role="dialog"
          aria-label={title}
          style={[s.sheet, { paddingBottom: Math.max(bottom, 24) }]}
        >
          <View style={s.sheetHeader}>
            <Copy style={s.sheetTitle}>{title}</Copy>
            <IconButton icon={X} label="Close" onPress={onClose} />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
// Shown only when the system will no longer prompt, so settings are the only way to turn location on.
function LocationHelp({
  access,
}: {
  access: LocationAccess | null;
}): React.JSX.Element | null {
  if (access !== "blocked") return null;
  if (Platform.OS === "web")
    return (
      <Copy style={[s.tiny, { textAlign: "center", marginTop: 8 }]}>
        Location is blocked for this site. Allow it from the lock icon in your
        browser’s address bar, then try again.
      </Copy>
    );
  return (
    <View style={{ marginTop: 8 }}>
      <Copy style={[s.tiny, { textAlign: "center", marginBottom: 8 }]}>
        Location is off for WhatsPoppin. Turn it on in Settings, then come
        back.
      </Copy>
      <Button outline onPress={openLocationSettings}>
        Open Settings
      </Button>
    </View>
  );
}
function ReportSheet(): React.JSX.Element {
  const store = useStore();
  const venue = store.reportVenue;
  const [selected, setSelected] = useState<number | null>(null);
  const [wait, setWait] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [verified, setVerified] = useState<boolean | null>(null);
  const [access, recheckAccess] = useLocationAccess();
  useEffect(() => {
    setSelected(null);
    setWait(null);
    setError("");
    setSuccess(false);
    setVerified(null);
  }, [venue?.id]);
  const close = () => {
    if (!busy) store.setReportVenue(null);
  };
  return (
    <Sheet
      visible={!!venue}
      onClose={close}
      title={success ? "You’re helping the next person" : "How’s the crowd?"}
    >
      {success ? (
        <View style={s.reportSuccess}>
          <View style={s.successIcon}>
            <Check size={34} color={c.accent} />
          </View>
          <Copy style={s.sectionTitle}>Report shared</Copy>
          <Copy style={[s.meta, { textAlign: "center" }]}>
            {venue?.name} is {levels[selected ?? 0].name.toLowerCase()} right
            now. Thanks for the heads-up.
          </Copy>
          {verified === false && (
            <Copy style={[s.tiny, { textAlign: "center" }]}>
              We couldn’t confirm you’re at the venue, so this report counts
              for less. Allow location next time to give reports full weight.
            </Copy>
          )}
          {verified === false && <LocationHelp access={access} />}
          <Button onPress={close}>Done</Button>
        </View>
      ) : (
        <>
          <Copy style={s.reportVenueName}>{venue?.name}</Copy>
          <Copy style={[s.meta, { marginBottom: 24 }]}>
            Report what you’re seeing at the venue.
          </Copy>
          <View style={{ gap: 10 }}>
            {levels.map((level, i) => (
              <Pressable
                key={level.name}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected === i }}
                disabled={busy}
                onPress={() => setSelected(i)}
                style={({ pressed }) => [
                  s.levelOption,
                  selected === i && {
                    borderColor: c.accent,
                    backgroundColor: c.accentLight,
                  },
                  pressed && s.pressed,
                ]}
              >
                <View style={s.optionMeter}>
                  {levels.map((_, j) => (
                    <View
                      key={j}
                      style={{
                        width: 5,
                        height: 8 + j * 5,
                        borderRadius: 2,
                        backgroundColor: j <= i ? level.color : c.border,
                      }}
                    />
                  ))}
                </View>
                <View style={{ flex: 1 }}>
                  <Copy style={s.optionTitle}>{level.name}</Copy>
                  <Copy style={s.optionDetail}>{level.detail}</Copy>
                </View>
                <View
                  style={[
                    s.radio,
                    selected === i && {
                      borderColor: c.accent,
                      backgroundColor: c.accent,
                    },
                  ]}
                >
                  {selected === i && <Check size={13} color={c.white} />}
                </View>
              </Pressable>
            ))}
          </View>
          <View style={s.waitHeader}>
            <Copy style={s.factValue}>Wait to get in?</Copy>
            <Copy style={s.small}>Optional</Copy>
          </View>
          <View style={s.waitOptions}>
            {waitLabels.map((label, i) => (
              <Pressable
                key={i}
                accessibilityRole="button"
                accessibilityState={{ selected: wait === i }}
                onPress={() => setWait(wait === i ? null : i)}
                style={[
                  s.waitOption,
                  wait === i && {
                    borderColor: c.accent,
                    backgroundColor: c.accentLight,
                  },
                ]}
              >
                <Copy style={[s.small, wait === i && { color: c.accent }]}>
                  {label}
                </Copy>
              </Pressable>
            ))}
          </View>
          {error && (
            <Copy
              accessibilityRole="alert"
              style={[s.errorText, { marginBottom: 12 }]}
            >
              {error}
            </Copy>
          )}
          <Button
            busy={busy}
            disabled={selected === null}
            onPress={async () => {
              if (selected === null) return;
              setBusy(true);
              setError("");
              try {
                setVerified(await store.submitReport(selected, wait));
                recheckAccess();
                setSuccess(true);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Share crowd report
          </Button>
          <Copy style={[s.tiny, { textAlign: "center", marginTop: 12 }]}>
            {API_URL
              ? "Only report if you’re at the venue. We check your location once to confirm that, and don’t save it."
              : "Preview report · saved on this device"}
          </Copy>
        </>
      )}
    </Sheet>
  );
}
function LocationSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const store = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [access, recheckAccess] = useLocationAccess();
  // Choices are a draft until "Show nearby spots" is tapped. Closing the sheet
  // any other way leaves the current area and radius as they were.
  const [origin, setOrigin] = useState(store.origin);
  const [radius, setRadius] = useState(store.radius);
  useEffect(() => {
    if (!visible) return;
    setOrigin(store.origin);
    setRadius(store.radius);
    setError("");
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const apply = () => {
    store.setOrigin(origin);
    store.setRadius(radius);
    onClose();
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Your search area">
      <Copy style={[s.meta, { marginBottom: 20 }]}>
        Find a spot close enough to make it your next stop.
      </Copy>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: origin === collegePark }}
        onPress={() => {
          setOrigin(collegePark);
          setError("");
        }}
        style={s.settingsRow}
      >
        <MapPin size={20} color={c.accent} />
        <Copy style={s.factValue}>College Park, MD</Copy>
        <View style={{ flex: 1 }} />
        {origin === collegePark && <Check size={18} color={c.accent} />}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={async () => {
          setBusy(true);
          setError("");
          try {
            const permission =
              await Location.requestForegroundPermissionsAsync();
            if (!permission.granted)
              throw new Error(
                "Location access is off. You can still browse College Park.",
              );
            const location = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            setOrigin({
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
            });
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
            recheckAccess();
          }
        }}
        style={s.settingsRow}
      >
        <LocateFixed size={20} color={c.accent} />
        <Copy style={s.factValue}>Use my current location</Copy>
        <View style={{ flex: 1 }} />
        {busy ? (
          <ActivityIndicator color={c.accent} />
        ) : (
          origin !== collegePark && <Check size={18} color={c.accent} />
        )}
      </Pressable>
      {error ? (
        <Copy accessibilityRole="alert" style={s.errorText}>
          {error}
        </Copy>
      ) : null}
      <LocationHelp access={access} />
      <Copy style={[s.sectionTitle, { marginTop: 28, marginBottom: 16 }]}>
        Search radius
      </Copy>
      <View style={[s.waitOptions, { marginBottom: 24 }]}>
        {[1, 2, 5, 10].map((miles) => (
          <Pressable
            key={miles}
            accessibilityRole="button"
            accessibilityState={{ selected: radius === miles }}
            onPress={() => setRadius(miles)}
            style={[
              s.waitOption,
              { flex: 1 },
              radius === miles && {
                borderColor: c.accent,
                backgroundColor: c.accentLight,
              },
            ]}
          >
            <Copy style={[s.factValue, { textAlign: "center" }]}>
              {miles} mi
            </Copy>
          </Pressable>
        ))}
      </View>
      <Button onPress={apply} disabled={busy}>Show nearby spots</Button>
    </Sheet>
  );
}
function MainTabs(): React.JSX.Element {
  return (
    <Tabs.Navigator
      screenOptions={{ headerShown: false, animation: "none" }}
      tabBar={(props) => <BottomBar {...props} />}
    >
      <Tabs.Screen name="Nearby" component={Nearby} />
      <Tabs.Screen name="Saved" component={Saved} />
      <Tabs.Screen name="Profile" component={Profile} />
    </Tabs.Navigator>
  );
}
function AppContent(): React.JSX.Element {
  const reducedMotion = useReducedMotion();
  const [venues, setVenues] = useState<Venue[]>(API_URL ? [] : demoVenues);
  const [reports, setReports] = useState<Report[]>([]);
  const [crowd, setCrowd] = useState<Record<number, ServerCrowd>>({});
  const [saved, setSaved] = useState<number[]>([]);
  const [ready, setReady] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [origin, setOrigin] = useState(collegePark);
  const [radius, setRadius] = useState(2);
  const [reportVenue, setReportVenue] = useState<Venue | null>(null);
  const [picker, setPicker] = useState(false);
  const [authPrompt, setAuthPrompt] = useState<"save" | "report" | null>(null);
  const navigation = useNavigationContainerRef<Routes>();
  const openAuth = (auth: "signIn" | "register") => {
    setAuthPrompt(null);
    navigation.navigate("Main", { screen: "Profile", params: { auth } });
  };
  const [locationSheet, setLocationSheet] = useState(false);
  const [notice, setNotice] = useState("");
  const [headerTitle, setHeaderTitle] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, setMinute] = useState(0);
  const toast = (message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 3000);
  };
  useEffect(() => {
    const interval = setInterval(() => setMinute((n) => n + 1), 30000);
    return () => {
      clearInterval(interval);
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, []);
  const refresh = async () => {
    setRefreshing(true);
    setError("");
    try {
      if (API_URL) {
        const data = await loadVenues();
        setVenues(data.venues);
        setCrowd(data.crowd);
        setReports((previous) =>
          data.reports.map((r) => ({
            ...r,
            mine: previous.some((p) => p.id === r.id && p.mine),
          })),
        );
      } else {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    } catch (e) {
      setError(
        "Couldn’t load current reports. Check your connection and try again.",
      );
    } finally {
      setReady(true);
      setRefreshing(false);
    }
  };
  useEffect(() => {
    void (async () => {
      try {
        if (API_URL) {
          const session = await readSession();
          if (session) {
            const restored = session;
            const favorites = await request("/favorites/", {}, restored.token);
            const mine = await request("/reports/mine/", {}, restored.token);
            setAccount(restored);
            setSaved(favorites);
            setReports(mine);
          }
          await refresh();
        } else {
          const raw = await AsyncStorage.getItem(STORAGE);
          if (raw) {
            const data = JSON.parse(raw);
            setReports(data.reports);
            setSaved(data.saved);
          } else {
            setReports(seedReports());
            setSaved([1, 2]);
          }
          setReady(true);
        }
      } catch {
        setReports(API_URL ? [] : seedReports());
        setReady(true);
        if (API_URL) await refresh();
      }
    })();
  }, []);
  useEffect(() => {
    if (!ready || API_URL) return;
    void AsyncStorage.setItem(
      STORAGE,
      JSON.stringify({ reports, saved }),
    ).catch(() =>
      toast(
        "Couldn’t save on this device. Your changes may not survive a reload.",
      ),
    );
  }, [reports, saved, ready]);
  const saveCooldowns = useRef(new Map<number, number>());
  const toggleSave = async (id: number) => {
    if (API_URL && !account) {
      setAuthPrompt("save");
      return;
    }
    const now = Date.now();
    const cooldowns = saveCooldowns.current;
    if ((cooldowns.get(id) ?? 0) > now) return;
    cooldowns.set(id, Infinity);
    const wasSaved = saved.includes(id);
    try {
      if (API_URL)
        await request(
          `/favorites/${id}/`,
          { method: wasSaved ? "DELETE" : "PUT" },
          account!.token,
        );
      setSaved((previous) =>
        wasSaved ? previous.filter((value) => value !== id) : [...previous, id],
      );
      toast(wasSaved ? "Removed from saved spots" : "Added to saved spots");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      cooldowns.set(id, Date.now() + SAVE_COOLDOWN_MS);
    }
  };
  // Reads the phone's position once so the server can check the reporter is at
  // the venue. Never blocks a report: no permission or no fix just means the
  // report is counted with less weight.
  const reporterPosition = async () => {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) return null;
      const fix = await Promise.race([
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
      ]);
      return fix
        ? { latitude: fix.coords.latitude, longitude: fix.coords.longitude }
        : null;
    } catch {
      return null;
    }
  };
  const submitReport = async (
    level: number,
    wait: number | null,
  ): Promise<boolean | null> => {
    if (!reportVenue) return null;
    if (API_URL && !account) {
      setReportVenue(null);
      setAuthPrompt("report");
      return null;
    }
    const position = API_URL ? await reporterPosition() : null;
    let verified: boolean | null = null;
    let report: Report = {
      id: `local-${Date.now()}`,
      venueId: reportVenue.id,
      level,
      wait,
      createdAt: new Date().toISOString(),
      mine: true,
    };
    if (API_URL) {
      const response = await request(
        "/reports/",
        {
          method: "POST",
          body: JSON.stringify({
            venue: reportVenue.id,
            crowd_level: levels[level].backend,
            wait_time: wait ?? 5,
            // Used once by the server to set verified_nearby; not stored.
            ...(position ?? {}),
          }),
        },
        account!.token,
      );
      report = {
        ...report,
        id: String(response.id),
        createdAt: response.created_at,
        verified: !!response.verified_nearby,
      };
      verified = !!response.verified_nearby;
    }
    const next = [report, ...reports];
    if (!API_URL)
      await AsyncStorage.setItem(
        STORAGE,
        JSON.stringify({ reports: next, saved }),
      );
    setReports(next);
    // Pull the server's updated crowd level, which now includes this report.
    if (API_URL) void refresh();
    return verified;
  };
  // `login` is a username or an email address.
  const signIn = async (login: string, password: string) => {
    let session: Account;
    try {
      session = await request("/auth/sign-in/", {
        method: "POST",
        body: JSON.stringify({ login, password }),
      });
    } catch (e) {
      // Field errors (such as an invalid email) come back keyed by field name.
      const fieldError = e instanceof ApiError ? e.fields?.login?.[0] : undefined;
      throw fieldError ? new Error(fieldError) : e;
    }
    const favorites = await request("/favorites/", {}, session.token);
    const mine: Report[] = await request("/reports/mine/", {}, session.token);
    await saveSession(session);
    setAccount(session);
    setSaved(favorites);
    setReports((previous) => [
      ...mine,
      ...previous.filter((r) => !mine.some((m) => m.id === r.id)),
    ]);
    toast("Signed in");
  };
  const signOut = async () => {
    try {
      await request("/auth/sign-out/", { method: "POST" }, account?.token);
      await clearSession();
      setAccount(null);
      setSaved([]);
      setReports((previous) => previous.map((r) => ({ ...r, mine: false })));
      toast("Signed out");
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const store: Store = {
    headerTitle,
    setHeaderTitle,
    venues,
    reports,
    crowd,
    saved,
    ready,
    error,
    refreshing,
    account,
    origin,
    radius,
    reportVenue,
    refresh,
    toggleSave,
    submitReport,
    signIn,
    signOut,
    setReportVenue,
    setOrigin,
    setRadius,
    toast,
    setPicker,
    setLocationSheet,
    openReport: (v) => {
      if (API_URL && !account) setAuthPrompt("report");
      else if (v) setReportVenue(v);
      else setPicker(true);
    },
  };
  return (
    <Context.Provider value={store}>
      <StatusBar style="light" />
      <Brand />
      <View
        style={{ flex: 1 }}
        aria-hidden={!!reportVenue || picker || locationSheet || !!authPrompt}
        importantForAccessibility={
          reportVenue || picker || locationSheet || authPrompt
            ? "no-hide-descendants"
            : "auto"
        }
      >
        <NavigationContainer<Routes>
          ref={navigation}
          linking={{
            prefixes: ["whatspoppin://"],
            config: {
              screens: {
                Main: {
                  screens: { Nearby: "", Saved: "saved", Profile: "you" },
                },
                Venue: { path: "venue/:id", parse: { id: Number } },
                Search: "search",
              },
            },
            getStateFromPath: undefined,
          }}
        >
          <Stack.Navigator
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: c.background },
              animation: reducedMotion ? "none" : "slide_from_right",
            }}
          >
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="Venue" component={VenueDetail} />
            <Stack.Screen name="Search" component={SearchScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </View>
      <ReportSheet />
      <Sheet visible={!!authPrompt} onClose={() => setAuthPrompt(null)} title={authPrompt === "save" ? "Save this spot" : "Share a crowd report"}>
        <View style={{ padding: 24, gap: 12 }}>
          <Copy style={s.meta}>
            {authPrompt === "save"
              ? "Sign in or create an account to save venues."
              : "Sign in or create an account to share crowd reports."}
          </Copy>
          <Button onPress={() => openAuth("signIn")}>Sign in</Button>
          <Button outline onPress={() => openAuth("register")}>Create account</Button>
        </View>
      </Sheet>
      <LocationSheet
        visible={locationSheet}
        onClose={() => setLocationSheet(false)}
      />
      <Sheet
        visible={picker}
        onClose={() => setPicker(false)}
        title="Where are you right now?"
      >
        <Copy style={[s.meta, { marginBottom: 20 }]}>
          Choose a venue to report its crowd.
        </Copy>
        {venues.map((v) => (
          <Pressable
            key={v.id}
            accessibilityRole="button"
            onPress={() => {
              setPicker(false);
              setReportVenue(v);
            }}
            style={s.settingsRow}
          >
            <MapPin size={20} color={c.accent} />
            <Copy style={[s.factValue, { flex: 1 }]}>{v.name}</Copy>
            <ChevronRight size={18} color={c.muted} />
          </Pressable>
        ))}
        {!venues.length && (
          <Copy style={s.meta}>
            No venues loaded. Return to Nearby and try again.
          </Copy>
        )}
      </Sheet>
      {notice ? (
        <View pointerEvents="none" style={s.toast}>
          <Copy accessibilityRole="alert" style={s.toastText}>
            {notice}
          </Copy>
        </View>
      ) : null}
    </Context.Provider>
  );
}
// Shown while fonts load. Matches the native splash screen (app.json) so the
// logo stays in place as the app starts. Uses system fonts: Manrope isn't ready yet.
function LoadingScreen(): React.JSX.Element {
  return (
    <View style={s.loading} accessibilityLabel="Loading WhatsPoppin">
      <StatusBar style="light" />
      <Image source={LOGO} style={s.loadingLogo} accessible={false} />
      <Text style={s.loadingTitle}>WhatsPoppin</Text>
      <ActivityIndicator color={c.onPrimary} style={{ marginTop: 28 }} />
    </View>
  );
}
export default function App(): React.JSX.Element {
  const [loaded, error] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });
  const ready = loaded || !!error;
  // Keep the native logo splash up until fonts are ready, then hand over.
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  if (!ready) return <LoadingScreen />;
  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: c.accent }}>
        <View
          testID="mobile-app"
          style={{
            flex: 1,
            width: "100%",
            maxWidth: Platform.OS === "web" ? MOBILE_PREVIEW_WIDTH : undefined,
            alignSelf: "center",
            backgroundColor: c.background,
          }}
        >
          <AppContent />
        </View>
      </View>
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  text: { fontFamily: f.regular, color: c.ink, fontSize: 15, lineHeight: 23 },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.accent,
  },
  loadingLogo: { width: 160, height: 160, borderRadius: 32 },
  loadingTitle: {
    marginTop: 20,
    color: c.onPrimary,
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  screen: { flex: 1, backgroundColor: c.background },
  page: {
    width: "100%",
    maxWidth: 1120,
    alignSelf: "center",
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 32,
  },
  brandOuter: {
    backgroundColor: c.accent,
  },
  brandBar: {
    width: "100%",
    maxWidth: 1120,
    alignSelf: "center",
    paddingHorizontal: 24,
    height: 64,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  brandSide: { flex: 1, flexBasis: 0, minWidth: 0 },
  brandLogo: { width: 38, height: 38, borderRadius: 9 },
  wordmark: {
    fontFamily: f.extra,
    fontSize: 22,
    letterSpacing: -0.6,
    lineHeight: 32,
    color: c.onPrimary,
    flexShrink: 1,
    textAlign: "center",
    paddingHorizontal: 8,
  },
  previewTag: { flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "100%" },
  previewDot: { width: 6, height: 6, backgroundColor: c.cta, borderRadius: 3 },
  previewText: { fontSize: 11, color: c.onPrimaryMuted, fontFamily: f.medium },
  locationBlock: { flexShrink: 1, minWidth: 0 },
  resultsRight: { alignItems: "flex-end", marginLeft: "auto", flexShrink: 0 },
  locationLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  locationButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    minHeight: 44,
    flexShrink: 1,
    minWidth: 0,
  },
  locationText: { fontFamily: f.semibold, fontSize: 13, flexShrink: 1 },
  pageHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    paddingTop: 12,
    marginBottom: 28,
  },
  title: {
    fontSize: 28,
    lineHeight: 36,
    fontFamily: f.extra,
    letterSpacing: -1,
    textAlign: "center",
  },
  subtitle: { fontSize: 14, color: c.muted, marginTop: 5 },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  pressed: { backgroundColor: c.pressed },
  searchBar: {
    minHeight: 50,
    borderRadius: 8,
    backgroundColor: c.white,
    borderWidth: 1,
    borderColor: c.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  // Matches searchInput (size and left indent) so the look-alike bar on Nearby
  // lines up with the real search field on Saved and Search.
  searchPlaceholder: {
    flex: 1,
    fontFamily: f.regular,
    fontSize: 15,
    color: c.placeholder,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontFamily: f.regular,
    fontSize: 15,
    color: c.ink,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  filters: { gap: 8, alignItems: "center" },
  filter: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    backgroundColor: c.white,
  },
  filterSelected: { backgroundColor: c.accent, borderColor: c.accent },
  filterText: { fontFamily: f.semibold, fontSize: 13 },
  resultsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  sectionTitle: {
    fontFamily: f.bold,
    fontSize: 17,
    lineHeight: 25,
    letterSpacing: -0.25,
  },
  resultActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  sortButton: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
    gap: 5,
  },
  segment: {
    flexDirection: "row",
    padding: 3,
    borderRadius: 7,
    backgroundColor: c.white,
    borderWidth: 1,
    borderColor: c.border,
  },
  segmentItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 44,
    paddingHorizontal: 9,
    borderRadius: 5,
  },
  segmentActive: { backgroundColor: c.accentLight },
  segmentText: { fontSize: 12, color: c.muted, fontFamily: f.semibold },
  discovery: { flexDirection: "column", alignItems: "flex-start" },
  listColumn: { flex: 1, width: "100%", minWidth: 0 },
  venueRow: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 20,
    borderBottomColor: c.border,
    borderBottomWidth: 1,
    alignItems: "center",
  },
  rowMain: {
    flexDirection: "row",
    gap: 14,
    flex: 1,
    minWidth: 0,
    alignItems: "center",
  },
  photo: {
    width: 84,
    height: 92,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: c.accentLight,
  },
  photoFallback: { flex: 1, alignItems: "center", justifyContent: "center" },
  rowContent: { flex: 1, minWidth: 0 },
  venueName: {
    fontFamily: f.bold,
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: -0.35,
  },
  meta: { color: c.muted, fontSize: 13, lineHeight: 21 },
  freshness: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 10,
    flexWrap: "wrap",
  },
  small: { fontSize: 12, color: c.muted, lineHeight: 19 },
  tiny: { fontSize: 11, color: c.muted, lineHeight: 17 },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: c.subtle,
    marginHorizontal: 3,
  },
  rowTrailing: {
    alignItems: "flex-end",
    alignSelf: "stretch",
    justifyContent: "space-between",
    paddingBottom: 2,
  },
  crowd: {
    alignItems: "flex-end",
    gap: 7,
    minHeight: 44,
    justifyContent: "center",
  },
  crowdName: { fontFamily: f.bold, fontSize: 13, lineHeight: 18 },
  meter: { flexDirection: "row", width: 68, height: 4, gap: 3 },
  meterPart: { flex: 1, borderRadius: 2, backgroundColor: c.border, overflow: "hidden" },
  mapColumn: { width: "40%", marginTop: 20 },
  mapContainer: {
    height: 486,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
  },
  mapLabel: {
    position: "absolute",
    left: 16,
    top: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: c.white,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    borderWidth: 1,
    borderColor: c.border,
  },
  mapLabelText: { fontFamily: f.semibold, fontSize: 12 },
  mapLegend: {
    flexDirection: "row",
    gap: 16,
    flexWrap: "wrap",
    justifyContent: "center",
    marginTop: 18,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  reportPrompt: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    backgroundColor: c.accentLight,
    borderRadius: 10,
    marginTop: 24,
  },
  promptIcon: { width: 36, alignItems: "center" },
  promptTitle: { fontFamily: f.bold, fontSize: 14, lineHeight: 21 },
  promptAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    minHeight: 44,
  },
  link: { color: c.accent, fontFamily: f.bold, fontSize: 13 },
  tabOuter: {
    backgroundColor: c.white,
    borderTopWidth: 1,
    borderTopColor: c.border,
  },
  tabInner: {
    flexDirection: "row",
    width: "100%",
    maxWidth: 540,
    alignSelf: "center",
  },
  tab: {
    flex: 1,
    minHeight: 64,
    paddingTop: 12,
    paddingBottom: 6,
    alignItems: "center",
    gap: 4,
    position: "relative",
  },
  tabText: {
    fontSize: 11,
    lineHeight: 17,
    fontFamily: f.medium,
    color: c.muted,
  },
  tabIndicator: {
    height: 2,
    width: 26,
    borderRadius: 1,
    backgroundColor: c.cta,
    position: "absolute",
    top: 0,
  },
  empty: {
    minHeight: 280,
    paddingVertical: 48,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  emptyIcon: {
    height: 64,
    width: 64,
    borderRadius: 32,
    backgroundColor: c.accentLight,
    alignItems: "center",
    justifyContent: "center",
  },
  backHeader: {
    height: 60,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    maxWidth: 1120,
    alignSelf: "center",
  },
  backTitle: { fontFamily: f.semibold, fontSize: 14 },
  detailPage: {
    width: "100%",
    maxWidth: 1120,
    alignSelf: "center",
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  detailLayout: { gap: 0 },
  detailPhoto: {
    height: 240,
    position: "relative",
    borderRadius: 12,
    overflow: "hidden",
  },
  photoCaption: {
    position: "absolute",
    bottom: 10,
    right: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: c.photoScrim,
    borderRadius: 4,
  },
  photoCaptionText: { fontSize: 10, color: c.white, lineHeight: 17 },
  detailHeading: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    paddingTop: 24,
    paddingBottom: 12,
  },
  // Fixed width (fits the longer "Remove venue from saved") so both states match.
  saveVenueButton: {
    alignSelf: "flex-start",
    width: 240,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 24,
  },
  saveVenueText: { color: c.white, fontFamily: f.bold, fontSize: 14 },
  detailTitle: {
    fontFamily: f.extra,
    fontSize: 27,
    lineHeight: 35,
    letterSpacing: -0.8,
  },
  detailCrowd: {
    gap: 14,
    paddingVertical: 20,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: c.border,
  },
  // Under the crowd label, wrapping onto more lines on narrow screens.
  crowdContext: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: 16,
    rowGap: 6,
  },
  contextLine: { flexDirection: "row", gap: 7, alignItems: "center", flexShrink: 1 },
  detailFacts: {
    flexDirection: "row",
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderColor: c.border,
  },
  fact: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  factValue: { fontFamily: f.semibold, fontSize: 14, lineHeight: 22 },
  dollar: { fontSize: 23, color: c.muted },
  detailSection: {
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  trend: { marginTop: 16, marginBottom: 12 },
  miniMap: {
    height: 170,
    borderRadius: 8,
    overflow: "hidden",
    marginTop: 20,
    marginBottom: 16,
  },
  recentReport: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  reportAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: c.accentLight,
    alignItems: "center",
    justifyContent: "center",
  },
  sampleNote: {
    flexDirection: "row",
    gap: 10,
    marginTop: 20,
    backgroundColor: c.accentLight,
    padding: 16,
    borderRadius: 8,
  },
  detailCta: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: c.white,
    borderTopWidth: 1,
    borderTopColor: c.border,
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  detailCtaInner: { width: "100%", maxWidth: 480, alignSelf: "center" },
  button: {
    minHeight: 50,
    borderRadius: 8,
    backgroundColor: c.cta,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  buttonOutline: {
    borderColor: c.accent,
    borderWidth: 1,
    backgroundColor: c.white,
  },
  buttonText: { color: c.white, fontFamily: f.bold, fontSize: 14 },
  disabled: { opacity: 0.45 },
  guestProfilePage: { flexGrow: 1 },
  guestAuth: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    paddingTop: 40,
    gap: 16,
  },
  guestFooter: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    marginTop: "auto",
    paddingTop: 32,
  },
  guestUtility: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  guestUtilityText: { fontSize: 13, fontFamily: f.regular, color: c.muted },
  passwordToggle: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    minHeight: 44,
    alignSelf: "flex-start",
  },
  passwordToggleText: { fontFamily: f.semibold, fontSize: 14, color: c.accent },
  profileIdentity: {
    alignItems: "center",
    gap: 4,
    paddingTop: 16,
    marginBottom: 8,
  },
  profileAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: c.accentLight,
    alignItems: "center",
    justifyContent: "center",
  },
  profileName: {
    fontSize: 21,
    fontFamily: f.bold,
    lineHeight: 30,
    letterSpacing: -0.4,
    textAlign: "center",
    marginTop: 8,
  },
  profileCounts: {
    flexDirection: "row",
    paddingVertical: 28,
    marginTop: 20,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: c.border,
  },
  countBlock: { flex: 1, alignItems: "center", gap: 4 },
  count: { fontSize: 26, fontFamily: f.bold, lineHeight: 32 },
  countDivider: { width: 1, backgroundColor: c.border },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 60,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  about: { paddingVertical: 16 },
  field: {
    borderWidth: 1,
    borderColor: c.muted,
    borderRadius: 8,
    paddingHorizontal: 14,
    minHeight: 48,
    fontFamily: f.regular,
    fontSize: 16,
    color: c.ink,
    backgroundColor: c.white,
  },
  modalRoot: { flex: 1, justifyContent: "flex-end", alignItems: "center" },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: c.scrim },
  sheet: {
    width: "100%",
    maxWidth: 500,
    maxHeight: "92%",
    backgroundColor: c.white,
    paddingHorizontal: 24,
    paddingTop: 12,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    justifyContent: "space-between",
    marginBottom: 14,
  },
  sheetTitle: {
    fontFamily: f.bold,
    fontSize: 22,
    lineHeight: 30,
    letterSpacing: -0.6,
    flex: 1,
  },
  reportVenueName: { fontFamily: f.bold, fontSize: 15, marginBottom: 3 },
  levelOption: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 75,
  },
  optionMeter: {
    flexDirection: "row",
    gap: 3,
    alignItems: "flex-end",
    width: 29,
  },
  optionTitle: { fontFamily: f.bold, fontSize: 15 },
  optionDetail: { fontSize: 12, color: c.muted, lineHeight: 18 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: c.subtle,
    alignItems: "center",
    justifyContent: "center",
  },
  waitHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 24,
    marginBottom: 12,
  },
  waitOptions: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 24,
  },
  waitOption: {
    paddingHorizontal: 12,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderColor: c.border,
    borderWidth: 1,
    borderRadius: 7,
  },
  reportSuccess: { alignItems: "stretch", gap: 16, paddingVertical: 24 },
  successIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.accentLight,
  },
  errorText: { color: c.packed, fontSize: 13, marginVertical: 12 },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    backgroundColor: c.packedBg,
    borderRadius: 8,
    marginBottom: 16,
  },
  toast: {
    position: "absolute",
    bottom: 100,
    alignSelf: "center",
    maxWidth: "90%",
    backgroundColor: c.ink,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 8,
  },
  toastText: { color: c.white, fontSize: 13 },
});
