import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Terms of service",
  description: "The rules for using Anime Manga Club.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of service"
      jp="利用規約"
      updated="11 October 2026"
      intro={
        <p>
          Anime Manga Club is a free, non-commercial site run by students for the university anime
          and manga club. By creating an account or using the site, you agree to these terms.
        </p>
      }
    >
      <section>
        <h2>Who can join</h2>
        <p>
          Accounts are for the university&apos;s students and staff: you sign up with your
          university email. Keep your password and sign-in codes to yourself; you&apos;re
          responsible for what happens on your account.
        </p>
      </section>

      <section>
        <h2>What you post</h2>
        <ul>
          <li>Be respectful. Disagree with the take, not the person.</li>
          <li>Mark reviews that contain spoilers as spoilers.</li>
          <li>
            No harassment, hate, threats, sexual content, spam, or anything illegal, and don&apos;t
            share other people&apos;s personal information.
          </li>
          <li>
            Only post what you have the right to post. Don&apos;t paste other people&apos;s writing
            as your own, or link to pirated copies of anime or manga.
          </li>
        </ul>
        <p className="mt-3">
          Your reviews stay yours. By posting them, you let the club show them on the site for as
          long as you keep them up.
        </p>
      </section>

      <section>
        <h2>Club leads</h2>
        <p>
          Club leads give the club verdicts and weekly suggestions, and keep the site friendly: they
          can remove posts that break these terms, and suspend accounts that keep doing so.
        </p>
      </section>

      <section>
        <h2>Anime, manga and other sites</h2>
        <p>
          Titles, characters and artwork belong to their creators and publishers (see the{" "}
          <Link href="/credits">credits</Link>). Information about titles comes from AniList. Links
          to official streaming and reading sites are for your convenience; those sites are run by
          others, and what&apos;s available there depends on your country.
        </p>
      </section>

      <section>
        <h2>No guarantees</h2>
        <p>
          The site is a student project offered free and as it is. We do our best to keep it running
          and accurate, but can&apos;t promise it always will be, and we may change or stop it.
        </p>
      </section>

      <section>
        <h2>Leaving</h2>
        <p>
          You can delete your account in <Link href="/settings">Settings</Link> at any time. What
          happens to your data is in the <Link href="/privacy">privacy policy</Link>.
        </p>
      </section>

      <section>
        <h2>Changes</h2>
        <p>
          If these terms change, we&apos;ll update this page and its date. For a big change,
          we&apos;ll tell members on the site first. Questions? Ask a club lead.
        </p>
      </section>
    </LegalPage>
  );
}
