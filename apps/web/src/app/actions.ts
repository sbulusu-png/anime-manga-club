"use server";

import { updateTag } from "next/cache";

import { TAGS, getCurrentUser } from "@/lib/server-api";

/**
 * Called after a member reviews a title or changes their list, so the title page,
 * review feeds and their profile update straight away rather than when the cache
 * expires. It only clears cached copies of public data, so anyone may call it.
 */
export async function refreshAfterMemberChange(mediaId: number) {
  if (!Number.isInteger(mediaId) || mediaId <= 0) return;
  updateTag(TAGS.title(mediaId));
  updateTag(TAGS.mediaLists);
  updateTag(TAGS.reviews);
  const user = await getCurrentUser();
  if (user?.username) updateTag(TAGS.profile(user.username));
}

/**
 * Called after a member deletes their account. Their reviews, likes and list went
 * with it, so title pages, the feeds and their profile may have changed.
 */
export async function refreshAfterAccountDeleted(username: string) {
  updateTag(TAGS.allTitles);
  updateTag(TAGS.mediaLists);
  updateTag(TAGS.reviews);
  if (/^[a-zA-Z0-9_.]{1,30}$/.test(username)) updateTag(TAGS.profile(username));
  return Promise.resolve();
}

/**
 * Called after a member imports their AniList list: new titles may have joined the
 * catalog, and their profile's list and stats changed.
 */
export async function refreshAfterListImport() {
  updateTag(TAGS.mediaLists);
  const user = await getCurrentUser();
  if (user?.username) updateTag(TAGS.profile(user.username));
}

/** Called after a club lead gives, changes or removes a title's club verdict. */
export async function refreshAfterClubVerdict(mediaId: number) {
  if (!Number.isInteger(mediaId) || mediaId <= 0) return Promise.resolve();
  updateTag(TAGS.title(mediaId));
  updateTag(TAGS.mediaLists);
  return Promise.resolve();
}

/** Called after a club lead changes a week's suggestions. */
export async function refreshClubSuggestions() {
  updateTag(TAGS.club);
  return Promise.resolve();
}
