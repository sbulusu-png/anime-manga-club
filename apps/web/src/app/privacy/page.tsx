import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What Anime Manga Club keeps about members, why, and who else sees it.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      jp="プライバシー"
      updated="11 October 2026"
      intro={
        <p>
          Anime Manga Club is a free, non-commercial site run by students for the university anime
          and manga club. This page explains what we keep about you, why, and who else sees it. We
          don&apos;t sell your data, show ads or track you across other sites.
        </p>
      }
    >
      <section>
        <h2>What we keep</h2>
        <ul>
          <li>
            <strong>Your account:</strong> your university email, username, name, and your password
            (stored only as a secure hash, never as you typed it). If you sign in with Google, we
            get your name, email and profile photo from Google, and Google&apos;s sign-in tokens.
          </li>
          <li>
            <strong>What you post:</strong> your reviews and verdicts, the reviews you like, and
            your list (watching, completed, paused, dropped). Club leads&apos; weekly suggestions
            and club verdicts too.
          </li>
          <li>
            <strong>Sign-ins:</strong> for each signed-in device, its IP address, browser and when
            it signed in. We use these to keep your account safe and show them in the sign-in code
            email, so you can spot a sign-in that wasn&apos;t you. Sign-ins last up to 30 days.
          </li>
          <li>
            <strong>Sign-in codes and email links:</strong> the 6-digit codes are stored only as a
            hash and deleted once used (they expire after 10 minutes). Confirmation and
            password-reset links expire after 24 hours and 1 hour.
          </li>
        </ul>
      </section>

      <section>
        <h2>What other members can see</h2>
        <p>
          Your profile shows your username, profile photo, when you joined, your reviews and
          verdicts, and your list. Your email address and real name are never shown to anyone.
        </p>
      </section>

      <section>
        <h2>Cookies</h2>
        <p>
          We use only the cookies the site needs: one that keeps you signed in, one that remembers
          light or dark mode, and a short-lived one while you sign in with Google. No advertising or
          analytics cookies.
        </p>
      </section>

      <section>
        <h2>Who else handles your data</h2>
        <p>The site runs on these services, which only use the data to provide their part:</p>
        <ul>
          <li>
            <strong>Vercel</strong> hosts the website, and <strong>Render</strong> runs the server
            behind it (in Singapore).
          </li>
          <li>
            <strong>Neon</strong> stores the database (in Singapore).
          </li>
          <li>
            <strong>Brevo</strong> sends our emails: sign-in codes, confirmations and password
            resets.
          </li>
          <li>
            <strong>Google</strong>, if you choose to sign in with Google.
          </li>
          <li>
            <strong>Have I Been Pwned</strong> checks whether a new password has appeared in a data
            breach. Only the first 5 characters of a scrambled (hashed) version of it are sent,
            never the password itself.
          </li>
          <li>
            <strong>AniList</strong> provides the anime and manga information. If you import your
            AniList list, we use your AniList username to fetch your public list, and don&apos;t
            keep the username.
          </li>
        </ul>
        <p className="mt-3">
          Links to streaming and reading sites take you to those sites, which have their own privacy
          policies.
        </p>
      </section>

      <section>
        <h2>Your choices</h2>
        <ul>
          <li>
            Change your username or password in <Link href="/settings">Settings</Link>, where you
            can also sign out every other device.
          </li>
          <li>
            Delete your account in Settings at any time. Your reviews, likes, list and sign-ins are
            deleted with it. Club suggestions and verdicts a club lead gave stay, without their
            name.
          </li>
          <li>For anything else, such as a copy of your data, ask a club lead.</li>
        </ul>
      </section>

      <section>
        <h2>Changes</h2>
        <p>
          If this policy changes, we&apos;ll update this page and its date. For a big change,
          we&apos;ll tell members on the site first.
        </p>
      </section>

      <p className="text-sm text-muted">
        See also the <Link href="/terms">terms of service</Link>.
      </p>
    </LegalPage>
  );
}
