import { relations } from "drizzle-orm";

import { accounts, sessions, users } from "./auth.js";
import { clubSuggestions, follows, listEntries, reviewLikes, reviews } from "./community.js";
import { media } from "./media.js";

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  reviews: many(reviews),
  listEntries: many(listEntries),
  followers: many(follows, { relationName: "following" }),
  following: many(follows, { relationName: "follower" }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const mediaRelations = relations(media, ({ many }) => ({
  reviews: many(reviews),
  listEntries: many(listEntries),
  clubSuggestions: many(clubSuggestions),
}));

export const reviewsRelations = relations(reviews, ({ one, many }) => ({
  user: one(users, { fields: [reviews.userId], references: [users.id] }),
  media: one(media, { fields: [reviews.mediaId], references: [media.id] }),
  likes: many(reviewLikes),
}));

export const reviewLikesRelations = relations(reviewLikes, ({ one }) => ({
  user: one(users, { fields: [reviewLikes.userId], references: [users.id] }),
  review: one(reviews, { fields: [reviewLikes.reviewId], references: [reviews.id] }),
}));

export const listEntriesRelations = relations(listEntries, ({ one }) => ({
  user: one(users, { fields: [listEntries.userId], references: [users.id] }),
  media: one(media, { fields: [listEntries.mediaId], references: [media.id] }),
}));

export const followsRelations = relations(follows, ({ one }) => ({
  follower: one(users, {
    fields: [follows.followerId],
    references: [users.id],
    relationName: "follower",
  }),
  following: one(users, {
    fields: [follows.followingId],
    references: [users.id],
    relationName: "following",
  }),
}));

export const clubSuggestionsRelations = relations(clubSuggestions, ({ one }) => ({
  media: one(media, { fields: [clubSuggestions.mediaId], references: [media.id] }),
  suggestedBy: one(users, { fields: [clubSuggestions.suggestedById], references: [users.id] }),
}));
