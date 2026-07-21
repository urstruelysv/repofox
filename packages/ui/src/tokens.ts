export const tokens = {
  color: {
    bg: {
      primary: "#1e1e1e",
      surface: "#252526",
      elevated: "#2d2d2d",
    },
    border: {
      default: "#333333",
      subtle: "#3a3a3a",
      focus: "#4338CA"  ,
    },
    accent: {
      primary: "#4338CA",
      hover: "#4338CA",
      active: "#3730A3",
    },
    text: {
      primary: "#d4d4d4",
      secondary: "#888888",
      muted: "#555555",
      onAccent: "#ffffff",
    },
    status: {
      success: "#22c55e",
      successBg: "#1a3a2a",
      warning: "#f59e0b",
      error: "#ef4444",
      pendingDot: "#3a3a3a",
    },
    branch: {
      pill: "#2d2b55",
      pillText: "#a59ff5",
    },
  },
  size: {
    activityBar: "48px",
    sidebar: "240px",
    bigButton: "38px",
  },
  radius: {
    card: "6px",
    button: "8px",
    badge: "4px",
    pill: "10px",
  },
} as const;
