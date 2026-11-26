// WhatsPoppin brand palette.
export const brand = {
  primary: "#620452", // deep plum
  secondary: "#E2135D", // hot pink
  accent: "#B414F5", // electric purple
  background: "#F8F2F1",
  text: "#1E1A28",
};

// 60-30-10 rule:
//   60% dominant  - brand.background on every screen, white cards, brand.text.
//   30% secondary - brand.primary: header bar, icons, links, outlines, selected states.
//   10% accent    - brand.secondary for the main buttons, active tab, and saved spots;
//                   brand.accent for focus rings and sign-up progress.
// The crowd-level colors below are status colors, not brand colors, so they stay
// green → red to keep Quiet/Busy/Packed easy to read.
export const colors = {
  ink: brand.text,
  muted: "#6B6275", // secondary text: 5.2:1 on background, 5.8:1 on white
  subtle: "#8E8496",
  placeholder: "#958C9E", // lighter than muted so hints read as hints: 3.2:1 on white
  accent: brand.primary,
  accentLight: "#F4E6F1", // plum tint for selected rows, notices, photo placeholders
  cta: brand.secondary, // filled buttons: white text is 4.7:1
  highlight: brand.accent,
  highlightLight: "#F1DDFD",
  savedFill: brand.secondary,
  onPrimary: "#FFFFFF",
  onPrimaryMuted: "#E9CFE3", // secondary text on the plum header: 8.7:1
  white: "#FFFFFF",
  background: brand.background,
  border: "#E8DCDF",
  pressed: "#F1E5EA",
  quiet: "#24634B",
  quietBg: "#EDF5EF",
  moderate: "#657229",
  moderateBg: "#F2F4E6",
  busy: "#94600F",
  busyBg: "#FBF2DF",
  packed: "#A34738",
  packedBg: "#F9EDE9",
  scrim: "rgba(30,26,40,0.45)",
  photoScrim: "rgba(30,26,40,0.60)",
  focus: brand.accent,
  mapLand: "#F0F1EA",
  mapPark: "#DCE8D8",
  mapRoad: "#FFFFFF",
  mapWater: "#DDE9ED",
};
export const font = {
  regular: "Manrope_400Regular",
  medium: "Manrope_500Medium",
  semibold: "Manrope_600SemiBold",
  bold: "Manrope_700Bold",
  extra: "Manrope_800ExtraBold",
};
export const levels = [
  {
    name: "Quiet",
    detail: "Plenty of space. Easy to find a seat.",
    short: "Room to relax",
    color: colors.quiet,
    bg: colors.quietBg,
    backend: 1,
  },
  {
    name: "Moderate",
    detail: "A good buzz, with room to move.",
    short: "A little buzz",
    color: colors.moderate,
    bg: colors.moderateBg,
    backend: 2,
  },
  {
    name: "Busy",
    detail: "Most seats taken. Expect a crowd.",
    short: "Getting lively",
    color: colors.busy,
    bg: colors.busyBg,
    backend: 3,
  },
  {
    name: "Packed",
    detail: "Standing room. Hard to move around.",
    short: "Full house",
    color: colors.packed,
    bg: colors.packedBg,
    backend: 5,
  },
] as const;
