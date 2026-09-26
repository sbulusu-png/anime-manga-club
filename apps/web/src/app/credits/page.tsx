import type { Metadata } from "next";

export const metadata: Metadata = { title: "Credits" };

interface Credit {
  name: string;
  by: string;
  license: string;
  licenseUrl?: string;
  url?: string;
  note?: string;
}

const SECTIONS: { heading: string; credits: Credit[] }[] = [
  {
    heading: "3D models",
    credits: [
      {
        name: "Anya Forger (SPY x FAMILY)",
        url: "https://skfb.ly/o9NEW",
        by: "tonyhoni",
        license: "Creative Commons Attribution 4.0",
        licenseUrl: "http://creativecommons.org/licenses/by/4.0/",
        note: "Compressed for the web with gltf-transform (meshopt geometry, WebP textures).",
      },
    ],
  },
  {
    heading: "Images and data",
    credits: [
      {
        name: "Anime and manga data, cover art and character art",
        url: "https://anilist.co",
        by: "AniList",
        license: "AniList API terms",
        licenseUrl: "https://docs.anilist.co/guide/terms-of-use",
      },
    ],
  },
  {
    heading: "Characters",
    credits: [
      {
        name: "Monkey D. Luffy (One Piece)",
        by: "Eiichiro Oda",
        license: "© Eiichiro Oda / Shueisha",
      },
      { name: "Ichigo Kurosaki (Bleach)", by: "Tite Kubo", license: "© Tite Kubo / Shueisha" },
      { name: "Asta (Black Clover)", by: "Yūki Tabata", license: "© Yūki Tabata / Shueisha" },
      {
        name: "Edward Elric (Fullmetal Alchemist)",
        by: "Hiromu Arakawa",
        license: "© Hiromu Arakawa / Square Enix",
      },
      {
        name: "Conan Edogawa (Detective Conan)",
        by: "Gosho Aoyama",
        license: "© Gosho Aoyama / Shogakukan",
      },
      {
        name: "Anya Forger (SPY x FAMILY)",
        by: "Tatsuya Endo",
        license: "© Tatsuya Endo / Shueisha",
      },
    ],
  },
  {
    heading: "Services",
    credits: [
      {
        name: "Pwned Passwords",
        url: "https://haveibeenpwned.com/Passwords",
        by: "Troy Hunt (Have I Been Pwned)",
        license: "Creative Commons Attribution 4.0",
        licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
        note: "Used to refuse passwords found in data breaches. Only the first five characters of a password's hash ever leave our server.",
      },
    ],
  },
  {
    heading: "Fonts",
    credits: [
      { name: "Bangers", by: "Vernon Adams", license: "SIL Open Font License" },
      { name: "Inter", by: "Rasmus Andersson", license: "SIL Open Font License" },
    ],
  },
];

/** The open-source projects the site is built on (each under its own licence). */
const LIBRARIES: { name: string; license: string; url: string }[] = [
  { name: "Next.js", license: "MIT", url: "https://nextjs.org" },
  { name: "React", license: "MIT", url: "https://react.dev" },
  { name: "Tailwind CSS", license: "MIT", url: "https://tailwindcss.com" },
  { name: "GSAP", license: "GSAP Standard License", url: "https://gsap.com" },
  { name: "three.js", license: "MIT", url: "https://threejs.org" },
  { name: "Hono", license: "MIT", url: "https://hono.dev" },
  { name: "Better Auth", license: "MIT", url: "https://www.better-auth.com" },
  { name: "Drizzle ORM", license: "Apache 2.0", url: "https://orm.drizzle.team" },
  { name: "Zod", license: "MIT", url: "https://zod.dev" },
  { name: "PostgreSQL", license: "PostgreSQL License", url: "https://www.postgresql.org" },
  { name: "Playwright", license: "Apache 2.0", url: "https://playwright.dev" },
  { name: "axe-core", license: "MPL 2.0", url: "https://github.com/dequelabs/axe-core" },
];

export default function CreditsPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="font-display text-5xl tracking-wide">Credits</h1>
      <p className="mt-3 text-muted">
        This fan project for our club builds on the generous work of these creators. Anime and manga
        titles, characters and artwork belong to their respective owners.
      </p>

      {SECTIONS.map((section) => (
        <section key={section.heading} className="mt-10">
          <h2 className="text-xl font-bold">{section.heading}</h2>
          <ul className="mt-4 flex flex-col gap-4">
            {section.credits.map((credit) => (
              <li
                key={credit.name}
                className="rounded-2xl border border-border bg-surface p-5 shadow-card"
              >
                <p className="font-semibold">
                  {credit.url ? (
                    <a
                      href={credit.url}
                      className="text-link underline underline-offset-4"
                      rel="noreferrer"
                    >
                      {credit.name}
                    </a>
                  ) : (
                    credit.name
                  )}
                </p>
                <p className="text-sm text-muted">
                  by {credit.by} · {credit.licenseUrl ? "licensed under " : ""}
                  {credit.licenseUrl ? (
                    <a
                      href={credit.licenseUrl}
                      className="text-link underline underline-offset-4"
                      rel="noreferrer"
                    >
                      {credit.license}
                    </a>
                  ) : (
                    credit.license
                  )}
                </p>
                {credit.note && <p className="mt-2 text-sm text-muted">{credit.note}</p>}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="mt-10">
        <h2 className="text-xl font-bold">Open-source software</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {LIBRARIES.map((library) => (
            <li
              key={library.name}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3"
            >
              <a
                href={library.url}
                className="font-semibold text-link underline-offset-4 hover:underline"
                rel="noreferrer"
              >
                {library.name}
              </a>
              <span className="text-sm text-muted">{library.license}</span>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
