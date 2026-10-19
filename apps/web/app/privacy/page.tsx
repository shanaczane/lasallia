// The public privacy policy (linked from the login page, and needed for
// Google sign-in verification). The notice is the same DRAFT text as the
// first-login popup; the Google sign-in and service provider sections are
// only on this page.

import type { Metadata } from "next"
import Link from "next/link"
import { NOTICE_INTRO, NOTICE_SECTIONS } from "@/lib/privacyNotice"

export const metadata: Metadata = {
  title: "Privacy Policy · Lasallia",
  description: "How the Lasallia library system of the De La Salle Lipa Learning Resource Center collects, uses and protects your personal data.",
}

const PAGE_SECTIONS: { heading: string; body: string; items?: string[] }[] = [
  {
    heading: "SIGNING IN WITH GOOGLE",
    body: "If you sign in with your Google account, Lasallia receives your name and email address from Google. We use them only to identify you and link you to your library account. We do not use Google account data for advertising, and we do not sell it or share it with anyone outside DLSL except the service providers listed below.",
  },
  {
    heading: "SERVICE PROVIDERS",
    body: "Lasallia relies on these services to run. They process data only to provide their service to the LRC:",
    items: [
      "Supabase — database and sign-in",
      "Vercel and Railway — hosting the website and its server",
      "Resend — sending account email notifications",
      "OpenAI — generating replies in the library assistant chat",
    ],
  },
]

const body = { fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }

function Section({ heading, text, items }: { heading: string; text: string; items?: string[] }) {
  return (
    <section>
      <h2 className="font-semibold text-ink-900" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-body)" }}>
        {heading}
      </h2>
      <p className="mt-1">{text}</p>
      {items && (
        <ul className="mt-1 flex list-disc flex-col gap-1 pl-5">
          {items.map((item) => <li key={item}>{item}</li>)}
        </ul>
      )}
    </section>
  )
}

export default function PrivacyPage() {
  return (
    <main className="min-h-dvh bg-paper px-4 py-10 sm:py-14">
      <div className="mx-auto w-full max-w-3xl">
        <Link href="/login" className="mb-8 flex items-center gap-3 w-fit">
          <span className="flex h-12 w-12 items-center justify-center rounded-full border border-ink-200 bg-white shadow-(--shadow-sm)">
            {/* eslint-disable-next-line @next/next/no-img-element -- same seal as the login page */}
            <img src="/DeLaSalleLipa_Seal.png" alt="De La Salle Lipa" className="h-9 w-9 object-contain" style={{ mixBlendMode: "multiply" }} />
          </span>
          <span className="flex flex-col">
            <span className="text-ink-900 font-bold" style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)" }}>Lasallia</span>
            <span
              className="text-green-700 font-bold uppercase"
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-eyebrow)" }}
            >
              De La Salle Lipa · LRC
            </span>
          </span>
        </Link>

        <h1 className="text-ink-900 font-semibold leading-tight" style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-4xl)" }}>
          Privacy Policy
        </h1>

        <div className="mt-6 flex flex-col gap-5 rounded-(--radius) border border-ink-200 bg-white p-5 sm:p-8 text-ink-700" style={body}>
          <p>{NOTICE_INTRO}</p>
          {NOTICE_SECTIONS.map((s) => <Section key={s.heading} heading={s.heading} text={s.body} items={s.items} />)}
          {PAGE_SECTIONS.map((s) => <Section key={s.heading} heading={s.heading} text={s.body} items={s.items} />)}
        </div>

        <p className="mt-6 text-ink-500" style={body}>
          <Link href="/login" className="font-semibold text-green-700 hover:text-green-900">← Back to sign in</Link>
        </p>
      </div>
    </main>
  )
}
