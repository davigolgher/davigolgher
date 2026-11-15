type Scale = Record<string, string>;
type FontSize = Record<string, [string, { lineHeight: string; letterSpacing?: string }]>;

export declare const colors: {
  ink: Record<"950" | "900" | "850" | "800" | "750" | "700" | "600", string>;
  chalk: { DEFAULT: string; soft: string; mute: string; faint: string };
  line: { DEFAULT: string; soft: string; strong: string };
  accent: string;
  signal: Record<"alert" | "alert-tint" | "ok" | "ok-tint" | "warn" | "warn-tint", string>;
};
export declare const borderRadius: Scale;
export declare const fontSize: FontSize;
export declare const iconSize: { sm: number; md: number; lg: number; xl: number; hero: number };
export declare const spacing: Scale;
export declare const layout: { gutter: number; sectionGap: number };
