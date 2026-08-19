-- Register the visual-analysis pipeline step. Apply after 0003_demo_owner.sql.
--
-- `job_runs.step` is constrained to the `pipeline_step` enum, which 0001 declared with the
-- original eleven steps. The visual pass added a twelfth in application code but never
-- here, so the first attempt to record it failed the insert with an invalid-enum error and
-- took the whole company's run down with it — every company stopped after five steps.
--
-- The enum is the schema's copy of `PIPELINE_STEPS` in `src/core/types.ts`. Adding a step
-- there means adding it here, in the same change.

alter type pipeline_step add value if not exists 'analyze-visual-design';
