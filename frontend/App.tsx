import React, {
  createContext,
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
} from "react-native";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
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
  Info,
  List,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  Search,
  Settings2,
  ShieldCheck,
  UserRound,
  Users,
  X,
} from "lucide-react-native";
import Svg, { Line, Circle } from "react-native-svg";
import { colors as c, font as f, levels } from "./src/theme";
import {
  Venue,
  Report,
  demoVenues,
  seedReports,
  collegePark,
  crowdSummary,
  distanceMiles,
  ageLabel,
} from "./src/data";
import { API_URL, Account, loadVenues, request } from "./src/api";
import MapPanel from "./src/MapPanel";
import { readSession, saveSession, clearSession } from "./src/session";
import { useReducedMotion } from "./src/useReducedMotion";
import { useAppDimensions, MOBILE_PREVIEW_WIDTH } from "./src/useAppDimensions";

type Store = {
  venues: Venue[];
  reports: Report[];
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
  submitReport: (level: number, wait: number | null) => Promise<void>;
  setReportVenue: (v: Venue | null) => void;
  setOrigin: (o: typeof collegePark) => void;
  setRadius: (r: number) => void;
  signIn: (u: string, p: string) => Promise<void>;
  signOut: () => Promise<void>;
  toast: (text: string) => void;
  setPicker: (p: boolean) => void;
  setLocationSheet: (p: boolean) => void;
};
const Context = createContext<Store>(null!);
const useStore = (): Store => useContext(Context);
type Routes = {
  Main: NavigatorScreenParams<{
    Nearby: undefined;
    Saved: undefined;
    Profile: undefined;
  }>;
  Venue: { id: number };
  Search: undefined;
};
const Stack = createNativeStackNavigator<Routes>();
const Tabs = createBottomTabNavigator();
const STORAGE = "whatspoppin-preview-v1";
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
        fill={active ? c.accentLight : "none"}
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
  const { reports } = useStore();
  const summary = crowdSummary(venueId, reports);
  const level = levels[summary.latest?.level ?? 0];
  return (
    <View style={[s.crowd, large && { alignItems: "flex-start" }]}>
      <Copy
        style={[
          s.crowdName,
          { color: summary.stale ? c.muted : level.color },
          large && { fontSize: 30, lineHeight: 40 },
        ]}
      >
        {summary.stale ? "Needs update" : level.name}
      </Copy>
      <View
        accessibilityLabel={
          summary.stale
            ? "No recent crowd report"
            : `${level.name}, ${summary.latest!.level + 1} of 4 crowd levels`
        }
        style={[s.meter, large && { width: 132, height: 7 }]}
      >
        {levels.map((_, i) => (
          <View
            key={i}
            style={[
              s.meterPart,
              {
                backgroundColor:
                  !summary.stale && i <= summary.latest!.level
                    ? level.color
                    : c.border,
              },
            ]}
          />
        ))}
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
function VenueRow({
  venue,
  compact = false,
}: {
  venue: Venue;
  compact?: boolean;
}): React.JSX.Element {
  const store = useStore();
  const nav = useNavigation<any>();
  const { width } = useAppDimensions();
  const summary = crowdSummary(venue.id, store.reports);
  const distance = distanceMiles(venue, store.origin);
  return (
    <View style={[s.venueRow, compact && { paddingVertical: 12 }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View ${venue.name}, ${summary.stale ? "needs update" : levels[summary.latest!.level].name}`}
        onPress={() => nav.navigate("Venue", { id: venue.id })}
        style={({ pressed }) => [s.rowMain, pressed && { opacity: 0.7 }]}
      >
        <VenuePhoto
          venue={venue}
          style={compact || width < 600 ? { width: 64, height: 80 } : undefined}
        />
        <View style={s.rowContent}>
          <Copy style={s.venueName}>{venue.name}</Copy>
          <Copy style={s.meta}>
            {venue.kind} <Copy style={s.dot}> · </Copy>
            {distance.toFixed(1)} mi
          </Copy>
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
  const { top } = useSafeAreaInsets();
  const { height } = useAppDimensions();
  return (
    <View style={[s.brandOuter, { paddingTop: top }]}>
      <View style={[s.brandBar, height < 500 && { height: 44 }]}>
        <View style={s.brandName}>
          <View style={s.brandMark}>
            {[11, 19, 27].map((height, i) => (
              <View
                key={i}
                style={{
                  width: 6,
                  height,
                  borderRadius: 2,
                  backgroundColor: c.accent,
                }}
              />
            ))}
          </View>
          <Copy style={s.wordmark}>
            whatspoppin<Copy style={{ color: c.accent }}>.</Copy>
          </Copy>
        </View>
        <View style={s.previewTag}>
          <View style={s.previewDot} />
          <Copy style={s.previewText}>
            {API_URL ? "Community reports" : "Sample preview"}
          </Copy>
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
  const [mode, setMode] = useState("List");
  const [filter, setFilter] = useState<number | null>(null);
  const [sort, setSort] = useState<"distance" | "crowd">("distance");
  const venues = store.venues
    .filter((v) => distanceMiles(v, store.origin) <= store.radius)
    .filter(
      (v) =>
        filter === null ||
        (!crowdSummary(v.id, store.reports).stale &&
          crowdSummary(v.id, store.reports).latest?.level === filter),
    )
    .sort((a, b) =>
      sort === "distance"
        ? distanceMiles(a, store.origin) - distanceMiles(b, store.origin)
        : (crowdSummary(a.id, store.reports).stale
            ? 5
            : crowdSummary(a.id, store.reports).latest!.level) -
          (crowdSummary(b.id, store.reports).stale
            ? 5
            : crowdSummary(b.id, store.reports).latest!.level),
    );
  return (
    <ScrollView
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
      {!compact && (
        <View style={s.locationLine}>
          <Pressable
            accessibilityRole="button"
            onPress={() => store.setLocationSheet(true)}
            style={s.locationButton}
          >
            <MapPin size={17} color={c.accent} strokeWidth={1.8} />
            <Copy style={s.locationText}>
              {store.origin === collegePark
                ? "College Park, MD"
                : "Near your location"}
            </Copy>
            <ChevronDown size={15} color={c.muted} />
          </Pressable>
          <Copy style={s.small}>
            Within {store.radius} {store.radius === 1 ? "mile" : "miles"}
          </Copy>
        </View>
      )}
      <View style={[s.pageHeading, compact && { marginBottom: 8 }]}>
        <View style={{ flex: 1 }}>
          <Copy
            accessibilityRole="header"
            style={[s.title, compact && { fontSize: 22, lineHeight: 30 }]}
          >
            Nearby tonight
          </Copy>
          {!compact && (
            <Copy style={s.subtitle}>See the scene before you head out.</Copy>
          )}
        </View>
        <IconButton
          icon={Search}
          label="Search bars"
          onPress={() => nav.navigate("Search")}
        />
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
        <IconButton
          icon={Settings2}
          label="Set search area and radius"
          onPress={() => store.setLocationSheet(true)}
        />
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
        <Copy style={[s.sectionTitle, { fontSize: 14 }]}>
          {venues.length} nearby {venues.length === 1 ? "spot" : "spots"}
        </Copy>
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
                    accessibilityState={{ selected: mode === item }}
                    onPress={() => setMode(item)}
                    style={[s.segmentItem, mode === item && s.segmentActive]}
                  >
                    <Icon size={15} color={mode === item ? c.ink : c.muted} />
                    <Copy
                      style={[s.segmentText, mode === item && { color: c.ink }]}
                    >
                      {item}
                    </Copy>
                  </Pressable>
                );
              })}
            </View>
          )}
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
                venues.map((v) => <VenueRow key={v.id} venue={v} />)
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
              <View style={s.footnote}>
                <ShieldCheck size={14} color={c.muted} />
                <Copy style={s.small}>
                  Community reports. Things can change quickly.
                </Copy>
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
function Saved(): React.JSX.Element {
  const store = useStore();
  const nav = useNavigation<any>();
  const venues = store.venues.filter((v) => store.saved.includes(v.id));
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.page}>
      <View style={s.pageHeading}>
        <View style={{ flex: 1 }}>
          <Copy style={s.title}>Saved spots</Copy>
          <Copy style={s.subtitle}>
            Saved spots. A fresh look at the crowd.
          </Copy>
        </View>
        <Bookmark size={25} color={c.accent} strokeWidth={1.6} />
      </View>
      <View style={s.resultsHeader}>
        <Copy style={s.sectionTitle}>
          {venues.length} saved {venues.length === 1 ? "spot" : "spots"}
        </Copy>
      </View>
      {venues.length ? (
        venues.map((v) => <VenueRow key={v.id} venue={v} />)
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
  const input = useRef<TextInput>(null);
  const results = store.venues
    .filter((v) =>
      `${v.name} ${v.kind} ${v.city} ${v.address}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
    )
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
        <View style={s.searchBar}>
          <Search size={20} color={c.muted} />
          <TextInput
            ref={input}
            autoFocus
            accessibilityLabel="Search venues"
            value={query}
            onChangeText={setQuery}
            placeholder="Bar, neighborhood, or street"
            placeholderTextColor={c.muted}
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
function Trend({ reports }: { reports: Report[] }): React.JSX.Element {
  const now = Date.now();
  const buckets = [60, 45, 30, 15, 0].map((minutes) => {
    const end = now - Math.max(0, minutes - 7.5) * 60000;
    const start = now - Math.min(60, minutes + 7.5) * 60000;
    const matches = reports.filter(
      (r) => Date.parse(r.createdAt) >= start && Date.parse(r.createdAt) <= end,
    );
    return matches.length
      ? matches.reduce((sum, r) => sum + r.level, 0) / matches.length
      : null;
  });
  const points = buckets.flatMap((value, i) =>
    value === null ? [] : [{ x: 24 + i * 74, y: 105 - value * 27, bucket: i }],
  );
  return (
    <View style={s.trend}>
      <View style={s.trendLevels}>
        <Copy style={s.tiny}>Packed</Copy>
        <Copy style={s.tiny}>Quiet</Copy>
      </View>
      <View style={{ flex: 1 }}>
        <Svg
          height={125}
          width="100%"
          viewBox="0 0 344 125"
          preserveAspectRatio="none"
        >
          {[24, 51, 78, 105].map((y) => (
            <Line
              key={y}
              x1={8}
              y1={y}
              x2={336}
              y2={y}
              stroke={c.border}
              strokeDasharray="4 4"
            />
          ))}
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
        </Svg>
        <View style={s.trendTimes}>
          <Copy style={s.tiny}>1 hr ago</Copy>
          <Copy style={s.tiny}>30 min ago</Copy>
          <Copy style={s.tiny}>Now</Copy>
        </View>
      </View>
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
  const summary = crowdSummary(venue.id, store.reports);
  const saved = store.saved.includes(venue.id);
  const distance = distanceMiles(venue, store.origin);
  const venueReports = store.reports
    .filter((r) => r.venueId === venue.id)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const level = levels[summary.latest?.level ?? 0];
  return (
    <View style={s.screen}>
      <BackHeader title="Venue details" />
      <ScrollView
        contentContainerStyle={[s.detailPage, { paddingBottom: 108 + bottom }]}
      >
        <View
          style={[
            s.detailLayout,
            Platform.OS !== "web" &&
              width >= 900 && { flexDirection: "row", gap: 36 },
          ]}
        >
          <View style={{ flex: 1 }}>
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
                  {venue.kind} · {distance.toFixed(1)} mi away
                </Copy>
              </View>
              <IconButton
                icon={Bookmark}
                label={saved ? "Unsave venue" : "Save venue"}
                active={saved}
                onPress={() => void store.toggleSave(venue.id)}
              />
            </View>
            <View style={s.detailCrowd}>
              <View>
                <Copy style={s.meta}>The crowd right now</Copy>
                <Crowd venueId={venue.id} large />
                <Copy style={[s.meta, { marginTop: 10 }]}>
                  {summary.stale
                    ? summary.latest
                      ? `Last reported ${level.name.toLowerCase()}.`
                      : "Be the first to report the crowd."
                    : level.short}
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
                      ? `${summary.agreeing} of ${summary.total} agree`
                      : summary.total === 1
                        ? "1 recent report"
                        : "No recent reports"}
                  </Copy>
                </View>
                <Copy style={[s.tiny, { maxWidth: 150, textAlign: "right" }]}>
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
          <View style={{ flex: 1 }}>
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
function Profile(): React.JSX.Element {
  const store = useStore();
  const nav = useNavigation<any>();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [login, setLogin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [about, setAbout] = useState(false);
  const mine = store.reports
    .filter((r) => r.mine)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      style={s.screen}
      contentContainerStyle={[s.page, { maxWidth: 760 }]}
    >
      <View style={s.pageHeading}>
        <View style={{ flex: 1 }}>
          <Copy style={s.title}>Your profile</Copy>
          <Copy style={s.subtitle}>
            A few good spots. A little local knowledge.
          </Copy>
        </View>
      </View>
      <View style={s.profileIdentity}>
        <View style={s.profileAvatar}>
          <UserRound size={30} color={c.accent} strokeWidth={1.4} />
        </View>
        <View style={{ flex: 1 }}>
          <Copy style={s.profileName}>
            {store.account
              ? store.account.first_name || store.account.username
              : "Hey, neighbor"}
          </Copy>
          <Copy style={s.meta}>
            {API_URL
              ? store.account
                ? "Community member"
                : "Browsing as a guest"
              : "Exploring the sample preview"}
          </Copy>
        </View>
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
          <Copy style={s.count}>{mine.length}</Copy>
          <Copy style={s.meta}>Your reports</Copy>
        </View>
      </View>
      {API_URL && !store.account && (
        <View style={s.detailSection}>
          <Copy style={s.sectionTitle}>Keep your spots with you</Copy>
          <Copy style={[s.meta, { marginVertical: 12 }]}>
            Sign in to save venues and share crowd reports.
          </Copy>
          {!login ? (
            <Button outline onPress={() => setLogin(true)}>
              Sign in
            </Button>
          ) : (
            <View style={{ gap: 12 }}>
              <Copy style={s.factValue}>Username</Copy>
              <TextInput
                accessibilityLabel="Username"
                value={username}
                onChangeText={setUsername}
                style={s.field}
                autoCapitalize="none"
                autoComplete="username"
              />
              <Copy style={s.factValue}>Password</Copy>
              <TextInput
                accessibilityLabel="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                style={s.field}
                autoComplete="current-password"
              />
              {error ? (
                <Copy accessibilityRole="alert" style={{ color: c.packed }}>
                  {error}
                </Copy>
              ) : null}
              <Button
                busy={busy}
                disabled={!username || !password}
                onPress={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await store.signIn(username, password);
                    setPassword("");
                    setLogin(false);
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
        </View>
      )}
      <View style={s.detailSection}>
        <Copy style={s.sectionTitle}>Your recent reports</Copy>
        {mine.length ? (
          mine.map((r) => (
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
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => store.setLocationSheet(true)}
        style={s.settingsRow}
      >
        <MapPin size={20} color={c.muted} />
        <Copy style={s.factValue}>Search area</Copy>
        <View style={{ flex: 1 }} />
        <Copy style={s.small}>{store.radius} mi</Copy>
        <ChevronRight size={18} color={c.muted} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: about }}
        onPress={() => setAbout(!about)}
        style={s.settingsRow}
      >
        <Info size={20} color={c.muted} />
        <Copy style={s.factValue}>How crowd reports work</Copy>
        <View style={{ flex: 1 }} />
        <ChevronDown size={18} color={c.muted} />
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
            This is a sample preview. Saved spots and your reports stay on this
            device. Connect the Django API to use an account and shared reports.
          </Copy>
        </View>
      )}
      <Copy style={[s.tiny, { textAlign: "center", marginTop: 32 }]}>
        WhatsPoppin · College Park
      </Copy>
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
function ReportSheet(): React.JSX.Element {
  const store = useStore();
  const venue = store.reportVenue;
  const [selected, setSelected] = useState<number | null>(null);
  const [wait, setWait] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  useEffect(() => {
    setSelected(null);
    setWait(null);
    setError("");
    setSuccess(false);
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
                await store.submitReport(selected, wait);
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
              ? "Only report if you’re at the venue."
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
  return (
    <Sheet visible={visible} onClose={onClose} title="Your search area">
      <Copy style={[s.meta, { marginBottom: 20 }]}>
        Find a spot close enough to make it your next stop.
      </Copy>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          store.setOrigin(collegePark);
          setError("");
        }}
        style={s.settingsRow}
      >
        <MapPin size={20} color={c.accent} />
        <Copy style={s.factValue}>College Park, MD</Copy>
        <View style={{ flex: 1 }} />
        {store.origin === collegePark && <Check size={18} color={c.accent} />}
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
            store.setOrigin({
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
            });
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
        style={s.settingsRow}
      >
        <LocateFixed size={20} color={c.accent} />
        <Copy style={s.factValue}>Use my current location</Copy>
        <View style={{ flex: 1 }} />
        {busy && <ActivityIndicator color={c.accent} />}
      </Pressable>
      {error ? (
        <Copy accessibilityRole="alert" style={s.errorText}>
          {error}
        </Copy>
      ) : null}
      <Copy style={[s.sectionTitle, { marginTop: 28, marginBottom: 16 }]}>
        Search radius
      </Copy>
      <View style={[s.waitOptions, { marginBottom: 24 }]}>
        {[1, 2, 5, 10].map((radius) => (
          <Pressable
            key={radius}
            accessibilityRole="button"
            accessibilityState={{ selected: store.radius === radius }}
            onPress={() => store.setRadius(radius)}
            style={[
              s.waitOption,
              { flex: 1 },
              store.radius === radius && {
                borderColor: c.accent,
                backgroundColor: c.accentLight,
              },
            ]}
          >
            <Copy style={[s.factValue, { textAlign: "center" }]}>
              {radius} mi
            </Copy>
          </Pressable>
        ))}
      </View>
      <Button onPress={onClose}>Show nearby spots</Button>
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
  const [saved, setSaved] = useState<number[]>([]);
  const [ready, setReady] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [origin, setOrigin] = useState(collegePark);
  const [radius, setRadius] = useState(2);
  const [reportVenue, setReportVenue] = useState<Venue | null>(null);
  const [picker, setPicker] = useState(false);
  const [locationSheet, setLocationSheet] = useState(false);
  const [notice, setNotice] = useState("");
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
  const toggleSave = async (id: number) => {
    if (API_URL && !account) {
      toast("Sign in from You to save spots.");
      return;
    }
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
    }
  };
  const submitReport = async (level: number, wait: number | null) => {
    if (!reportVenue) return;
    if (API_URL && !account)
      throw new Error("Sign in from You to share a crowd report.");
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
          }),
        },
        account!.token,
      );
      report = {
        ...report,
        id: String(response.id),
        createdAt: response.created_at,
      };
    }
    const next = [report, ...reports];
    if (!API_URL)
      await AsyncStorage.setItem(
        STORAGE,
        JSON.stringify({ reports: next, saved }),
      );
    setReports(next);
  };
  const signIn = async (username: string, password: string) => {
    const session: Account = await request("/auth/sign-in/", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
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
    venues,
    reports,
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
    openReport: (v) => (v ? setReportVenue(v) : setPicker(true)),
  };
  return (
    <Context.Provider value={store}>
      <StatusBar style="dark" />
      <Brand />
      <View
        style={{ flex: 1 }}
        aria-hidden={!!reportVenue || picker || locationSheet}
        importantForAccessibility={
          reportVenue || picker || locationSheet
            ? "no-hide-descendants"
            : "auto"
        }
      >
        <NavigationContainer<Routes>
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
              contentStyle: { backgroundColor: c.white },
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
export default function App(): React.JSX.Element {
  const [loaded, error] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });
  if (!loaded && !error)
    return (
      <View style={s.loading}>
        <ActivityIndicator color={c.accent} />
        <Text style={{ marginTop: 16, color: c.ink }}>WhatsPoppin</Text>
      </View>
    );
  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <View
          testID="mobile-app"
          style={{
            flex: 1,
            width: "100%",
            maxWidth: Platform.OS === "web" ? MOBILE_PREVIEW_WIDTH : undefined,
            alignSelf: "center",
            backgroundColor: c.white,
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
    backgroundColor: c.white,
  },
  screen: { flex: 1, backgroundColor: c.white },
  page: {
    width: "100%",
    maxWidth: 1120,
    alignSelf: "center",
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 32,
  },
  brandOuter: {
    backgroundColor: c.white,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
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
  brandName: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandMark: { flexDirection: "row", alignItems: "flex-end", gap: 3 },
  wordmark: {
    fontFamily: f.extra,
    fontSize: 22,
    letterSpacing: -0.9,
    lineHeight: 32,
  },
  previewTag: { flexDirection: "row", alignItems: "center", gap: 6 },
  previewDot: { width: 6, height: 6, backgroundColor: c.busy, borderRadius: 3 },
  previewText: { fontSize: 11, color: c.muted, fontFamily: f.medium },
  locationLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    gap: 8,
  },
  locationButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    minHeight: 44,
    flexShrink: 1,
  },
  locationText: { fontFamily: f.semibold, fontSize: 13 },
  pageHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    lineHeight: 36,
    fontFamily: f.extra,
    letterSpacing: -1,
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
    backgroundColor: c.background,
    borderWidth: 1,
    borderColor: c.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  searchPlaceholder: { fontSize: 14, color: c.muted, flex: 1 },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontFamily: f.regular,
    fontSize: 15,
    color: c.ink,
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
  },
  filterSelected: { backgroundColor: c.ink, borderColor: c.ink },
  filterText: { fontFamily: f.semibold, fontSize: 13 },
  resultsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    flexWrap: "wrap",
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
    backgroundColor: c.background,
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
  segmentActive: { backgroundColor: c.white },
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
  dot: { color: c.subtle },
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
  meterPart: { flex: 1, borderRadius: 2 },
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
  footnote: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingTop: 20,
  },
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
    backgroundColor: c.accent,
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
    paddingVertical: 24,
  },
  detailTitle: {
    fontFamily: f.extra,
    fontSize: 27,
    lineHeight: 35,
    letterSpacing: -0.8,
  },
  detailCrowd: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 20,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: c.border,
  },
  crowdContext: { alignItems: "flex-end", gap: 10, paddingTop: 3 },
  contextLine: { flexDirection: "row", gap: 7, alignItems: "center" },
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
  trend: { flexDirection: "row", marginTop: 16, marginBottom: 10 },
  trendLevels: {
    paddingTop: 12,
    paddingBottom: 38,
    justifyContent: "space-between",
    width: 48,
  },
  trendTimes: { flexDirection: "row", justifyContent: "space-between" },
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
    backgroundColor: c.background,
    alignItems: "center",
    justifyContent: "center",
  },
  sampleNote: {
    flexDirection: "row",
    gap: 10,
    marginTop: 20,
    backgroundColor: c.background,
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
    backgroundColor: c.accent,
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
  profileIdentity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginVertical: 8,
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
