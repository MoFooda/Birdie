/**
 * Vision analysis of the rendered page.
 *
 * The gap this closes: the app was already capturing screenshots, storing them and
 * showing them — and never looking at them. Every judgement came from markup, so a site
 * could be structurally complete and visually a decade old and score as healthy.
 *
 * Two rules shape the adapter:
 *
 * 1. No image, no verdict. If rendering produced nothing, this reports `not_run` rather
 *    than falling back to describing the HTML — a visual claim made without seeing the
 *    page is exactly the kind of invented evidence the product exists to avoid.
 * 2. Every verdict carries what was observed. The schema requires it, so a reviewer can
 *    check the claim against the screenshot sitting next to it in the report.
 */

import OpenAI from 'openai';
import { safeParseAi } from '@/core/schemas';
import {
  visualAssessmentSchema,
  visualComparisonSchema,
  type VisualAssessment,
  type VisualComparison,
} from '@/core/visual-schemas';
import type { ProviderMeta, ProviderResult } from './types';
import { textFormat } from './ai';

export interface VisualContext {
  company_name: string;
  sub_sector: string | null;
  expected_website_role: string | null;
  /** Data URIs, already compressed by the renderer. */
  above_fold: string | null;
  full_page: string | null;
}

export interface ComparisonContext {
  company_name: string;
  sub_sector: string | null;
  company_shot: string | null;
  competitors: Array<{ name: string; shot: string }>;
}

export interface VisionProvider extends ProviderMeta {
  assess(context: VisualContext): Promise<ProviderResult<VisualAssessment>>;
  compare(context: ComparisonContext): Promise<ProviderResult<VisualComparison>>;
}

export const VISION_SYSTEM_PROMPT = `You are judging a business website from screenshots, for an agency deciding
whether the site needs rebuilding.

Rules you must not break:
- Describe only what is visible in the images. Never infer code, technology or analytics.
- Every score and every finding must be supported by something you can point to on screen.
- Judge the design era from visual cues only — typography, spacing, imagery treatment,
  button and form styling, layout conventions. Give a range, never a specific year, and
  say "cannot_tell" when the screenshot does not support a call.
- Do not invent traffic, revenue or conversion numbers.
- Score 0-100 where 100 is excellent.

Reply with a single JSON object and nothing else — no prose, no code fences. (The API
rejects a request for JSON output unless the word appears in the input, so this line is
load-bearing, not decoration.)`;

function imagePart(dataUri: string) {
  return { type: 'input_image' as const, image_url: dataUri, detail: 'auto' as const };
}

export function createOpenAiVision(apiKey: string, model = 'gpt-4.1-mini'): VisionProvider {
  const client = new OpenAI({ apiKey });

  async function run<T>(
    operation: string,
    schema: Parameters<typeof safeParseAi<T>>[0],
    prompt: string,
    images: string[],
  ): Promise<ProviderResult<T>> {
    const started = Date.now();
    const meta = { provider: `openai-vision:${model}`, live: true };

    if (images.length === 0) {
      return {
        ok: false,
        data: null,
        error: 'no screenshot was available, so no visual assessment was made',
        ...meta,
        duration_ms: 0,
      };
    }

    try {
      const response = await client.responses.create({
        model,
        input: [
          { role: 'system', content: VISION_SYSTEM_PROMPT },
          {
            role: 'user',
            content: [{ type: 'input_text' as const, text: prompt }, ...images.map(imagePart)],
          },
        ],
        text: { format: textFormat(schema, operation) },
      });

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(response.output_text ?? '');
      } catch {
        return {
          ok: false,
          data: null,
          error: `model returned non-JSON output for ${operation}`,
          ...meta,
          duration_ms: Date.now() - started,
        };
      }

      const parsed = safeParseAi(schema, parsedJson);
      if (!parsed.ok) {
        return {
          ok: false,
          data: null,
          error: `schema validation failed for ${operation}: ${parsed.error}`,
          ...meta,
          duration_ms: Date.now() - started,
          raw: parsedJson,
        };
      }

      return { ok: true, data: parsed.data, error: null, ...meta, duration_ms: Date.now() - started, raw: parsedJson };
    } catch (err) {
      return {
        ok: false,
        data: null,
        error: err instanceof Error ? err.message : String(err),
        ...meta,
        duration_ms: Date.now() - started,
      };
    }
  }

  return {
    name: `openai-vision:${model}`,
    live: true,

    async assess(context) {
      const images = [context.above_fold, context.full_page].filter((x): x is string => !!x);
      const prompt = `Assess the website of "${context.company_name}"${
        context.sub_sector ? `, a ${context.sub_sector}` : ''
      }.${
        context.expected_website_role
          ? ` Visitors in this sector typically come to the site to: ${context.expected_website_role.replace(/_/g, ' ')}.`
          : ''
      }

The first image is the mobile screen above the fold. ${
        images.length > 1 ? 'The second is the full page.' : ''
      }

Return JSON with: visual_hierarchy, above_fold_clarity, imagery_quality, brand_consistency,
readability, visual_clutter, mobile_layout_quality (all 0-100); design_era, design_era_confidence,
design_era_evidence; purpose_clear_above_fold, primary_action_visible, primary_action_described;
summary; confidence; findings (each with title, severity, observed, business_impact,
recommended_action, suitable_for_outreach).`;

      return run('visual_assessment', visualAssessmentSchema, prompt, images);
    },

    async compare(context) {
      const images = [
        ...(context.company_shot ? [context.company_shot] : []),
        ...context.competitors.map((c) => c.shot),
      ];
      const prompt = `The first image is "${context.company_name}"${
        context.sub_sector ? `, a ${context.sub_sector}` : ''
      }. The following ${context.competitors.length} image(s) are competitors, in order: ${context.competitors
        .map((c) => c.name)
        .join(', ')}.

Compare them visually only. Return JSON with: company_stands_out_as (clearly_better,
comparable, clearly_worse or cannot_tell); gap_summary; visible_differences (concrete,
checkable differences a person could verify by looking); confidence.`;

      return run('visual_comparison', visualComparisonSchema, prompt, images);
    },
  };
}

// ---------------------------------------------------------------------------
// Fixture adapter
// ---------------------------------------------------------------------------

/**
 * Demo adapter. It cannot see, so it does not pretend to: it reports that no visual
 * assessment was made. Returning invented visual prose here would make the demo lie about
 * the one thing this feature exists to establish.
 */
export function createFixtureVision(): VisionProvider {
  const unavailable = <T>(): ProviderResult<T> => ({
    ok: false,
    data: null,
    error:
      'Demo mode has no rendered screenshots to look at, so no visual assessment was made. Set RENDERER=playwright with an OpenAI key to enable it.',
    provider: 'fixture-vision',
    live: false,
    duration_ms: 0,
  });

  return {
    name: 'fixture-vision',
    live: false,
    async assess() {
      return unavailable<VisualAssessment>();
    },
    async compare() {
      return unavailable<VisualComparison>();
    },
  };
}

export function createDisabledVision(reason: string): VisionProvider {
  const off = <T>(): ProviderResult<T> => ({
    ok: false,
    data: null,
    error: reason,
    provider: 'vision-disabled',
    live: false,
    duration_ms: 0,
  });

  return {
    name: 'vision-disabled',
    live: false,
    async assess() {
      return off<VisualAssessment>();
    },
    async compare() {
      return off<VisualComparison>();
    },
  };
}

/** Vision needs both a model key and a renderer that actually produces screenshots. */
export function visionRequirements(hasKey: boolean, renderer: string, hasFirecrawl: boolean): string | null {
  if (!hasKey) return 'OPENAI_API_KEY is not set, so the site was not visually assessed.';
  if (renderer !== 'playwright' && !hasFirecrawl) {
    return 'No renderer captures screenshots. Set RENDERER=playwright (free) or FIRECRAWL_API_KEY.';
  }
  return null;
}
