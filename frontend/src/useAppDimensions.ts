import { Platform, useWindowDimensions, ScaledSize } from "react-native";
export const MOBILE_PREVIEW_WIDTH = 480;
export function useAppDimensions(): ScaledSize {
  const dimensions = useWindowDimensions();
  return {
    ...dimensions,
    width:
      Platform.OS === "web"
        ? Math.min(dimensions.width, MOBILE_PREVIEW_WIDTH)
        : dimensions.width,
  };
}
