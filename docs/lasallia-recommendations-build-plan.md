# Lasallia — Book Recommendations: Phased Build Plan

**Audience:** Claude Code
**Stack:** Next.js (frontend) + FastAPI (backend) + Supabase/Postgres + scikit-learn
**Surface:** Student dashboard only ("For You"). Not on book detail, not in chatbot, not in catalog — for now.
**How to use this doc:** Build **one phase at a time**. Do not start a later phase until the current phase's acceptance criteria all pass. Each phase is independently demoable.

---

## 0. Scope and principles

### The one-sentence defense

> Lasallia recommends books by matching the **content** of what a student has borrowed against the content of the catalog. Borrowing patterns across students are used only to **re-rank** those content matches, never to generate them.

This keeps the system honest to the thesis title. Content-based is the recommender. Collaborative is a boost.

### Hard rules

| # | Rule | Why |
|---|---|---|
| 1 | **Every recommendation carries a human-readable reason.** `"Because you borrowed Clean Code"` | Explainability is your differentiator vs. a black box. Also makes debugging trivial. |
| 2 | **Recommendations are precomputed, not live.** | A dashboard that waits 3s on a cosine similarity computation is a broken dashboard. |
| 3 | **Never recommend a book the student has already borrowed or currently holds.** | Obvious, but it is the #1 embarrassing demo bug. |
| 4 | **Co-borrow signals must be aggregated across ≥3 distinct students** before use. | Otherwise a student could infer what one specific classmate borrowed. This is a real privacy issue in a small library. |
| 5 | **Availability affects rank, not eligibility.** | Recommending an on-loan book is fine — it can be reserved. Just rank available copies higher. |
| 6 | **The system must degrade, never blank.** | A student with zero borrow history still sees something. See Phase 7. |

### What this system does NOT do

- No user-user collaborative filtering (data is too sparse, and it leaks more).
- No deep learning / neural recommenders. Out of scope, unjustifiable for the dataset size.
- No real-time model updates. Nightly rebuild is the cadence.
- No recommendations for guests or unauthenticated kiosk sessions.

---

## Phase 1 — Data audit (do this before writing any model code)

**Goal:** Find out whether the borrowing history can actually support a hybrid system. This phase may change the plan.

### Tasks

1. Write a one-off script `apps/api/scripts/audit_borrow_data.py` that reports:
   - Total completed borrow records
   - Distinct students who have ever borrowed
   - Distinct books ever borrowed
   - Median and mean borrows **per student**
   - Median borrows **per book**
   - % of catalog that has *never* been borrowed
   - % of books with a non-empty `description`
   - % of books with a non-empty `subject` / classification field
2. Output as a markdown table into `docs/data-audit.md`. This goes in your thesis appendix.

### Decision gate

| Finding | What it means |
|---|---|
| Median borrows/student **≥ 3** | Hybrid is viable. Proceed as planned. |
| Median borrows/student **1–2** | Collaborative boost will be noise. Build Phases 2–3 only, keep Phase 4 as "future work." |
| Books with description **< 50%** | TF-IDF must lean on title + author + subject. Say so explicitly in the thesis; do not pretend descriptions are rich. |
| Never-borrowed catalog **> 80%** | Expected for a school library. Note it — it is exactly why content-based is the right primary choice. |

### Acceptance criteria

- [ ] `docs/data-audit.md` exists with all metrics filled in
- [ ] A written decision recorded: hybrid vs content-only
- [ ] No model code written yet

---

## Phase 2 — Item profiles and the similarity matrix

**Goal:** Every book has a vector. Every book knows its top N most similar books.

### Feature text

Build one text blob per book, in this order, with these weights (repeat the field to weight it):

```
title (×3) + subject/classification (×2) + author (×2) + description (×1)
```

Repeating a field in the blob is the crude-but-correct way to weight it in TF-IDF. Do not over-engineer this.

### Pipeline

1. `TfidfVectorizer` with `ngram_range=(1,2)`, `min_df=2`, `max_features=20000`, English stopwords.
   - **Note:** stopwords are English-only. Filipino/Taglish titles will keep their function words. Acknowledge this limitation rather than hacking around it.
2. `cosine_similarity` over the item matrix.
3. For each book, keep the **top 30 neighbors** with score > 0.05. Discard the rest — storing a full N×N matrix is wasteful and pointless.

### Storage

```sql
create table book_similarities (
  book_id uuid references books(id) on delete cascade,
  neighbor_book_id uuid references books(id) on delete cascade,
  score real not null,
  rank smallint not null,
  computed_at timestamptz not null default now(),
  primary key (book_id, neighbor_book_id)
);
create index on book_similarities (book_id, rank);
```

### Rebuild job

- `apps/api/jobs/rebuild_similarities.py`
- Full rebuild, truncate-and-insert inside a transaction. No incremental logic — the catalog is small enough.
- Runtime target: **under 2 minutes**. If it exceeds this, `max_features` is too high.

### Acceptance criteria

- [ ] `book_similarities` populated for every book that has usable text
- [ ] Manual spot-check: pick 5 books you personally know, print their top 5 neighbors, confirm they are sensible
- [ ] Books with no usable text are logged to a list, not silently skipped
- [ ] Rebuild is idempotent — running twice produces the same result

---

## Phase 3 — Content-based recommendations (the core deliverable)

**Goal:** A student with borrow history gets a ranked, explained list. This phase alone is a demoable, defensible thesis feature.

### Student profile

Do **not** average a student's borrowed books into one vector. Averaging destroys the reason string and blurs a student who reads both poetry and networking into recommending neither.

Instead: **score by neighbor aggregation.**

For each book `b` the student has borrowed, pull its neighbors from `book_similarities`. A candidate book's score is the sum of its similarity to each source book, weighted by recency:

```
score(candidate) = Σ over source books s:  similarity(s, candidate) × weight(s)
```

### Source weighting

| Source event | Weight |
|---|---|
| Completed borrow | 1.0 |
| Currently on loan | 1.0 |
| Active reservation | 0.7 |
| Cancelled reservation | 0.0 (ignore) |

Apply recency decay on top: `× 0.5 ^ (days_since / 180)`. A book borrowed last week matters more than one from first year.

### The reason string

Track which source book contributed the most to each candidate's score. That book becomes the reason:

```json
{ "book_id": "...", "score": 0.42, "reason_book_id": "...", "reason": "Because you borrowed Clean Code" }
```

If two or more sources contributed comparably: `"Because you borrowed Clean Code and 2 others"`.

### Exclusions (apply before ranking)

- Any book the student has ever borrowed
- Any book currently on loan to that student
- Any book with an active reservation by that student
- Books flagged `is_archived` / withdrawn

### Diversity cap

Max **3 books per subject/classification** in the final list. Without this, a student who borrowed two programming books gets ten programming books and the feature looks stupid.

### Acceptance criteria

- [ ] Given a student with ≥1 borrow, returns up to 10 scored, explained recommendations
- [ ] No excluded book ever appears — write a test for this specifically
- [ ] Every result has a non-empty, correct reason string
- [ ] Subject diversity cap enforced
- [ ] Deterministic: same input data → same output order

---

## Phase 4 — Collaborative boost (re-ranking only)

**Goal:** Books frequently borrowed alongside what this student read get a lift. This does **not** introduce new candidates.

> **Gate:** Only build this if Phase 1's decision gate said hybrid is viable.

### Co-occurrence table

Two books co-occur if the same student borrowed both, ever.

```sql
create table book_cooccurrence (
  book_id uuid references books(id) on delete cascade,
  neighbor_book_id uuid references books(id) on delete cascade,
  student_count int not null,
  lift real not null,
  computed_at timestamptz not null default now(),
  primary key (book_id, neighbor_book_id)
);
```

- **Privacy rule (hard):** only insert rows where `student_count >= 3`. Rows below the threshold are dropped entirely, not stored with a flag.
- Use **lift**, not raw count, so that a book everyone borrows (a required textbook) does not become everyone's recommendation:
  ```
  lift = P(B | A) / P(B)
  ```
- Cap lift at a ceiling (e.g. 5.0) so a rare pair with 3 students cannot dominate.

### Blending

```
final_score = content_score × (1 + α × normalized_boost)
```

- `α = 0.3` to start. It is a tunable constant, put it in config, and **report the value you used in the thesis.**
- `normalized_boost` in [0, 1], derived from lift of the candidate against the student's source books.
- Multiplicative, not additive — this structurally guarantees a book with zero content similarity can never be recommended, which is the property that keeps the title honest.

### Reason string when boosted

Content reason stays primary. Optionally append: `"Because you borrowed Clean Code · popular with students who read it"`.

### Acceptance criteria

- [ ] No row in `book_cooccurrence` has `student_count < 3`
- [ ] A candidate with `content_score = 0` cannot appear regardless of boost — test this
- [ ] With `α = 0`, output is byte-identical to Phase 3 output (proves the blend is clean)
- [ ] `α` is a single config value, not scattered through the code

---

## Phase 5 — Precompute and serve

**Goal:** The dashboard reads a table. Nothing computes at request time.

### Storage

```sql
create table student_recommendations (
  student_id uuid references students(id) on delete cascade,
  book_id uuid references books(id) on delete cascade,
  rank smallint not null,
  score real not null,
  reason text not null,
  reason_book_id uuid references books(id),
  generated_at timestamptz not null default now(),
  primary key (student_id, book_id)
);
create index on student_recommendations (student_id, rank);
```

### Job

- `apps/api/jobs/rebuild_recommendations.py` — runs after `rebuild_similarities`
- Nightly. Order: similarities → co-occurrence → per-student recommendations.
- Store **top 20** per student; the dashboard shows 6–10. The surplus is your buffer for real-time exclusions.

### Endpoint

```
GET /recommendations/me?limit=8
```

- **No `student_id` parameter in the signature.** Same rule as the chatbot account tools — the ID comes from the authenticated session, server-side. Non-negotiable.
- At request time, re-apply exclusions against *live* borrow state (a student may have borrowed a recommended book since last night's job) and then trim to `limit`.
- Return `generated_at` so the frontend can show staleness if needed.
- Response includes enough book fields to render a card without a second call: title, author, cover, availability count.

### Acceptance criteria

- [ ] Endpoint responds in **< 200ms** p95
- [ ] Passing another student's ID in any form is impossible — no such parameter exists
- [ ] A book borrowed this morning does not appear in this afternoon's response, despite last night's job
- [ ] Unauthenticated / guest requests return 401, not an empty list

---

## Phase 6 — Dashboard UI

**Goal:** "For You" section on the student dashboard.

### Component

- Section header: **For You** with a one-line subtitle explaining the mechanism in plain language — *"Based on what you've borrowed."* Students trust a recommender more when it says why it exists.
- Horizontal scroll on mobile, grid on desktop.
- Reuse the existing `BookCard` from the chatbot work — same Reserve / View buttons, same `AvailabilityPill`. Do not build a second book card.
- Each card shows its reason string in small text. This is the feature, not decoration.

### States

| State | Render |
|---|---|
| Loading | Skeleton cards, same dimensions as real cards (no layout shift) |
| Has recommendations | The list |
| Cold start (no history) | Fallback set — see Phase 7, with subtitle *"Popular at the LRC"* |
| Error | Hide the section entirely. Do not show an error card on a dashboard. |

### Acceptance criteria

- [ ] Reserve and View from a recommendation card work identically to catalog cards
- [ ] No layout shift between skeleton and loaded state
- [ ] Section renders correctly at 360px width
- [ ] Reason string never overflows or truncates mid-word

---

## Phase 7 — Cold start and fallbacks

**Goal:** Nobody sees an empty dashboard. Ever.

### Ladder — first rule that produces ≥ `limit` results wins

| # | Condition | Fallback |
|---|---|---|
| 1 | Has borrow history | Normal recommendations (Phases 3–4) |
| 2 | No borrows, but has a program/course on file | Most-borrowed books **among students in the same program**, subject to the ≥3-student privacy threshold |
| 3 | No borrows, no program | Most-borrowed books library-wide, last 12 months |
| 4 | Everything above thin | Recently added books |

- The subtitle text changes per rung so the UI never claims personalization it did not do.
- Rung 2 is a legitimate content signal (program → subject area), not collaborative filtering. Frame it that way.

### Acceptance criteria

- [ ] A brand-new student account with zero history renders a full section
- [ ] Each rung has distinct, accurate subtitle copy
- [ ] Rung 2 respects the ≥3-student aggregation rule
- [ ] Test fixtures exist for a student at each rung

---

## Phase 8 — Evaluation (your thesis chapter)

**Goal:** Numbers that survive a panel question.

### Offline protocol

1. **Temporal split.** Hold out each student's most recent 20% of borrows. Train on the rest. Do **not** use a random split — random splits leak the future and inflate every metric.
2. Only evaluate students with ≥5 borrows (state the N).
3. Metrics at k = 5 and k = 10:

| Metric | What it tells the panel |
|---|---|
| **Hit rate @ k** | Did we surface at least one book they actually borrowed |
| **Precision @ k** | How much of the list was useful |
| **Catalog coverage** | % of catalog ever recommended to anyone — guards against recommending the same 50 books forever |
| **Intra-list diversity** | Average pairwise dissimilarity within a list — proves the diversity cap works |

### Arms to compare

| Arm | Purpose |
|---|---|
| Random | Floor |
| Most-popular | The baseline that is embarrassingly hard to beat — include it honestly |
| Content-only (TF-IDF) | Your primary system |
| Hybrid (α = 0.3) | Your full system |
| *Optional:* Content-only (embeddings) | Reuse the chatbot's embedding pipeline — TF-IDF vs embeddings on the same task is a genuine, publishable comparison |

### Reporting

- One table, all arms, all metrics.
- **Report the α sweep** (0.0, 0.1, 0.3, 0.5) — showing you tuned it rather than guessed is worth more than the score itself.
- If most-popular beats you on hit rate, report it and explain: popularity wins on hit rate and loses badly on coverage and diversity. That is a stronger answer than a suspiciously good number.

### Acceptance criteria

- [ ] `apps/api/eval/run_recsys_eval.py` reproduces the full table from scratch
- [ ] Results written to `docs/recsys-evaluation.md`
- [ ] Temporal split, not random — verified in code review
- [ ] N reported for every metric

---

## Phase 9 — Logging and hardening

**Goal:** Know whether anyone actually uses it.

### Event log

```sql
create table recommendation_events (
  id bigserial primary key,
  student_id uuid not null,
  book_id uuid not null,
  event_type text not null check (event_type in ('impression','click','reserve','dismiss')),
  rank smallint,
  occurred_at timestamptz not null default now()
);
```

- Batch impressions — one insert per section render, not one per card.
- Click-through rate on the For You section is a real number for your defense.

### Hardening

- [ ] Job failure alerts — a silently failed nightly job means stale recommendations for weeks
- [ ] If `generated_at` is older than 7 days, fall back to Phase 7 rung 3 rather than serving stale personalization
- [ ] `dismiss` ("not interested") suppresses that book for 90 days — only build this if time allows, it is genuinely optional
- [ ] Rate limit the endpoint per session

---

## Build order summary

| Phase | Deliverable | Blocking? |
|---|---|---|
| 1 | Data audit + go/no-go on hybrid | **Yes — blocks everything** |
| 2 | TF-IDF + `book_similarities` | Yes |
| 3 | Content-based recs + reasons | Yes — **minimum viable thesis feature** |
| 4 | Co-occurrence boost | No — skippable if data is sparse |
| 5 | Precompute + `/recommendations/me` | Yes |
| 6 | Dashboard "For You" | Yes |
| 7 | Cold start ladder | Yes |
| 8 | Evaluation | Yes — this is the thesis chapter |
| 9 | Event logging + hardening | No — nice to have |

**If you run out of time:** Phases 1, 2, 3, 5, 6, 7, 8 constitute a complete, defensible content-based recommender. Phase 4 is the part you drop, and dropping it makes the thesis title *more* accurate, not less.
