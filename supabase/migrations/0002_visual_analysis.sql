-- Visual analysis of the rendered page. Apply after 0001_init.sql.
--
-- Until now every judgement in the system came from markup. This adds the storage behind
-- the visual pass: the full-page screenshot it reads, the assessment it produces, and —
-- just as important — the reason it could not run, so the report can say "not assessed"
-- instead of implying the site was looked at and found acceptable.

-- A visual judgement is its own kind of claim and gets its own finding category, so the
-- report can keep "we measured this in the HTML" apart from "this is what it looks like".
alter type finding_category add value if not exists 'visual_design';

alter table website_status_checks
  add column if not exists screenshot_full_page_url text;

comment on column website_status_checks.screenshot_url is
  'Mobile, above the fold — the first screen a visitor actually sees.';
comment on column website_status_checks.screenshot_full_page_url is
  'Full-page capture. Only taken when a vision pass will read it, so it is null on most rows.';

alter table audit_runs
  add column if not exists visual_assessment jsonb,
  add column if not exists visual_unavailable_reason text,
  add column if not exists visual_comparison jsonb;

comment on column audit_runs.visual_assessment is
  'VisualAssessment: dimension scores, design era and findings, read from the screenshots.';
comment on column audit_runs.visual_unavailable_reason is
  'Why the visual pass did not run. Never a substitute verdict — the score treats the item as unmeasured.';
alter table competitors
  add column if not exists screenshot_url text;

comment on column competitors.screenshot_url is
  'Above-the-fold capture, so the report can show the side-by-side the comparison judged.';

comment on column audit_runs.visual_comparison is
  'VisualComparison: how this site reads visually next to the competitors that were captured.';
