// @ts-nocheck — Supabase Edge Function: runs on Deno, which VS Code's
// TypeScript checker doesn't know about (Deno.env, npm: imports).

// Daily job: writes a `due_reminder` notification for loans due within
// DUE_REMINDER_DAYS, an `overdue` notification for loans past due, and a
// `fine_reminder` notification for loans sitting with an unsettled fine,
// then emails each one in the shared Lasallia layout (renderEmail below
// mirrors apps/api/core/email_template.py, which can't be imported from
// Deno — keep the two in step).
//
// due_reminder/overdue are idempotent one-time markers: each loan is
// "claimed" by setting due_reminder_sent_at/overdue_notified_at from NULL
// (migration 0032) BEFORE the notification is written, so re-runs and
// overlapping runs never duplicate. fine_reminder is different — an
// unsettled fine can sit unpaid for a long time, so it's re-sent on a
// cooldown (FINE_REMINDER_COOLDOWN_DAYS) rather than only ever firing
// once: the "claim" there is fine_reminder_last_sent_at being NULL or
// older than the cooldown window (migration 0037).
//
// loans.status stays 'active' in the DB even when past due (routers/loans.py
// derives 'overdue' in memory), so "overdue" here means returned_at is null
// and due_date < now. fine_status is only ever meaningful on a RETURNED
// loan (schemas/loan.py: "an active loan has no fine yet"), so the fine
// reminder query is unrelated to returned_at.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FRONTEND_URL = Deno.env.get("FRONTEND_URL") ?? "http://localhost:3000";
const DUE_REMINDER_DAYS = Number(Deno.env.get("DUE_REMINDER_DAYS") ?? "1");
const FINE_REMINDER_COOLDOWN_DAYS = Number(Deno.env.get("FINE_REMINDER_COOLDOWN_DAYS") ?? "7");
const FROM_ADDRESS = "Lasallia <notifications@lasallia.com>";
const LOAN_LINK = "/user/library";
const FINE_LINK = "/user/profile";

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

type BookInfo = { title: string; call_number: string | null } | null;
type Recipient = { email: string | null; full_name: string | null } | null;

type LoanRow = {
  id: string;
  student_id: string;
  due_date: string;
  book_copies: { books: BookInfo } | null;
  profiles: Recipient;
};

type FineRow = {
  id: string;
  student_id: string;
  fine_amount: number | null;
  book_copies: { books: BookInfo } | null;
  profiles: Recipient;
};

const SELECT = "id, student_id, due_date, book_copies(books(title, call_number)), profiles:student_id(email, full_name)";
const FINE_SELECT = "id, student_id, fine_amount, book_copies(books(title, call_number)), profiles:student_id(email, full_name)";

// Used for the in-app notification text.
function dueLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long", day: "2-digit", year: "numeric", timeZone: "Asia/Manila",
  });
}

// ─── Email layout (mirrors apps/api/core/email_template.py) ────────────────

type EmailContent = {
  subject: string;
  intro: string;
  details: [string, string | null | undefined][];
  paragraphs: string[];
  linkLabel: string;
  link: string;
};

const CLOSING = "Sincerely,";
const SIGNATURE = "Lasallia, De La Salle Lipa Learning Resource Center";
const AUTOMATED_NOTE = "This is an automated message. Please do not reply to this email.";

// "MARIA SANTOS" -> "Maria"; names are often stored in capitals.
function firstName(fullName: string | null | undefined): string | null {
  const word = fullName?.trim().split(/\s+/)[0];
  if (!word) return null;
  return word === word.toUpperCase() ? word[0] + word.slice(1).toLowerCase() : word;
}

function renderEmail(c: EmailContent, recipientName: string | null | undefined): string {
  const name = firstName(recipientName);
  const blocks = [name ? `Hi ${name},` : "Hello,", c.intro];
  const details = c.details.filter(([, v]) => v).map(([label, v]) => `${label}: ${v}`);
  if (details.length) blocks.push(details.join("\n"));
  blocks.push(...c.paragraphs);
  blocks.push(`${c.linkLabel}: ${FRONTEND_URL}${c.link}`);
  blocks.push(`${CLOSING}\n${SIGNATURE}`, AUTOMATED_NOTE);
  return blocks.join("\n\n");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Same layout as renderEmail, with the detail labels in bold.
function renderEmailHtml(c: EmailContent, recipientName: string | null | undefined): string {
  const name = firstName(recipientName);
  const blocks = [escapeHtml(name ? `Hi ${name},` : "Hello,"), escapeHtml(c.intro)];
  const details = c.details.filter(([, v]) => v)
    .map(([label, v]) => `<strong>${escapeHtml(label)}:</strong> ${escapeHtml(v!)}`);
  if (details.length) blocks.push(details.join("<br>"));
  blocks.push(...c.paragraphs.map(escapeHtml));
  const url = escapeHtml(`${FRONTEND_URL}${c.link}`);
  blocks.push(`${escapeHtml(c.linkLabel)}: <a href="${url}">${url}</a>`);
  blocks.push(`${CLOSING}<br>${escapeHtml(SIGNATURE)}`, escapeHtml(AUTOMATED_NOTE));
  return blocks.map((b) => `<p style="margin:0 0 16px">${b}</p>`).join("");
}

// "Friday, October 17, 2026" in Philippine time.
function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "Asia/Manila",
  });
}

// Calendar days from today to the due date, counted in Philippine time.
function daysUntil(iso: string): number {
  const ymd = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  return Math.round((Date.parse(ymd(new Date(iso))) - Date.parse(ymd(new Date()))) / 86_400_000);
}

function peso(n: number): string {
  return `₱${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function sendEmail(to: string | null | undefined, content: EmailContent, recipientName: string | null | undefined) {
  // Mirrors apps/api/core/notify.py's send_email guard (b2d04d7) — skips
  // RFC 2606 reserved-TLD test accounts (zz-audit-*@..., zz-ui-*@...) so
  // seed/test data doesn't generate Resend delivery-failure noise. This
  // copy never had the guard even after the Python side got it, since
  // Deno can't import that fix — kept in sync here instead.
  if (!RESEND_API_KEY || !to || to.toLowerCase().endsWith(".invalid")) return;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_ADDRESS, to: [to], subject: content.subject,
        html: renderEmailHtml(content, recipientName),
        text: renderEmail(content, recipientName),
      }),
    });
    if (!res.ok) console.error(`email failed (${to}): ${res.status} ${await res.text()}`);
  } catch (e) {
    console.error(`email failed (${to}):`, e);
  }
}

async function process(
  kind: "due_reminder" | "overdue",
  markerColumn: "due_reminder_sent_at" | "overdue_notified_at",
  candidates: LoanRow[],
  finePerDay: number,
): Promise<number> {
  let sent = 0;
  for (const loan of candidates) {
    // Claim first; zero rows back means another run already handled it.
    const { data: claimed, error } = await admin
      .from("loans")
      .update({ [markerColumn]: new Date().toISOString() })
      .eq("id", loan.id)
      .is(markerColumn, null)
      .select("id");
    if (error || !claimed || claimed.length === 0) continue;

    const title = loan.book_copies?.books?.title ?? "your book";
    const label = dueLabel(loan.due_date);
    const [notifTitle, message] = kind === "due_reminder"
      ? ["Book due soon", `"${title}" is due back on ${label}.`]
      : ["Book overdue", `"${title}" was due on ${label}. Please return it to the LRC as soon as possible.`];

    const { error: insertError } = await admin.from("notifications").insert({
      user_id: loan.student_id, type: kind, title: notifTitle, message, link: LOAN_LINK,
    });
    if (insertError) {
      // Release the claim so tomorrow's run retries instead of silently dropping it.
      await admin.from("loans").update({ [markerColumn]: null }).eq("id", loan.id);
      console.error(`notification insert failed (loan ${loan.id}): ${insertError.message}`);
      continue;
    }
    const book = loan.book_copies?.books;
    const days = daysUntil(loan.due_date);
    const when = days <= 0 ? "today" : days === 1 ? "tomorrow" : `on ${longDate(loan.due_date)}`;
    const email: EmailContent = kind === "due_reminder"
      ? {
        subject: `Reminder: your borrowed book is due ${days <= 1 ? when : "soon"}`,
        intro: `This is a reminder that your borrowed book is due ${when}.`,
        details: [["Title", book?.title ?? title], ["Due date", longDate(loan.due_date)]],
        paragraphs: [
          "Please return it to the LRC counter on or before the due date to avoid an overdue fine " +
          `of ${peso(finePerDay)} per school day.`,
        ],
        linkLabel: "View your loans",
        link: LOAN_LINK,
      }
      : {
        subject: "Your borrowed book is overdue",
        intro: "Your borrowed book is now overdue.",
        details: [["Title", book?.title ?? title], ["Due date", longDate(loan.due_date)]],
        paragraphs: [
          `Please return it to the LRC counter as soon as possible. An overdue fine of ${peso(finePerDay)} ` +
          "per school day applies until the book is returned.",
        ],
        linkLabel: "View your loans",
        link: LOAN_LINK,
      };
    await sendEmail(loan.profiles?.email, email, loan.profiles?.full_name);
    sent++;
  }
  return sent;
}

// Not one-time like `process` above — cooldownIso re-arms the claim once
// enough time has passed, since a fine can stay unsettled indefinitely
// and a single lifetime reminder wouldn't be much of a nudge.
async function processFineReminders(candidates: FineRow[], cooldownIso: string): Promise<number> {
  let sent = 0;
  for (const loan of candidates) {
    const { data: claimed, error } = await admin
      .from("loans")
      .update({ fine_reminder_last_sent_at: new Date().toISOString() })
      .eq("id", loan.id)
      .or(`fine_reminder_last_sent_at.is.null,fine_reminder_last_sent_at.lt.${cooldownIso}`)
      .select("id");
    if (error || !claimed || claimed.length === 0) continue;

    const title = loan.book_copies?.books?.title ?? "a book";
    const amount = (loan.fine_amount ?? 0).toFixed(2);
    const notifTitle = "Unpaid fine reminder";
    const message = `You still have an unpaid fine of ₱${amount} for "${title}". Please settle it at the LRC circulation desk.`;

    const { error: insertError } = await admin.from("notifications").insert({
      user_id: loan.student_id, type: "fine_reminder", title: notifTitle, message, link: FINE_LINK,
    });
    if (insertError) {
      // Release the claim so tomorrow's run retries instead of silently dropping it.
      await admin.from("loans").update({ fine_reminder_last_sent_at: null }).eq("id", loan.id);
      console.error(`fine reminder insert failed (loan ${loan.id}): ${insertError.message}`);
      continue;
    }
    const book = loan.book_copies?.books;
    await sendEmail(loan.profiles?.email, {
      subject: "Reminder: you have an unpaid fine",
      intro: "This is a reminder that you have an unpaid fine at the LRC.",
      details: [["Title", book?.title ?? title], ["Amount due", peso(loan.fine_amount ?? 0)]],
      paragraphs: [
        "Please settle it in person at the LRC counter. Unpaid fines may keep you from borrowing " +
        "or reserving books until they are paid.",
      ],
      linkLabel: "View your fines",
      link: FINE_LINK,
    }, loan.profiles?.full_name);
    sent++;
  }
  return sent;
}

Deno.serve(async () => {
  const now = new Date();
  const horizon = new Date(now.getTime() + DUE_REMINDER_DAYS * 86_400_000);
  const fineCooldownCutoff = new Date(now.getTime() - FINE_REMINDER_COOLDOWN_DAYS * 86_400_000);

  const { data: dueSoon, error: dueErr } = await admin
    .from("loans").select(SELECT)
    .is("returned_at", null).is("due_reminder_sent_at", null)
    .gte("due_date", now.toISOString()).lte("due_date", horizon.toISOString());

  const { data: overdue, error: overdueErr } = await admin
    .from("loans").select(SELECT)
    .is("returned_at", null).is("overdue_notified_at", null)
    .lt("due_date", now.toISOString());

  const { data: unpaidFines, error: fineErr } = await admin
    .from("loans").select(FINE_SELECT)
    .eq("fine_status", "unsettled").gt("fine_amount", 0)
    .or(`fine_reminder_last_sent_at.is.null,fine_reminder_last_sent_at.lt.${fineCooldownCutoff.toISOString()}`);

  if (dueErr || overdueErr || fineErr) {
    return Response.json({ ok: false, error: (dueErr ?? overdueErr ?? fineErr)!.message }, { status: 500 });
  }

  // The library's own fine rate for the email text; falls back to the same
  // default apps/api/core/settings.py uses.
  const { data: settings } = await admin.from("library_settings").select("fine_per_day").eq("id", 1).maybeSingle();
  const finePerDay = Number(settings?.fine_per_day ?? 5);

  const dueReminders = await process("due_reminder", "due_reminder_sent_at", (dueSoon ?? []) as unknown as LoanRow[], finePerDay);
  const overdueNotices = await process("overdue", "overdue_notified_at", (overdue ?? []) as unknown as LoanRow[], finePerDay);
  const fineReminders = await processFineReminders(
    (unpaidFines ?? []) as unknown as FineRow[],
    fineCooldownCutoff.toISOString(),
  );
  return Response.json({ ok: true, dueReminders, overdueNotices, fineReminders });
});
