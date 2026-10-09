# Panel Feedback & Catalog Import (Destiny Integration)

Summary of the discussion on how to respond to the panel's recommendations, focusing on integration with Follett Destiny, and the Catalog Import feature built in response.

Branch: `feat/destiny-import` (not committed yet)

---

## 1. The panel's feedback

> The system may help facilitate information retrieval, provide timely responses to library-related inquiries, and improve access to library resources. To further enhance its effectiveness, it is recommended to ensure the accuracy and reliability of AI-generated responses, improve user-friendliness and accessibility, strengthen data privacy and security, explore possible integration with existing library systems and databases, and incorporate an inventory management feature to support book inventory, barcode scanning, and the monitoring of available, missing, and misplaced library materials. Overall, the project shows promise in supporting the digital transformation of library services, and further refinement and testing in consultation with library personnel are encouraged to ensure that it meets the actual needs of the academic community.

## 2. How to fix and improve each point

### 2.1 Accuracy and reliability of AI responses
**Already there:** the chatbot answers from real catalog and handbook data through tools, and has rules against making things up (`apps/api/routers/chat.py`). There's an evals folder (`apps/api/evals/`).

- **Show sources:** in each answer, show which book record or handbook section it came from.
- **Build a test set:** 50–100 real library questions with correct answers, ideally written with the librarians. Report accuracy, how often the bot invents an answer, and how often it correctly refuses. These numbers go into the Results chapter.
- **Handle what it can't answer:** when unsure or out of scope, say so and hand off to a librarian (support tickets already exist).
- **Collect feedback:** 👍/👎 on answers, logged.
- **Keep records:** log the question, tools used, and answer so mistakes can be reviewed.

### 2.2 User-friendliness and accessibility
- **Usability test:** run a System Usability Scale (SUS) test with students, guests and librarians; report scores and fix the top complaints.
- **WCAG 2.1 AA check:** color contrast (especially gold on paper), keyboard navigation, focus states, screen-reader labels on icon-only buttons, alt text on covers.
- **Small screens:** test student and guest views on phones.
- **Plainer wording:** clear empty states, error messages, suggested questions in the chat.
- **Optional:** support Filipino in the chatbot.

### 2.3 Data privacy and security
- **Data Privacy Act of 2012 (RA 10173):** privacy notice and consent screen. State what data is collected (including chat logs and borrowing history), why, and how long it's kept.
- **Database access rules:** make sure Supabase Row-Level Security stops a student from reading another student's records. Test it on purpose.
- **Limit what goes to OpenAI:** send only the personal data a question needs. State in the paper that OpenAI is a third-party processor.
- **Basic protections:** rate limits on login and chat, audit logs for librarian actions, session/token expiry.
- **Run a security review** and record the results in the paper.

### 2.4 Integration with existing library systems
See sections 3–7 below.

### 2.5 Inventory management (the biggest new feature)
**Already there:** copy statuses (missing, lost, damaged), accession barcodes, the Quick Scan card, and the report-missing flow.

**Still missing:** a dedicated inventory check (stocktake) workflow.
- **Inventory sessions:** a librarian starts a session for a floor or shelf range, scans barcodes, and the system compares scanned vs. expected:
  - **Found:** scanned where it belongs.
  - **Misplaced:** scanned, but its call number belongs on a different shelf.
  - **Missing:** expected on that shelf but not scanned.
- **Scanning:** USB barcode scanners (they type like a keyboard) and phone-camera scanning.
- **Reports:** missing/misplaced list per session, CSV/PDF export, one-click "mark found" / "mark missing".
- **Dashboard:** available, borrowed, missing and misplaced counts, plus trends.

### 2.6 Overall
- **Pilot test** with DLSL library staff and record their feedback. This covers "consultation with library personnel."
- **Update the paper:** expand Scope & Limitations and Recommendations to show what was addressed and what is future work.

### 2.7 Suggested priority
1. Inventory module (specific feature request, biggest gap)
2. AI accuracy evaluation (their first point; builds on `apps/api/evals/`)
3. Privacy/security and usability testing (mostly documentation and testing)
4. Catalog import (done, see section 7)
5. Integration design write-up in the paper (do this regardless; no code)

---

## 3. Integrating with Follett Destiny: the options

DLSL's current library system is **Follett Destiny**. Lasallia would be a **companion** to it, not a replacement.

Ways data could move from Destiny to Lasallia, easiest first:

| Method | What it is | Notes |
|---|---|---|
| **Batch export/import** | Destiny exports the catalog as **MARC 21**, the standard library record format; Lasallia reads and imports it | Most realistic. Built (see section 7). |
| **Deep links** | "Borrow / reserve in Destiny" buttons that open the book in Destiny Discover | Easy; Lasallia never writes into Destiny |
| **SIP2** | Protocol self-checkout kiosks use for live status, checkout and check-in | May need a license or add-on DLSL has to enable |
| **Follett API** | Official API | Mostly for official partners; don't plan on it |

Direct database access is probably not possible, since Destiny is often hosted by Follett.

**About inventory:** Destiny has its own inventory module, so the panel may ask why Lasallia needs one. Possible answers: phone-camera scanning by shelf range, misplaced detection by call number, and results that can be applied in Destiny. Ask the librarians how they do inventory now and what frustrates them.

**Questions to ask DLSL's librarian/IT:**
1. Is Destiny hosted by Follett or on DLSL's own server? Which version?
2. Can they give a sample MARC export (with copy barcodes) and a patron export?
3. Is SIP2 enabled? Do they use self-checkout kiosks?
4. Would they allow scheduled exports for syncing?
5. How do they do inventory now?
6. Does any account (IT, head librarian, admin) have an **Export** or **Reports** option in Destiny?

## 4. Full companion mode vs. import path: the decision

**Full companion mode** (considered, then rejected) would have made Destiny the system of record: borrowing, fines and renewals hidden in Lasallia, catalog read-only, a mode toggle, staleness labels and deep links.

Why it was rejected:
- It hides Lasallia's strongest work (kiosk holds, RFID, loans, returns, fines, reshelving).
- Two modes means twice the testing and inconsistent screens.
- Confusing for users and the panel ("Where do I borrow?", "Which catalog is correct?").
- Synced data can be out of date, which cuts against the panel's AI-accuracy point.
- Without DLSL's data and approval, it's simulated either way.

**Chosen instead: an import path.** Lasallia keeps working exactly as it does. A new page lets the library bring catalog data in, one way, with a preview. It answers "explore possible integration" without changing how the system works.

## 5. If the library can't provide data

The panel said **"explore possible integration,"** not "finish it." Options:

- **A (chosen):** build it "integration-ready" and validate it with stand-in data in the same standard format. Keep Lasallia's own borrowing working.
- **B:** design only. Write an integration design section in the paper with no new code.
- **C:** ask for less: 10–50 records, a screenshot of Destiny's export settings, anonymized loan history, or a 15-minute librarian interview.

**Don't:**
- Scrape Destiny's web interface or use a librarian's login without formal permission (school policy, RA 10173).
- Claim Lasallia "integrates with Destiny" if only tested on sample data. Say "designed for" or "integration-ready."

## 6. The real gap discovered

The librarians **cannot export from Destiny**. The LRC Excel files in `apps/api/data/` were typed by hand, not exported. Current data flow:

```
Destiny (has the real catalog)  ✗ no export  →  librarian re-types into Excel  →  Lasallia
```

This means:
1. Destiny export is probably possible but not available to their accounts (permissions, IT/Follett admin control).
2. Until that's solved, the real gap is **manual encoding**, not integration.
3. The MARC importer is "ready for when export is available." It can't be the main data path today.

So the Catalog Import page also accepts the **librarians' own Excel sheets**, with validation.

---

## 7. What was built: Catalog Import

### 7.1 What it does
A librarian opens **Catalog Import** in the sidebar, uploads a file, sees a **preview** of what would change, then clicks **Confirm import**.

It accepts:
- **The LRC Excel sheet (.xlsx):** same layout as the existing per-college files. One sheet per program, one row per copy. A row with only an accession number filled in is treated as another copy of the book above it (the LRC's convention).
- **A Destiny MARC 21 export (.mrc):** for when export access exists.

It reports:
- **Errors (row skipped):** no accession number, accession number used twice, no title. Shown with sheet and row, e.g. "Sheet BSIT, row 12".
- **Possible typos (still imported):** a year that isn't a year, an ISBN that isn't 10 or 13 digits, missing call number, missing author.

There's also an **Excel template** download button and an **import history** table.

### 7.2 Safety rules
- **Matching order:** copy accession number → ISBN → title + author. This prevents duplicate books.
- **Never changes a copy's status** (on loan, reserved, etc.), so kiosk, loans and holds are unaffected.
- **Never deletes.** Copies missing from the file are only listed.
- **Never erases data.** Blank fields in the file don't overwrite existing values.
- **Never touches Lasallia-only fields:** covers, category, college, collection type, archive state.
- **Bad rows are skipped**; the rest still import. Re-importing the same file changes nothing.
- **Preview first:** nothing changes until the librarian confirms.
- After an import, changed books are re-embedded in the background so the chatbot can find them.

### 7.3 Results on the real LRC data (dry run, nothing saved)

| Finding | Count |
|---|---|
| Copies missing from Lasallia: extra-copy rows `seed_books.py` skipped (CBEAM 47, CITE 2) | **49** |
| Books missing their publication year (years typed as text; the seed script skipped them) | **53** |
| Rows with no accession number (CITE Architecture row 7, CEAS Lasalliana row 2) | 2 |
| ISBN typo (`78-6-210-42480-5`, missing its leading 9) | 1 |
| Book with no author (CBEAM Agribusiness row 2) | 1 |

All 195 sample MARC titles matched existing books by accession number, with no duplicates. Importing the current CBEAM and CITE sheets would fix live data.

### 7.4 Files

**Changed (existing files, small additions only):**

| File | Change |
|---|---|
| `apps/api/main.py` | Registers the `/sync` router (2 lines) |
| `apps/api/requirements.txt` | Adds `pymarc==5.4.0` |
| `apps/web/components/layout/LibrarianLayout.tsx` | Adds the "Catalog Import" sidebar item |

**New:**

| File | Purpose |
|---|---|
| `apps/api/migrations/0043_catalog_sync.sql` | `sync_runs` table + `books.last_synced_at` (undo SQL in its header) |
| `apps/api/core/importers/marc.py` | MARC parsing, matching/preview plan, applying the plan |
| `apps/api/core/importers/spreadsheet.py` | Excel parsing, row checks, template builder |
| `apps/api/schemas/sync.py` | Response models |
| `apps/api/routers/sync.py` | `POST /sync/catalog?dry_run=&college=`, `GET /sync/runs`, `GET /sync/template` (librarian-only) |
| `apps/api/scripts/make_sample_destiny_export.py` | Builds sample `.mrc` files from the LRC Excel data |
| `apps/api/data/sample_destiny/` | `catalog.mrc`, `catalog_changed.mrc`, `CHANGES.txt` |
| `apps/api/tests/test_marc_import.py`, `test_spreadsheet_import.py` | Importer tests |
| `apps/web/app/librarian/sync/page.tsx` | The Catalog Import page |
| `apps/web/lib/sync.ts` | API calls |

**Verified:** 64 API tests pass (39 existing + 25 new); TypeScript and ESLint clean; dry run through the real API endpoints works. Not yet viewed in a browser.

### 7.5 Effect on the rest of Lasallia
- **Code:** only adds the new tab. Borrowing, kiosk, holds, chatbot, search, recommendations, reports and catalog pages are untouched.
- **Data:** confirming an import changes the catalog data the other features read (that's the purpose). Previewing never changes anything.
- **Migration:** only adds a new table and a column; existing tables work the same.

---

## 8. How to use it

1. Run `apps/api/migrations/0043_catalog_sync.sql` in the Supabase SQL editor. Previews work without it; confirming needs it.
2. In `apps/api` (venv active): `pip install -r requirements.txt`
3. Run `pnpm dev:api` and `pnpm dev:web`.
4. Open **Catalog Import**, upload a file (e.g. `apps/api/data/CBEAM.xlsx`), check the preview.
5. Confirm only when you're ready for the real catalog to change.

**Warning:** `catalog_changed.mrc` adds two fake "Sample Destiny title" books and edits one real title. Use it on a test database, or only preview it. `catalog.mrc` is safe to confirm (it only fills in missing years).

### Defense demo
1. Upload `catalog.mrc` → everything matches, no duplicates.
2. Preview `catalog_changed.mrc` → shows the edited title, new copy, 2 new books and the broken record being skipped.
3. Upload an LRC Excel sheet → shows missing copies, missing years and typo warnings by sheet and row.
4. After confirming, ask the chatbot about an updated book.

## 9. Deployment notes

- The import feature uses the **`pymarc`** library. Because `main.py` loads the new router, **the whole API won't start if `pymarc` isn't installed** (`ModuleNotFoundError: No module named 'pymarc'`).
- **Hosted API** (Render, Railway, etc.): the build step runs `pip install -r requirements.txt` on every deploy, automatically. Check the API's `/health` URL after deploying.
- **Groupmates' computers:** run `pip install -r requirements.txt` once after pulling, because `requirements.txt` changed.
- **Manually set-up servers (e.g. a VPS):** run the install command yourself.
- The Vercel website (`apps/web`) is not affected.

## 10. To remove it

```bash
git checkout -- apps/api/main.py apps/api/requirements.txt apps/web/components/layout/LibrarianLayout.tsx
git clean -fd apps/api/core/importers apps/api/data/sample_destiny apps/api/routers/sync.py apps/api/schemas/sync.py apps/api/scripts/make_sample_destiny_export.py apps/api/tests/test_marc_import.py apps/api/tests/test_spreadsheet_import.py apps/api/migrations/0043_catalog_sync.sql apps/web/app/librarian/sync apps/web/lib/sync.ts
git checkout khat && git branch -D feat/destiny-import
```

If the migration was already run, also run:
```sql
drop table if exists sync_runs;
alter table books drop column if exists last_synced_at;
```

---

## 11. Wording for the paper

**Problem found:**
> Catalog data at DLSL must be manually re-encoded into spreadsheets because librarians do not have export access from Follett Destiny.

**Response:**
> Lasallia provides a catalog import module that accepts the library's existing spreadsheet format with row-level validation, and standard MARC 21 exports from Follett Destiny. Imports are previewed before being applied, never delete records, and never alter circulation status. The module was validated using the LRC's catalog spreadsheets and sample MARC 21 data, and identified 49 physical copies and 53 publication years missing from the previously seeded catalog.

**Scope:**
> Lasallia complements Follett Destiny. Integration is one-way (Destiny → Lasallia) through file import.

**Limitations / future work:**
> Connection to DLSL's live Destiny instance requires the library's export access and approval. Real-time integration through SIP2 or the Follett API is recommended as future work.

**Recommendation to the library:**
> Request export permissions from the Destiny administrator so catalog data no longer has to be re-typed.

**Diagram to include:**
```
Follett Destiny ──(MARC 21 export)──┐
                                    ├─► Lasallia Catalog Import ─► Supabase ─► Chatbot / Search / Recommendations / Kiosk
LRC Excel sheets ───────────────────┘        (preview → confirm)
```
