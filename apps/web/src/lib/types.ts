/** Shapes of the API's JSON responses (see /api/docs). */

import type { Rating } from "./rating";

export interface ClubStats {
  /** The members' average, rounded to the nearest verdict; null until someone reviews. */
  verdict: Rating | null;
  /** The same average on the 1-4 scale, to 2 decimals. */
  average: number | null;
  reviewCount: number;
}

export interface MediaSummary {
  id: number;
  anilistId: number;
  type: "anime" | "manga";
  format: string | null;
  status: string | null;
  title: { display: string; romaji: string; english: string | null; native: string | null };
  coverImageUrl: string | null;
  coverColor: string | null;
  genres: string[];
  season: string | null;
  year: number | null;
  episodes: number | null;
  chapters: number | null;
  anilistScore: number | null;
  popularity: number | null;
  club: ClubStats;
}

export interface Character {
  anilistId: number;
  name: string;
  nativeName: string | null;
  imageUrl: string | null;
  role: string | null;
}

export interface MediaDetail extends MediaSummary {
  club: ClubStats & { breakdown: Record<Rating, number> };
  malId: number | null;
  synopsis: string | null;
  bannerImageUrl: string | null;
  tags: string[];
  volumes: number | null;
  anilistUrl: string;
  characters: Character[];
  syncedAt: string;
}

export interface Recommendation {
  media: MediaSummary;
  reasons: string[];
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface Review {
  id: string;
  rating: Rating;
  body: string;
  hasSpoilers: boolean;
  likeCount: number;
  likedByMe: boolean;
  createdAt: string;
  updatedAt: string;
  edited: boolean;
  author: {
    id: string;
    username: string | null;
    displayUsername: string | null;
    image: string | null;
  };
  media: { id: number; type: "anime" | "manga"; title: string; coverImageUrl: string | null };
}

export interface ClubSuggestion {
  id: string;
  weekStart: string;
  note: string | null;
  createdAt: string;
  suggestedBy: {
    username: string;
    displayUsername: string | null;
    image: string | null;
  } | null;
  media: MediaSummary;
}

export interface CurrentWeek {
  weekStart: string;
  items: ClubSuggestion[];
}

export type ListStatus = "planning" | "current" | "completed" | "paused" | "dropped";

export interface ListEntry {
  status: ListStatus;
  progress: number;
  total: number | null;
  createdAt: string;
  updatedAt: string;
  media: MediaSummary;
}

export interface Profile {
  user: {
    username: string;
    displayUsername: string | null;
    image: string | null;
    role: string;
    joinedAt: string;
  };
  stats: {
    reviews: number;
    likesReceived: number;
    verdicts: Record<Rating, number>;
    list: Record<"anime" | "manga", Record<ListStatus, number>>;
    episodesWatched: number;
    chaptersRead: number;
    topGenres: string[];
  };
}

/** Who's looking at a review: null for guests. */
export type Viewer = { id: string; hasUsername: boolean } | null;
