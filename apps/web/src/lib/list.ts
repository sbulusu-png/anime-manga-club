import type { ListStatus } from "./types";

/** "Watching" for anime, "Reading" for manga, and so on. */
export function statusLabel(status: ListStatus, type: "anime" | "manga"): string {
  switch (status) {
    case "current":
      return type === "anime" ? "Watching" : "Reading";
    case "completed":
      return "Completed";
    case "paused":
      return "Paused";
    case "dropped":
      return "Dropped";
  }
}
