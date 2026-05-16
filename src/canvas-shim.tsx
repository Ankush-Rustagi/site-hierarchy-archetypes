// Canvas shim: re-implements the cursor/canvas SDK as a small Tailwind-styled
// React component library so the canvas TSX renders as a static web page.
// All names + prop shapes mirror what the canvas file imports from cursor/canvas.

import {
  CSSProperties,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

// -----------------------------------------------------------------
// Theme + palette
// -----------------------------------------------------------------

export const colorPalette = {
  blue: "#3b82f6",
  green: "#10b981",
  orange: "#f59e0b",
  red: "#ef4444",
  yellow: "#facc15",
  purple: "#a78bfa",
  pink: "#ec4899",
  gray: "#6b7280",
  cyan: "#06b6d4",
  teal: "#14b8a6",
} as const;

export type Theme = {
  kind: "dark" | "light";
  bg: { default: string; elevated: string; subtle: string; chrome: string };
  fill: { primary: string; secondary: string; tertiary: string };
  stroke: { primary: string; secondary: string; tertiary: string };
  text: { primary: string; secondary: string; tertiary: string };
};

const DARK_THEME: Theme = {
  kind: "dark",
  bg: {
    default: "#0b1020",
    elevated: "#111827",
    subtle: "#1f2937",
    chrome: "#0f172a",
  },
  fill: {
    primary: "#1f2937",
    secondary: "#111827",
    tertiary: "#1a2235",
  },
  stroke: {
    primary: "#4b5563",
    secondary: "#374151",
    tertiary: "#2d3748",
  },
  text: {
    primary: "#f9fafb",
    secondary: "#cbd5e1",
    tertiary: "#9ca3af",
  },
};

export function useHostTheme(): Theme {
  return DARK_THEME;
}

// -----------------------------------------------------------------
// Persisted state (localStorage-backed, mirrors useCanvasState)
// -----------------------------------------------------------------

const STATE_PREFIX = "site-hierarchy:";
const STATE_EVENT = "canvas-state-change";

type StateChangeDetail = { key: string; value: unknown };

export function useCanvasState<T>(
  key: string,
  initial: T,
): [T, (next: T | ((prev: T) => T)) => void] {
  const storageKey = `${STATE_PREFIX}${key}`;
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const raw = window.localStorage.getItem(storageKey);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<StateChangeDetail>).detail;
      if (!detail || detail.key !== key) return;
      setValue(detail.value as T);
    };
    window.addEventListener(STATE_EVENT, handler);
    return () => window.removeEventListener(STATE_EVENT, handler);
  }, [key]);

  const setter = useCallback(
    (next: T | ((prev: T) => T)) =>
      setValue((prev) => {
        const resolved =
          typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(storageKey, JSON.stringify(resolved));
          } catch {
            // Ignore storage errors (quota, private mode, etc.)
          }
          window.dispatchEvent(
            new CustomEvent<StateChangeDetail>(STATE_EVENT, {
              detail: { key, value: resolved },
            }),
          );
        }
        return resolved;
      }),
    [key, storageKey],
  );

  return [value, setter];
}

// -----------------------------------------------------------------
// Layout primitives
// -----------------------------------------------------------------

type LayoutCommon = {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
};

type StackProps = LayoutCommon & { gap?: number };

export function Stack({ children, gap = 8, className, style }: StackProps) {
  return (
    <div
      className={className}
      style={{
        display: "flex",
        flexDirection: "column",
        gap,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

type RowProps = LayoutCommon & {
  gap?: number;
  align?: "start" | "center" | "end" | "baseline" | "stretch";
  justify?:
    | "start"
    | "center"
    | "end"
    | "space-between"
    | "space-around"
    | "space-evenly";
  wrap?: boolean;
};

const ALIGN_MAP: Record<NonNullable<RowProps["align"]>, string> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  baseline: "baseline",
  stretch: "stretch",
};

const JUSTIFY_MAP: Record<NonNullable<RowProps["justify"]>, string> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  "space-between": "space-between",
  "space-around": "space-around",
  "space-evenly": "space-evenly",
};

export function Row({
  children,
  gap = 8,
  align,
  justify,
  wrap,
  className,
  style,
}: RowProps) {
  return (
    <div
      className={className}
      style={{
        display: "flex",
        flexDirection: "row",
        gap,
        alignItems: align ? ALIGN_MAP[align] : undefined,
        justifyContent: justify ? JUSTIFY_MAP[justify] : undefined,
        flexWrap: wrap ? "wrap" : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

type GridProps = LayoutCommon & { columns?: number; gap?: number };

export function Grid({
  children,
  columns = 2,
  gap = 12,
  className,
  style,
}: GridProps) {
  return (
    <div
      className={className}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gap,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// -----------------------------------------------------------------
// Headings + text
// -----------------------------------------------------------------

type HeadingProps = { children?: ReactNode; id?: string };

export function H1({ children, id }: HeadingProps) {
  return (
    <h1
      id={id}
      style={{
        fontSize: 28,
        fontWeight: 700,
        lineHeight: 1.2,
        color: DARK_THEME.text.primary,
        margin: 0,
      }}
    >
      {children}
    </h1>
  );
}

export function H2({ children, id }: HeadingProps) {
  return (
    <h2
      id={id}
      style={{
        fontSize: 22,
        fontWeight: 600,
        lineHeight: 1.25,
        color: DARK_THEME.text.primary,
        margin: 0,
      }}
    >
      {children}
    </h2>
  );
}

export function H3({ children, id }: HeadingProps) {
  return (
    <h3
      id={id}
      style={{
        fontSize: 16,
        fontWeight: 600,
        lineHeight: 1.3,
        color: DARK_THEME.text.primary,
        margin: 0,
      }}
    >
      {children}
    </h3>
  );
}

type TextTone =
  | "primary"
  | "secondary"
  | "tertiary"
  | "info"
  | "warning"
  | "success"
  | "danger"
  | "neutral";

type TextSize = "small" | "medium" | "large";

const TEXT_TONE_COLOR: Record<TextTone, string> = {
  primary: DARK_THEME.text.primary,
  secondary: DARK_THEME.text.secondary,
  tertiary: DARK_THEME.text.tertiary,
  info: "#60a5fa",
  warning: "#fbbf24",
  success: "#34d399",
  danger: "#f87171",
  neutral: DARK_THEME.text.primary,
};

const TEXT_SIZE_PX: Record<TextSize, number> = {
  small: 13,
  medium: 14.5,
  large: 17,
};

type TextProps = {
  children?: ReactNode;
  as?: "span" | "p" | "div";
  size?: TextSize;
  weight?: "regular" | "medium" | "semibold" | "bold";
  tone?: TextTone;
  italic?: boolean;
  className?: string;
  style?: CSSProperties;
};

const WEIGHT_MAP: Record<NonNullable<TextProps["weight"]>, number> = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
};

export function Text({
  children,
  as: As = "p",
  size = "medium",
  weight = "regular",
  tone = "primary",
  italic,
  className,
  style,
}: TextProps) {
  return (
    <As
      className={className}
      style={{
        fontSize: TEXT_SIZE_PX[size],
        fontWeight: WEIGHT_MAP[weight],
        color: TEXT_TONE_COLOR[tone],
        fontStyle: italic ? "italic" : undefined,
        lineHeight: 1.5,
        margin: 0,
        ...style,
      }}
    >
      {children}
    </As>
  );
}

export function Code({ children }: { children?: ReactNode }) {
  return (
    <code
      style={{
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: "0.9em",
        background: "rgba(148, 163, 184, 0.15)",
        color: "#fde68a",
        padding: "1px 6px",
        borderRadius: 4,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </code>
  );
}

export function Divider() {
  return (
    <div
      style={{
        height: 1,
        background: DARK_THEME.stroke.secondary,
        width: "100%",
      }}
    />
  );
}

// -----------------------------------------------------------------
// Pills
// -----------------------------------------------------------------

export type PillTone =
  | "info"
  | "warning"
  | "success"
  | "danger"
  | "neutral"
  | "renamed"
  | "added"
  | "deleted"
  | "secondary";

const PILL_TONE: Record<
  PillTone,
  { bg: string; fg: string; border: string }
> = {
  info: { bg: "#1e3a8a40", fg: "#93c5fd", border: "#3b82f6" },
  warning: { bg: "#78350f40", fg: "#fcd34d", border: "#f59e0b" },
  success: { bg: "#064e3b40", fg: "#6ee7b7", border: "#10b981" },
  danger: { bg: "#7f1d1d40", fg: "#fca5a5", border: "#ef4444" },
  neutral: { bg: "#37415140", fg: "#e5e7eb", border: "#4b5563" },
  renamed: { bg: "#5b21b640", fg: "#c4b5fd", border: "#8b5cf6" },
  added: { bg: "#86198f40", fg: "#f9a8d4", border: "#d946ef" },
  deleted: { bg: "#7c2d1240", fg: "#fdba74", border: "#ea580c" },
  secondary: { bg: "#37415130", fg: "#cbd5e1", border: "#374151" },
};

const PILL_SIZE_PX: Record<"sm" | "md" | "lg", { fs: number; pad: string }> = {
  sm: { fs: 11.5, pad: "2px 8px" },
  md: { fs: 13, pad: "4px 10px" },
  lg: { fs: 14, pad: "6px 12px" },
};

type PillProps = {
  children?: ReactNode;
  size?: "sm" | "md" | "lg";
  tone?: PillTone;
  active?: boolean;
  onClick?: () => void;
  leadingContent?: ReactNode;
  title?: string;
};

export function Pill({
  children,
  size = "sm",
  tone = "neutral",
  active,
  onClick,
  leadingContent,
  title,
}: PillProps) {
  const t = PILL_TONE[tone];
  const sz = PILL_SIZE_PX[size];
  const interactive = !!onClick;
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={!interactive}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: active ? t.border + "33" : t.bg,
        color: t.fg,
        border: `1px solid ${active ? t.border : t.border + "80"}`,
        boxShadow: active ? `0 0 0 2px ${t.border}40` : undefined,
        padding: sz.pad,
        borderRadius: 999,
        fontSize: sz.fs,
        fontWeight: 600,
        lineHeight: 1.3,
        cursor: interactive ? "pointer" : "default",
        whiteSpace: "nowrap",
        font: "inherit",
        appearance: "none",
      }}
    >
      {leadingContent ? <span style={{ display: "inline-flex" }}>{leadingContent}</span> : null}
      <span style={{ fontSize: sz.fs, fontWeight: 600 }}>{children}</span>
    </button>
  );
}

// -----------------------------------------------------------------
// Stats
// -----------------------------------------------------------------

type StatProps = {
  value: ReactNode;
  label: string;
  tone?: "neutral" | "info" | "warning" | "success" | "danger";
};

const STAT_TONE_COLOR: Record<NonNullable<StatProps["tone"]>, string> = {
  neutral: DARK_THEME.text.primary,
  info: "#93c5fd",
  warning: "#fcd34d",
  success: "#6ee7b7",
  danger: "#fca5a5",
};

export function Stat({ value, label, tone = "neutral" }: StatProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        padding: 16,
        background: DARK_THEME.bg.elevated,
        border: `1px solid ${DARK_THEME.stroke.secondary}`,
        borderRadius: 8,
        gap: 4,
        minHeight: 70,
      }}
    >
      <div
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: STAT_TONE_COLOR[tone],
          lineHeight: 1.1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 12,
          color: DARK_THEME.text.tertiary,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          fontWeight: 500,
        }}
      >
        {label}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------
// Card
// -----------------------------------------------------------------

export function Card({
  children,
  className,
  style,
}: {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={className}
      style={{
        background: DARK_THEME.bg.elevated,
        border: `1px solid ${DARK_THEME.stroke.secondary}`,
        borderRadius: 8,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

type CardHeaderProps = {
  children?: ReactNode;
  trailing?: ReactNode;
};

export function CardHeader({ children, trailing }: CardHeaderProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        padding: "10px 14px",
        borderBottom: `1px solid ${DARK_THEME.stroke.tertiary}`,
        background: DARK_THEME.bg.subtle,
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: DARK_THEME.text.primary,
        }}
      >
        {children}
      </div>
      {trailing ? <div style={{ display: "inline-flex" }}>{trailing}</div> : null}
    </div>
  );
}

export function CardBody({ children }: { children?: ReactNode }) {
  return <div style={{ padding: 14 }}>{children}</div>;
}

// -----------------------------------------------------------------
// Callout
// -----------------------------------------------------------------

type CalloutProps = {
  children?: ReactNode;
  title?: ReactNode;
  tone?: "info" | "warning" | "success" | "danger" | "neutral";
};

const CALLOUT_TONE: Record<
  NonNullable<CalloutProps["tone"]>,
  { bg: string; border: string; title: string }
> = {
  info: { bg: "#1e3a8a26", border: "#3b82f6", title: "#bfdbfe" },
  warning: { bg: "#78350f26", border: "#f59e0b", title: "#fde68a" },
  success: { bg: "#064e3b26", border: "#10b981", title: "#a7f3d0" },
  danger: { bg: "#7f1d1d26", border: "#ef4444", title: "#fecaca" },
  neutral: { bg: "#37415126", border: "#4b5563", title: "#f3f4f6" },
};

export function Callout({ children, title, tone = "info" }: CalloutProps) {
  const t = CALLOUT_TONE[tone];
  return (
    <div
      style={{
        background: t.bg,
        border: `1px solid ${t.border}`,
        borderLeft: `4px solid ${t.border}`,
        borderRadius: 6,
        padding: "12px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      {title ? (
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: t.title,
          }}
        >
          {title}
        </div>
      ) : null}
      <div style={{ fontSize: 13, lineHeight: 1.55, color: "#d1d5db" }}>
        {children}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------
// Button
// -----------------------------------------------------------------

type ButtonProps = {
  children?: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary";
  title?: string;
  disabled?: boolean;
};

export function Button({
  children,
  onClick,
  variant = "primary",
  title,
  disabled,
}: ButtonProps) {
  const isPrimary = variant === "primary";
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{
        background: isPrimary ? "#3b82f6" : DARK_THEME.bg.elevated,
        color: isPrimary ? "#ffffff" : DARK_THEME.text.primary,
        border: `1px solid ${isPrimary ? "#3b82f6" : DARK_THEME.stroke.primary}`,
        borderRadius: 6,
        padding: "8px 14px",
        fontSize: 13,
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        font: "inherit",
        whiteSpace: "nowrap",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      {children}
    </button>
  );
}

// -----------------------------------------------------------------
// Table
// -----------------------------------------------------------------

type ColumnAlign = "left" | "center" | "right";

type TableProps = {
  headers: ReactNode[];
  rows: ReactNode[][];
  columnAlign?: ColumnAlign[];
  colMinWidth?: (number | undefined)[];
  colNoWrap?: boolean[];
};

export function Table({
  headers,
  rows,
  columnAlign,
  colMinWidth,
  colNoWrap,
}: TableProps) {
  const align = (i: number): ColumnAlign =>
    columnAlign?.[i] ?? "left";
  const nowrap = (i: number): boolean => colNoWrap?.[i] === true;
  return (
    <div
      className="vk-scroll"
      style={{
        border: `1px solid ${DARK_THEME.stroke.secondary}`,
        borderRadius: 8,
        overflowX: "auto",
        background: DARK_THEME.bg.elevated,
      }}
    >
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 13,
        }}
      >
        {colMinWidth ? (
          <colgroup>
            {headers.map((_, i) => {
              const w = colMinWidth[i];
              return (
                <col
                  key={i}
                  style={w ? { minWidth: w, width: w } : undefined}
                />
              );
            })}
          </colgroup>
        ) : null}
        <thead>
          <tr
            style={{
              background: DARK_THEME.bg.subtle,
              borderBottom: `2px solid ${DARK_THEME.stroke.primary}`,
            }}
          >
            {headers.map((h, i) => (
              <th
                key={i}
                style={{
                  textAlign: align(i),
                  padding: "10px 12px",
                  fontWeight: 700,
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  color: DARK_THEME.text.primary,
                  whiteSpace: "nowrap",
                  position: "relative",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr
              key={ri}
              style={{
                background:
                  ri % 2 === 0 ? "transparent" : "rgba(148, 163, 184, 0.04)",
                borderTop:
                  ri === 0
                    ? "none"
                    : `1px solid ${DARK_THEME.stroke.tertiary}`,
              }}
            >
              {r.map((cell, ci) => (
                <td
                  key={ci}
                  style={{
                    padding: "8px 12px",
                    verticalAlign: "top",
                    textAlign: align(ci),
                    color: DARK_THEME.text.secondary,
                    whiteSpace: nowrap(ci) ? "nowrap" : undefined,
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// -----------------------------------------------------------------
// Type-only re-exports (Memo helper to avoid unused warnings)
// -----------------------------------------------------------------

export const _shimSentinel = { useMemo };
