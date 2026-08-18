/**
 * Schemas for the visual assessment.
 *
 * Separate from `schemas.ts` because this is a different kind of claim. Everything else
 * the model says is grounded in markup we can quote back; a visual judgement is grounded
 * only in a picture. So the schema forces the model to say *what it saw* alongside every
 * verdict, and the report labels the whole section as interpretation.
 *
 * Design era is deliberately a range with a confidence, not a year. "This looks like it
 * was built around 2012-2015, medium confidence" is a defensible thing to tell a
 * prospect. "Your website is from 2013" is not.
 */

import { z } from 'zod';
import { confidenceSchema } from './schemas';

const score0to100 = z.number().min(0).max(100);

export const DESIGN_ERAS = [
  'current',
  'recent',
  'dated_2015_2019',
  'dated_2010_2014',
  'pre_2010',
  'cannot_tell',
] as const;
export type DesignEra = (typeof DESIGN_ERAS)[number];

export const DESIGN_ERA_LABELS: Record<DesignEra, string> = {
  current: 'Looks current',
  recent: 'Recent, a little behind',
  dated_2015_2019: 'Dated — late 2010s',
  dated_2010_2014: 'Dated — early 2010s',
  pre_2010: 'Pre-2010',
  cannot_tell: 'Cannot tell from the screenshot',
};

export const visualFindingSchema = z.object({
  title: z.string().min(1),
  severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
  /** What is actually visible in the screenshot that supports this. */
  observed: z.string().min(1),
  business_impact: z.string().min(1),
  recommended_action: z.string().min(1),
  suitable_for_outreach: z.boolean(),
});
export type VisualFinding = z.infer<typeof visualFindingSchema>;

export const visualAssessmentSchema = z.object({
  /** All 0–100, where 100 is excellent. */
  visual_hierarchy: score0to100,
  above_fold_clarity: score0to100,
  imagery_quality: score0to100,
  brand_consistency: score0to100,
  readability: score0to100,
  visual_clutter: score0to100,
  mobile_layout_quality: score0to100,

  design_era: z.enum(DESIGN_ERAS),
  design_era_confidence: confidenceSchema,
  /** The visual cues behind the era call — typography, spacing, imagery, chrome. */
  design_era_evidence: z.array(z.string()).min(1).max(6),

  /** Can a first-time visitor tell what this business does, from the first screen alone? */
  purpose_clear_above_fold: z.boolean(),
  /** Is the main action visible without scrolling? */
  primary_action_visible: z.boolean(),
  primary_action_described: z.string().nullable(),

  summary: z.string().min(1),
  confidence: confidenceSchema,
  findings: z.array(visualFindingSchema).max(8),
});
export type VisualAssessment = z.infer<typeof visualAssessmentSchema>;

/** A short visual verdict on one competitor, for the side-by-side comparison. */
export const competitorVisualSchema = z.object({
  design_era: z.enum(DESIGN_ERAS),
  visual_quality: score0to100,
  observed: z.string().min(1),
});

export const visualComparisonSchema = z.object({
  /** How the company's site reads visually next to the competitors shown. */
  company_stands_out_as: z.enum(['clearly_better', 'comparable', 'clearly_worse', 'cannot_tell']),
  gap_summary: z.string().min(1),
  /** Concrete, quotable differences — the kind a prospect can check themselves. */
  visible_differences: z.array(z.string()).max(5),
  confidence: confidenceSchema,
});
export type VisualComparison = z.infer<typeof visualComparisonSchema>;
