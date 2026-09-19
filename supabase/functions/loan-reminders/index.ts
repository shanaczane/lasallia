// Daily job: writes a `due_reminder` notification for loans due within
// DUE_REMINDER_DAYS, and an `overdue` notification for loans past due, then
// emails the same text (mirrors apps/api/core/notify.py, which can't be
// called from Deno).
//
// Idempotent: each loan is "claimed" by setting due_reminder_sent_at /
// overdue_notified_at from NULL (migration 0032) BEFORE the notification is
// written. Only the run whose UPDATE actually changed the row proceeds, so
// re-runs and overlapping runs never duplicate.
//
// loans.status stays 'active' in the DB even when past due (routers/loans.py
// derives 'overdue' in memory), so "overdue" here means returned_at is null
// and due_date < now.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FRONTEND_URL = Deno.env.get("FRONTEND_URL") ?? "http://localhost:3000";
const DUE_REMINDER_DAYS = Number(Deno.env.get("DUE_REMINDER_DAYS") ?? "1");
const FROM_ADDRESS = "Lasallia <notifications@lasallia.com>";
const LINK = "/student/library";

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

type LoanRow = {
  id: string;
  student_id: string;
  due_date: string;
  book_copies: { books: { title: string } | null } | null;
  profiles: { email: string | null } | null;
};

const SELECT = "id, student_id, due_date, book_copies(books(title)), profiles:student_id(email)";

function dueLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long", day: "2-digit", year: "numeric", timeZone: "Asia/Manila",
  });
}

async function sendEmail(to: string | null | undefined, subject: string, body: string) {
  if (!RESEND_API_KEY || !to) return;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_ADDRESS, to: [to], subject,
        text: `${body}\n\nView details: ${FRONTEND_URL}${LINK}`,
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
      user_id: loan.student_id, type: kind, title: notifTitle, message, link: LINK,
    });
    if (insertError) {
      // Release the claim so tomorrow's run retries instead of silently dropping it.
      await admin.from("loans").update({ [markerColumn]: null }).eq("id", loan.id);
      console.error(`notification insert failed (loan ${loan.id}): ${insertError.message}`);
      continue;
    }
    await sendEmail(loan.profiles?.email, notifTitle, message);
    sent++;
  }
  return sent;
}

Deno.serve(async () => {
  const now = new Date();
  const horizon = new Date(now.getTime() + DUE_REMINDER_DAYS * 86_400_000);

  const { data: dueSoon, error: dueErr } = await admin
    .from("loans").select(SELECT)
    .is("returned_at", null).is("due_reminder_sent_at", null)
    .gte("due_date", now.toISOString()).lte("due_date", horizon.toISOString());

  const { data: overdue, error: overdueErr } = await admin
    .from("loans").select(SELECT)
    .is("returned_at", null).is("overdue_notified_at", null)
    .lt("due_date", now.toISOString());

  if (dueErr || overdueErr) {
    return Response.json({ ok: false, error: (dueErr ?? overdueErr)!.message }, { status: 500 });
  }

  const dueReminders = await process("due_reminder", "due_reminder_sent_at", (dueSoon ?? []) as unknown as LoanRow[]);
  const overdueNotices = await process("overdue", "overdue_notified_at", (overdue ?? []) as unknown as LoanRow[]);
  return Response.json({ ok: true, dueReminders, overdueNotices });
});
