# Visit prep — clinical PDF redesign (fully fleshed)

> Replaces the current `window.print()` of the in-app card stack with a real clinical handoff document. **This is a document-design problem, not a screen-design problem.** Don't anchor on the existing in-app visit detail page — that's a viewing surface, not a printable artifact.

## Why this exists

The current `/visits/[id]` "handoff" prints the in-app card layout: cream background, 28px radii, mobile-column max-w-md, no page breaks, no chart sizes appropriate to paper, no header/footer with patient identifiers, no print-safe colors. It's an app screen forced through a browser print dialog.

A cardiologist gets ~14 minutes per visit. The artifact a caregiver hands over (or uploads to MyChart) needs to be:
- Scannable in the first 60 seconds without scrolling.
- Print-safe (no oklch colors that drop in CMYK; no thin sage that disappears under photocopy contrast loss).
- Self-contained (patient identifiers in the header so a stack of these don't get mixed up).
- Charts sized for paper, not for a phone column.

## The output target

**Format:** PDF, generated server-side, downloadable from the existing visit detail page.
**Page size:** US Letter (8.5×11 in), 0.5in margins on all sides — fits standard cardiology office printers and US clinical-record formats.
**Length:** 1–2 pages typical, hard cap at 3. The discipline is "what would actually get read in 60 seconds at the start of a 14-minute visit."
**Filename:** `heartnote-{patient-first-name}-{visit-date}.pdf` (e.g., `heartnote-mom-2026-05-14.pdf`). All-lowercase, kebab-case, ISO date.
**Generation:** server-side React-PDF (`@react-pdf/renderer`). Generated lazily on download click, not pre-generated and stored. No PDF persistence — the underlying data is canonical, the PDF is a render of it.

## Page layout — fixed

### Header (every page, top 0.5–1.0in band)

- **Left:** "HeartNote" wordmark in Fraunces 14pt, black ink. No heart icon (saves color budget).
- **Center:** patient identification block — `{patient_first_name} {last_initial}.` line 1 (Inter 11pt bold), `Born {dob} · {age} years` line 2 (Inter 9pt), `Caregiver: {caregiver_first_name}` line 3 (Inter 9pt). The patient_last_initial is the first letter of `patient.display_name`'s second word (or empty if single word). DOB lives in `patients.dob` — we currently don't store this and need to add it; see Schema additions below.
- **Right:** generation timestamp — `Generated {YYYY-MM-DD} {HH:MM} {tz_abbrev}` in Inter 8pt muted gray. Not the visit date — that's in the page body.

### Footer (every page, bottom 0.5in)

- **Left:** "Page {n} of {total}". Inter 8pt muted.
- **Center:** "Not a medical record. Decision support only. Confirm thresholds with the prescribing cardiologist." Inter 7pt muted, italic.
- **Right:** patient first name + visit date as a runner — survives page reordering if the doc gets shuffled with others.

### Body — Section 1 (page 1, top half)

#### Visit context band (centered, 0.4in tall)

- "Cardiology visit · {pretty_date}" in Fraunces 18pt — the dominant title on page 1.
- Line below: "Visit kind: {routine | follow-up | new symptoms} · Cardiologist: {cardiologist_name | not on file}". Inter 10pt.

#### "What changed since last visit" callout (gold-tinted box, 1.5in tall)

This is the 60-second-scan beat. Surfaces the 3 most prognostically-significant deltas since the most recent prior `cardiology_visits` row (or since 30 days ago if none).

- Eyebrow: "WHAT CHANGED" — Inter 9pt 0.06em uppercase bold.
- Each delta line: `▲` or `▼` glyph + value + unit + window. E.g., `▲ 2.4 lb in 7 days · past AHA threshold`. Inter 11pt, black. Lines are **derived from the alert engine's triggers in the window** — never re-implement the threshold logic.
- If no deltas in the window: single line "No threshold-crossing changes since the last visit." Inter 11pt muted.
- Box treatment: 1pt solid black border, white background. NO sage/coral fills — print-safe.

### Body — Section 2 (page 1, middle)

#### Weight chart (full-width, 3in tall)

This is the chart that earns its space.

- X-axis: 30 days back from visit date, daily ticks every 5 days, labels at -30d, -25d, -20d, -15d, -10d, -5d, today. Date format: "Apr 14".
- Y-axis: weight in pounds, gridlines every 2 lb, range = `[min(series) - 2, max(series) + 2]`. Tabular-nums labels.
- Series: thick black line (1.5pt), open dots at each measurement (filled black for the most recent reading). Dashed horizontal line at `dry_weight_lb` labeled "Dry weight ({val} lb)" at the right end.
- Threshold band: 2lb-thick gray-tinted band starting at `dry_weight_lb + 3`, labeled "AHA threshold (3 lb / 24 hr or 5 lb / 7 d)" at the right edge.
- If `weight_series.length < 2`: render a placeholder box "Not enough weight readings in the window" instead of an empty chart.
- Citation block under the chart: "Threshold per AHA Heart Failure Guidelines · cited research/chf-source-of-truth.md".

### Body — Section 3 (page 1 bottom OR page 2 top)

#### Symptom timeline (full-width, 2in tall)

A 30-day daily-cell strip showing presence/absence of the four cardinal symptoms (dyspnea, swelling, pillows-above-baseline, cough). One row per symptom, day cells colored by event.

- 30 columns × 4 rows of cells.
- Cell at (day, symptom) = filled black square if the symptom was reported present that day, half-tone gray if reported absent, blank if no log.
- Row labels (left): "Shortness of breath", "Swelling", "Sleep (pillows)", "Cough".
- Column labels (top): every 5 days, e.g., "Apr 14", "Apr 19", "Apr 24", "Apr 29", "May 4", "May 9", "today (May 14)".
- Caption below: "Days when {patient first name} reported each symptom. Empty cells = no log that day."

This is the cough heatmap pattern but extended to all four symptoms and printed black-only. Reuse the existing cough-buckets logic but extend the query.

### Body — Section 4 (page 2)

#### Active medications table

Two-column table:
- Drug + dose
- Schedule

Sorted by `drug_class` ascending (loop_diuretic first, per `MED_CLASS_LABEL`). Section header eyebrow "ACTIVE MEDICATIONS" in 9pt uppercase. Inter 10pt body.

If no active meds: single line "No medications on file." italic muted.

#### Adherence summary (under the meds table, ~1in tall)

For each scheduled (non-PRN) med, a small horizontal calendar strip showing dose adherence over the last 14 days:
- Cells per day: filled black if all doses taken, half-filled if partial, X-marked if any refused, empty if no log.
- Right-aligned summary "{taken_count}/{expected_count} doses (last 14 days)".

Uses `medication_adherence_for_day` data — same RPC as the dashboard. Aggregated over 14 days.

### Body — Section 5 (page 2)

#### Questions to ask (numbered list)

The caregiver-edited list from `cardiology_visits.questions_to_ask`. Numbered 1, 2, 3... in Fraunces 11pt, 0.3in line height. Up to 8 questions; if more, "Continued on page 3" footer note triggered automatically by the PDF renderer.

If the list is empty: "No questions written yet." italic muted line.

### Body — Section 6 (page 2 footer or page 3)

#### Notes from after the visit

If `notes_after` is non-null at PDF generation time, render under "Notes — {visit date}" header. If null, this section is omitted entirely (don't render an empty stub).

## Visualization specs

The charts are drawn with `@react-pdf/renderer` `<View>` + `<Svg>` primitives. **Print-safe colors only**: black `#000000`, white `#ffffff`, three grays `#404040 / #808080 / #c0c0c0`. NO oklch values. NO sage. Color drift between screen and printed page would mislead a cardiologist.

The dashboard's `MiniTrendSpark` and `CoughHeatmap` components are screen-only. Don't try to reuse them in the PDF — they're tied to oklch colors and viewport-fit sizing. Build new PDF-specific chart components in `src/lib/visits/pdf-charts/`.

### Files to CREATE (PDF feature)

- `src/lib/visits/pdf/index.ts` — `renderVisitHandoffPDF(supabase, visitId): Promise<Buffer>`. Top-level entry. Loads visit + patient + 30-day series + meds + adherence + symptom events; returns PDF buffer.
- `src/lib/visits/pdf/document.tsx` — `<HandoffDocument>` root component (React-PDF).
- `src/lib/visits/pdf/header.tsx` — page header + footer.
- `src/lib/visits/pdf/what-changed.tsx` — the gold-tinted callout. Reads from `daily_assessments.triggers` accumulated across the window.
- `src/lib/visits/pdf/weight-chart.tsx` — 30-day chart with threshold band.
- `src/lib/visits/pdf/symptom-timeline.tsx` — 30-day × 4-symptom strip.
- `src/lib/visits/pdf/meds-table.tsx` — active meds table.
- `src/lib/visits/pdf/adherence-strip.tsx` — 14-day adherence strip per med.
- `src/lib/visits/pdf/questions.tsx` — numbered question list.
- `src/lib/visits/pdf/notes.tsx` — post-visit notes section.
- `src/lib/visits/pdf/colors.ts` — print-safe palette constants. Black/white/gray only. NO oklch.
- `src/lib/visits/pdf/typography.ts` — Inter and Fraunces font registrations for PDF (pull TTFs from `node_modules/@fontsource/inter` and `@fontsource/fraunces`).
- `src/app/api/visits/[id]/pdf/route.ts` — GET handler. Auth + RLS check, calls `renderVisitHandoffPDF`, streams `application/pdf` response with `Content-Disposition: attachment; filename="..."`.

### Files to MODIFY

- `src/app/visits/[id]/page.tsx` — add "Download PDF" button next to existing "Print this page" (or replace it). Links to `/api/visits/[id]/pdf`.
- `package.json` — add `@react-pdf/renderer`, `@fontsource/inter`, `@fontsource/fraunces`. Pin versions.

### Schema additions (one migration)

- `patients.dob` (date, nullable) — for the header's age display. Backfill via onboarding wizard step 2 prompt; existing patients see "Born — · — years" until they update.
- `cardiology_visits.last_visit_id` (uuid, nullable, fk to `cardiology_visits.id`) — explicit prior-visit pointer used by "what changed since last visit." Backfilled on insert via a trigger that grabs the most recent prior row for the same patient.

### Migration file

`supabase/migrations/{timestamp}_visits_pdf_support.sql`:
- ALTER TABLE patients ADD COLUMN dob date;
- ALTER TABLE cardiology_visits ADD COLUMN last_visit_id uuid REFERENCES cardiology_visits(id) ON DELETE SET NULL;
- Backfill trigger.
- RLS unchanged (existing policies cover the new columns — they're inside already-protected rows).

## Acceptance criteria

### Engineering
- [ ] Plan stated and approved before any code is written.
- [ ] No new abstractions beyond the listed PDF helpers.
- [ ] Diff scoped to PDF generation + the one new "Download PDF" button + the migration.
- [ ] All ACs verifiable by downloading a PDF and comparing.

### Functional — happy path
- [ ] Caregiver opens `/visits/[id]` → sees "Download PDF" button.
- [ ] Tapping the button downloads `heartnote-{first-name}-{date}.pdf` within 5 seconds (server-render time).
- [ ] PDF page 1 has: HeartNote wordmark top-left, patient ID block top-center, generation timestamp top-right, footer disclaimer.
- [ ] PDF page 1 body shows: visit-context band, "what changed" callout, weight chart with AHA threshold band labeled, symptom-timeline strip.
- [ ] PDF page 2 body shows: active-meds table, 14-day adherence strip per scheduled med, numbered questions list, post-visit notes if present.
- [ ] PDF colors are exclusively black/white/gray (no oklch, no sage). Grep the rendered output PDF; no color tags other than `#000000`, `#ffffff`, three gray hex values.

### Edge cases
- [ ] Visit with `cardiologist_name` null: visit-context band reads "Cardiologist: not on file."
- [ ] Patient with `dob` null: header age line reads "Born — · — years."
- [ ] No active meds: meds table replaced by "No medications on file." italic line.
- [ ] No questions: questions section replaced by "No questions written yet." italic line.
- [ ] No `notes_after`: notes section omitted entirely.
- [ ] Window has zero weight readings: weight-chart section replaced by "Not enough weight readings in the window."
- [ ] Window has zero `daily_assessments.triggers`: "what changed" callout reads "No threshold-crossing changes since the last visit."
- [ ] Patient with single-word `display_name` (e.g., "Mom"): header reads `{display_name}.` (no last initial).
- [ ] Visit on a brand-new patient with <14 days of logs: adherence-strip cells render as empty for days before patient existed; caption clarifies.
- [ ] More than 8 questions: PDF auto-paginates to a third page; "Continued on page 3" runner.

### Error states
- [ ] Auth failure on `/api/visits/[id]/pdf`: 302 redirect to /login.
- [ ] Visit not found or not owned by caregiver: 404. Don't leak existence.
- [ ] PDF render exception: 500 with caregiver-readable JSON error in dev, generic "Couldn't generate PDF" page in prod.

### Performance
- [ ] PDF generates in ≤ 5s for typical case (30-day window, 5 meds, 4 symptoms).
- [ ] Server query budget: 1 RPC for adherence + 4 simple queries (visit, patient, weight series, symptom events). No N+1.

### Persistence
- [ ] PDF NOT stored. Each download re-renders from canonical data.
- [ ] `cardiology_visits.last_visit_id` populated by trigger on insert.
- [ ] `patients.dob` collected via onboarding (separate plan; out of scope here unless the PDF blocks on it).

### Permissions / RLS
- [ ] `/api/visits/[id]/pdf` enforces caregiver ownership of the patient via RLS (uses `createClient` server-side, the same auth check `/visits/[id]/page.tsx` uses).
- [ ] No service-role usage. The PDF is private — only the owning caregiver can render it.

### Side effects
- [ ] Download click does not write to any table. PDF generation is a pure read.
- [ ] No analytics event added in this scope.

### Manual verification
1. Schedule a visit on a test account with a real 30-day weight history.
2. Tap "Download PDF" → confirm filename, page count (≤ 3), each section renders.
3. Print the PDF on a real printer (or photocopy the printout) → confirm no thin sage / coral / oklch line vanishes under contrast loss.
4. Open the PDF in Preview → cmd-F for "HeartNote" — wordmark searchable. cmd-F for the patient first name — header searchable.
5. Repeat with edge cases: no active meds, no questions, no weight readings, single-word patient name.

## What this plan does NOT do

- Does not pre-generate or cache PDFs. Every download re-renders. If perf becomes an issue later, add a `cardiology_visits.cached_pdf_at` and a Vercel edge cache layer; not in scope now.
- Does not email the PDF to anyone. The caregiver downloads and shares manually.
- Does not embed the PDF in the in-app `/visits/[id]` page (no PDF viewer iframe). The page stays a viewing surface; the PDF is for export.
- Does not change the in-app `/visits/[id]` cards. Those are the on-device read; the PDF is the offline artifact. Two surfaces, one data source.
- Does not add a "Send to MyChart" feature. That's a separate effort behind a real EHR integration.

## Order of operations for the executing session

1. Land the migration first (`supabase db push` after the migration file lands).
2. Add the PDF dependencies to package.json. Verify `npm install` clean.
3. Build `pdf/colors.ts`, `pdf/typography.ts`, `pdf/header.tsx` first (foundation).
4. Build the data loader (`pdf/index.ts`'s top-level data fetch). Verify it returns the right shape on a real test patient.
5. Build each section component, render in isolation in a test harness, screenshot/save the rendered PDF.
6. Compose the document, render once at the API route.
7. Walk every edge case from the AC list with real seed data — don't claim done before each gets a PDF rendered and visually inspected.
8. Add the "Download PDF" button on `/visits/[id]/page.tsx`. Verify the link works end-to-end.

Estimated effort: this is **at least 3 sessions** of careful work. Don't try to ship in one. The breakdown:
- Session 1: migration + dependencies + foundations (colors, typography, header, data loader). No section components yet. Verify infra clean.
- Session 2: weight chart + symptom timeline + what-changed callout. Visualizations are the hardest part.
- Session 3: meds table + adherence strip + questions + notes + final integration + edge-case walkthrough.

## Open questions for the user before session 1

- DOB collection — add a step to onboarding for it, or backfill via a `/me/patient/edit` page (not yet built)?
- Who's the audience for the file extension? PDF is universal; some EHR portals also accept HTML or PNG. PDF is the best default.
- Watermark on the page? "DECISION SUPPORT — NOT A MEDICAL RECORD" diagonal watermark across page 1? Adds confidence. Recommend yes, gray at 8% opacity.
