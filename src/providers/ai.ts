/**
 * AI analysis adapters.
 *
 * The live adapter uses the OpenAI Responses API with structured outputs; the fixture
 * adapter derives its answers deterministically from the *measured* evidence passed in
 * the request context.
 *
 * That second point is deliberate. A demo that returned hard-coded prose would prove
 * nothing about the pipeline, and worse, would produce claims untethered from what was
 * actually observed. The fixture adapter reasons over the same evidence pack the model
 * gets, so demo output is as traceable as production output — just simpler.
 */

import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { z } from 'zod';
import { safeParseAi } from '@/core/schemas';
import { timed, type AiProvider, type AiRequest, type ProviderResult } from './types';
import { SIGNAL_LABELS } from '@/core/audit-checks';

// ---------------------------------------------------------------------------
// OpenAI
// ---------------------------------------------------------------------------

/**
 * Asking for `json_object` carries a condition that is easy to miss: the request is
 * rejected outright unless the word "JSON" appears somewhere in the input. Every prompt in
 * this codebase describes the fields it wants without ever naming the format, so every
 * live call failed with a 400 and each step reported "AI unavailable" — the same shape a
 * missing key produces, which is what made it hard to spot.
 *
 * The condition belongs to the API contract, so it is satisfied here rather than by asking
 * every call site to remember a magic word. Exported so a test can hold the guarantee.
 */
/**
 * Constrain the model to the schema rather than describing it and hoping.
 *
 * `json_object` only guarantees the reply parses as JSON — it says nothing about shape.
 * Asking for a sector classification that way produced `business_model: "Retail"` and
 * three missing fields, which the validator then threw away: a paid call, a discarded
 * answer and a step reporting "AI unavailable". Structured outputs make the wrong answer
 * unrepresentable instead.
 *
 * Not every schema converts — strict mode rejects open-ended objects and optional keys —
 * so a schema that cannot be expressed falls back to plain JSON rather than failing the
 * call outright.
 */
export function textFormat<T>(schema: z.ZodType<T>, name: string) {
  try {
    return zodTextFormat(schema, name);
  } catch {
    return { type: 'json_object' as const };
  }
}

export function buildAiInput(request: Pick<AiRequest<unknown>, 'system' | 'user'>) {
  return [
    {
      role: 'system' as const,
      content: `${request.system}\n\nReply with a single JSON object and nothing else — no prose, no code fences.`,
    },
    { role: 'user' as const, content: request.user },
  ];
}

export function createOpenAiProvider(apiKey: string, model = 'gpt-4.1-mini'): AiProvider {
  const client = new OpenAI({ apiKey });

  return {
    name: `openai:${model}`,
    live: true,
    async generate<T>(request: AiRequest<T>): Promise<ProviderResult<T>> {
      const started = Date.now();
      try {
        const response = await client.responses.create({
          model,
          input: buildAiInput(request),
          text: { format: textFormat(request.schema, request.schemaName) },
        });

        const text = response.output_text ?? '';
        let parsedJson: unknown;
        try {
          parsedJson = JSON.parse(text);
        } catch {
          return {
            ok: false,
            data: null,
            error: `model returned non-JSON output for ${request.schemaName}`,
            provider: `openai:${model}`,
            live: true,
            duration_ms: Date.now() - started,
            raw: text,
          };
        }

        const parsed = safeParseAi(request.schema, parsedJson);
        if (!parsed.ok) {
          // A response that fails the schema is discarded outright — the caller turns
          // this into `needs_review` rather than patching the payload.
          return {
            ok: false,
            data: null,
            error: `schema validation failed for ${request.schemaName}: ${parsed.error}`,
            provider: `openai:${model}`,
            live: true,
            duration_ms: Date.now() - started,
            raw: parsedJson,
          };
        }

        return {
          ok: true,
          data: parsed.data,
          error: null,
          provider: `openai:${model}`,
          live: true,
          duration_ms: Date.now() - started,
          raw: parsedJson,
        };
      } catch (err) {
        return {
          ok: false,
          data: null,
          error: err instanceof Error ? err.message : String(err),
          provider: `openai:${model}`,
          live: true,
          duration_ms: Date.now() - started,
        };
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Fixture AI
// ---------------------------------------------------------------------------

export interface SectorDetectionContext {
  name: string;
  domain: string | null;
  apollo_sector: string | null;
  description: string | null;
  homepage_text: string | null;
}

export interface AssessmentContext {
  status_label: string;
  signals: Record<string, boolean | null>;
  expected_role: string | null;
  missing_conversion_actions: string[];
  missing_pages: string[];
  missing_trust_signals: string[];
  pagespeed_mobile: number | null;
  homepage_title: string | null;
  homepage_h1: string | null;
  page_types: string[];
  final_url: string | null;
}

export interface OutreachContext {
  company_name: string;
  contact_first_name: string | null;
  language: 'en' | 'ar';
  tone: string;
  sender_name: string;
  sender_role: string;
  sender_company: string;
  agency_service: string;
  agency_value_proposition: string;
  preferred_cta: string;
  recommended_action_label: string;
  findings: Array<{ title: string; evidence: string; business_impact: string }>;
  competitor_pattern: string | null;
  competitor_name: string | null;
  competitor_gap: string | null;
  sub_sector: string | null;
}

/**
 * Keyword families for the fixture classifier.
 *
 * Every pattern is word-bounded on purpose. Unbounded fragments produce exactly the kind
 * of confident-but-wrong classification this product is built to avoid — an early version
 * matched `app` inside "approach" in ordinary homepage copy and filed a tutoring centre as
 * B2B SaaS, which then pulled a 92-point sector importance into its score.
 */
const SECTOR_KEYWORDS: Array<[RegExp, { sector: string; sub_sector: string; business_model: string; customer_type: string; role: string }]> = [
  [/\b(dental|dentistry|clinic|healthcare|medical|medicine|dermatology|polyclinic|paediatrics|pediatrics)\b/i, { sector: 'Healthcare', sub_sector: 'Appointment-driven clinic', business_model: 'b2c_appointment', customer_type: 'consumer', role: 'appointment_booking' }],
  [/\b(e-?commerce|retail|consumer goods|online store|storefront|shop|skincare|furniture|décor|decor)\b/i, { sector: 'Retail', sub_sector: 'E-commerce brand', business_model: 'b2c_ecommerce', customer_type: 'consumer', role: 'ecommerce_transaction' }],
  [/\b(law|legal|lawyer|attorney|consultancy|consulting|accounting|advisory|professional services)\b/i, { sector: 'Professional Services', sub_sector: 'B2B professional service', business_model: 'b2b_services', customer_type: 'business', role: 'lead_generation' }],
  [/\b(software|saas|platform|application)\b/i, { sector: 'Technology', sub_sector: 'B2B SaaS', business_model: 'b2b_saas', customer_type: 'business', role: 'demo_request' }],
  [/\b(building materials|marble|granite|stone|manufacturing|manufacturer|fabrication|factory|industrial)\b/i, { sector: 'Manufacturing', sub_sector: 'Building materials manufacturer', business_model: 'b2b_manufacturing', customer_type: 'business', role: 'request_for_quotation' }],
  [/\b(restaurant|dining|grill|caf[eé]|food service|catering)\b/i, { sector: 'Hospitality', sub_sector: 'Restaurant and local dining', business_model: 'b2c_services', customer_type: 'consumer', role: 'local_footfall_support' }],
  [/\b(interior design|interiors|fit-?out|architecture|architect)\b/i, { sector: 'Professional Services', sub_sector: 'B2B professional service', business_model: 'b2b_services', customer_type: 'business', role: 'lead_generation' }],
];

function detectSectorFromEvidence(ctx: SectorDetectionContext) {
  const haystack = [ctx.apollo_sector, ctx.description, ctx.name, ctx.homepage_text?.slice(0, 1500)]
    .filter(Boolean)
    .join(' ');

  const matches = SECTOR_KEYWORDS.filter(([re]) => re.test(haystack));
  const evidence: string[] = [];
  if (ctx.apollo_sector) evidence.push(`Apollo industry: ${ctx.apollo_sector}`);
  if (ctx.description) evidence.push(`Company description: ${ctx.description.slice(0, 160)}`);
  if (ctx.homepage_text) evidence.push(`Homepage copy: ${ctx.homepage_text.slice(0, 160)}`);

  if (matches.length === 0) {
    return null;
  }

  const [, hit] = matches[0]!;
  // Two very different keyword families matching, or no Apollo sector at all, means we
  // are not confident enough to drive a playbook without a human look.
  const confidence: 'high' | 'medium' | 'low' =
    !ctx.apollo_sector ? 'low' : matches.length > 1 ? 'medium' : ctx.homepage_text ? 'high' : 'medium';

  return { ...hit, confidence, evidence: evidence.length ? evidence : ['no supporting text was available'] };
}

function assessFromEvidence(ctx: AssessmentContext) {
  const present = (k: string) => ctx.signals[k] === true;
  const score = (base: number, deltas: Array<[boolean, number]>) =>
    Math.max(0, Math.min(100, deltas.reduce((acc, [cond, d]) => acc + (cond ? d : 0), base)));

  const valueProp = score(55, [
    [!!ctx.homepage_h1, 12],
    [!!ctx.homepage_title, 8],
    [present('case_studies'), 8],
    [present('client_logos'), 7],
    [ctx.page_types.includes('services') || ctx.page_types.includes('products'), 10],
  ]);

  const journey = score(45, [
    [ctx.page_types.length >= 4, 15],
    [ctx.missing_pages.length === 0, 15],
    [present('pricing'), 10],
    [ctx.missing_conversion_actions.length === 0, 15],
    [ctx.missing_conversion_actions.length >= 3, -20],
  ]);

  const conversion = score(35, [
    [present('contact_form'), 12],
    [present('booking_link'), 12],
    [present('quote_request'), 10],
    [present('demo_request'), 10],
    [present('checkout_or_cart'), 14],
    [present('whatsapp_link'), 8],
    [present('click_to_call'), 8],
    [present('live_chat'), 5],
  ]);

  const trust = score(35, [
    [present('testimonials'), 12],
    [present('reviews'), 14],
    [present('case_studies'), 12],
    [present('client_logos'), 10],
    [present('certifications'), 10],
    [present('contact_details'), 10],
  ]);

  const ia = score(50, [
    [ctx.page_types.length >= 4, 18],
    [ctx.page_types.length <= 2, -18],
    [ctx.missing_pages.length === 0, 14],
    [(ctx.pagespeed_mobile ?? 100) < 50, -12],
  ]);

  const dims = [valueProp, journey, conversion, trust, ia];
  const avg = dims.reduce((a, b) => a + b, 0) / dims.length;

  const structural =
    ctx.missing_conversion_actions.length >= 2 && (ctx.missing_pages.length >= 2 || ia < 50);

  const parts: string[] = [];
  if (ctx.missing_conversion_actions.length > 0) {
    parts.push(`no ${ctx.missing_conversion_actions.join(', ').toLowerCase()} anywhere on the crawled pages`);
  }
  if (ctx.missing_pages.length > 0) parts.push(`missing ${ctx.missing_pages.join(', ').toLowerCase()} page(s)`);
  if (ctx.missing_trust_signals.length > 0) {
    parts.push(`no ${ctx.missing_trust_signals.join(', ').toLowerCase()}`);
  }
  if ((ctx.pagespeed_mobile ?? 100) < 50) parts.push(`mobile performance score of ${ctx.pagespeed_mobile}`);

  const summary =
    parts.length > 0
      ? `Measured against the expected role of ${ctx.expected_role ?? 'this sector'}: ${parts.join('; ')}.`
      : `The site covers the elements expected for ${ctx.expected_role ?? 'this sector'} on every page crawled.`;

  const findings = buildFindings(ctx);

  return {
    value_proposition_clarity: valueProp,
    customer_journey_clarity: journey,
    conversion_path_quality: conversion,
    trust_and_credibility: trust,
    information_architecture: ia,
    fulfills_expected_role: ctx.missing_conversion_actions.length === 0 && avg >= 60,
    problems_are_structural: structural,
    rebuild_justified: structural && avg < 50,
    targeted_improvements_sufficient: !structural && avg < 80,
    summary,
    confidence: (ctx.page_types.length >= 3 ? 'medium' : 'low') as 'high' | 'medium' | 'low',
    findings,
  };
}

function buildFindings(ctx: AssessmentContext) {
  const findings: Array<Record<string, unknown>> = [];

  for (const missing of ctx.missing_conversion_actions.slice(0, 4)) {
    findings.push({
      title: `No ${missing.toLowerCase()} on the website`,
      category: 'conversion',
      severity: 'high',
      page_url: ctx.final_url,
      evidence: `Crawled ${ctx.page_types.length} page(s) (${ctx.page_types.join(', ')}) and found no ${missing.toLowerCase()} markup.`,
      business_impact: `${missing} is one of the actions customers in this sector expect to complete on the site; without it the visit cannot convert.`,
      recommended_action: `Add ${missing.toLowerCase()} to the homepage and to every service or product page.`,
      confidence: 'high',
      suitable_for_outreach: true,
    });
  }

  if (ctx.signals['mobile_viewport'] === false || (ctx.pagespeed_mobile != null && ctx.pagespeed_mobile < 50)) {
    findings.push({
      title: 'Poor mobile experience',
      category: 'mobile',
      severity: 'high',
      page_url: ctx.final_url,
      evidence:
        ctx.pagespeed_mobile != null
          ? `PageSpeed Insights mobile performance score: ${ctx.pagespeed_mobile}/100.`
          : 'The homepage has no mobile viewport meta tag.',
      business_impact: 'Most visitors in this sector arrive on a phone, and a slow or unscaled page loses them before the content loads.',
      recommended_action: 'Fix the mobile layout and reduce the largest render-blocking assets.',
      confidence: 'high',
      suitable_for_outreach: true,
    });
  }

  for (const missing of ctx.missing_trust_signals.slice(0, 2)) {
    findings.push({
      title: `No ${missing.toLowerCase()} shown`,
      category: 'trust',
      severity: 'medium',
      page_url: ctx.final_url,
      evidence: `No ${missing.toLowerCase()} markup was found on any crawled page.`,
      business_impact: 'Buyers in this sector use the site to verify credibility before making contact.',
      recommended_action: `Publish ${missing.toLowerCase()} on the pages visitors land on.`,
      confidence: 'medium',
      suitable_for_outreach: true,
    });
  }

  const noTracking = ['ga4', 'gtm', 'meta_pixel', 'other_tracking'].every((k) => ctx.signals[k] === false);
  if (noTracking) {
    findings.push({
      title: 'No analytics or advertising tracking installed',
      category: 'tracking',
      severity: 'medium',
      page_url: ctx.final_url,
      evidence: 'No GA4, Google Tag Manager, Meta Pixel or comparable tag was found in the page source.',
      business_impact: 'Without a tag the site cannot attribute enquiries, so no marketing spend can be judged.',
      recommended_action: 'Install GA4 and a conversion event for each enquiry path.',
      confidence: 'high',
      suitable_for_outreach: false,
    });
  }

  return findings.slice(0, 12);
}

const EN = {
  greeting: (n: string | null) => (n ? `Hi ${n},` : 'Hello,'),
  sign: (ctx: OutreachContext) => `\n\n${ctx.sender_name}\n${ctx.sender_role}, ${ctx.sender_company}`,
};

const AR = {
  greeting: (n: string | null) => (n ? `مرحباً ${n}،` : 'مرحباً،'),
  sign: (ctx: OutreachContext) => `\n\n${ctx.sender_name}\n${ctx.sender_role} — ${ctx.sender_company}`,
};

function buildOutreach(ctx: OutreachContext) {
  const ar = ctx.language === 'ar';
  const L = ar ? AR : EN;
  const first = ctx.findings[0] ?? null;
  const second = ctx.findings[1] ?? first;
  const name = ctx.contact_first_name;

  const hook1 = first
    ? ar
      ? `لاحظت أثناء مراجعة موقع ${ctx.company_name}: ${first.title}`
      : `While looking at ${ctx.company_name}'s website I noticed: ${first.title.toLowerCase()}`
    : ar
      ? `راجعت موقع ${ctx.company_name}`
      : `I had a look at ${ctx.company_name}'s website`;

  const msg1 = {
    step: 1 as const,
    subject: ar ? `ملاحظة عن موقع ${ctx.company_name}` : `One thing on ${ctx.company_name}'s website`,
    body: ar
      ? `${L.greeting(name)}

${hook1}. ${first?.evidence ?? ''}

${first?.business_impact ?? ''}

${ctx.preferred_cta}${L.sign(ctx)}`
      : `${L.greeting(name)}

${hook1}. ${first?.evidence ?? ''}

${first?.business_impact ?? ''}

${ctx.preferred_cta}${L.sign(ctx)}`,
    personalized_hook: hook1,
    evidence_used: first ? [first.evidence] : [],
    competitor_referenced: null,
    cta: ctx.preferred_cta,
    confidence: (first ? 'high' : 'low') as 'high' | 'medium' | 'low',
    editable_variables: [{ name: 'company_name', value: ctx.company_name }, { name: 'first_name', value: name ?? '' }],
  };

  const competitorLine = ctx.competitor_pattern
    ? ar
      ? `عند مقارنة ${ctx.sub_sector ?? 'القطاع'}: ${ctx.competitor_pattern}`
      : `Across comparable ${ctx.sub_sector ?? 'businesses'}: ${ctx.competitor_pattern}`
    : ar
      ? 'لم نتمكن من تأكيد نمط واضح لدى المنافسين، لذلك لن أدّعي ذلك.'
      : 'We could not verify a clear competitor pattern, so I will not claim one.';

  const msg2 = {
    step: 2 as const,
    subject: ar ? `كيف يتعامل المنافسون في ${ctx.sub_sector ?? 'قطاعك'}` : `What comparable ${ctx.sub_sector ?? 'firms'} do differently`,
    body: `${L.greeting(name)}

${competitorLine}

${ctx.competitor_gap ?? ''}

${ctx.preferred_cta}${L.sign(ctx)}`,
    personalized_hook: competitorLine,
    evidence_used: [ctx.competitor_pattern, ctx.competitor_gap].filter((x): x is string => !!x),
    competitor_referenced: ctx.competitor_name,
    cta: ctx.preferred_cta,
    confidence: (ctx.competitor_pattern ? 'medium' : 'low') as 'high' | 'medium' | 'low',
    editable_variables: [{ name: 'company_name', value: ctx.company_name }, { name: 'competitor', value: ctx.competitor_name ?? '' }],
  };

  const msg3 = {
    step: 3 as const,
    subject: ar ? `اقتراح عملي لموقع ${ctx.company_name}` : `A practical next step for ${ctx.company_name}`,
    body: `${L.greeting(name)}

${ar ? 'بناءً على ما تم قياسه' : 'Based on what we measured'}, ${ctx.recommended_action_label.toLowerCase()}.

${second?.business_impact ?? ''}

${ctx.agency_value_proposition}

${ctx.preferred_cta}${L.sign(ctx)}`,
    personalized_hook: ctx.recommended_action_label,
    evidence_used: second ? [second.evidence] : [],
    competitor_referenced: null,
    cta: ctx.preferred_cta,
    confidence: 'medium' as const,
    editable_variables: [{ name: 'company_name', value: ctx.company_name }, { name: 'service', value: ctx.agency_service }],
  };

  const msg4 = {
    step: 4 as const,
    subject: ar ? `هل أتوجه لشخص آخر؟` : `Right person?`,
    body: ar
      ? `${L.greeting(name)}

لم أسمع منك، وهذا مفهوم تماماً. إن لم يكن الموقع من ضمن أولوياتك الآن فلا مشكلة إطلاقاً.

هل هناك شخص آخر في ${ctx.company_name} من الأفضل التواصل معه بهذا الشأن؟${L.sign(ctx)}`
      : `${L.greeting(name)}

I have not heard back, which is completely fair — the website may simply not be a priority right now.

Is there someone else at ${ctx.company_name} I should be speaking to about this instead?${L.sign(ctx)}`,
    personalized_hook: ar ? 'إغلاق مهذب' : 'Polite close',
    evidence_used: [],
    competitor_referenced: null,
    cta: ar ? 'رد بكلمة واحدة' : 'A one-line reply is enough',
    confidence: 'high' as const,
    editable_variables: [{ name: 'company_name', value: ctx.company_name }],
  };

  const whatsapp_drafts = first
    ? [
        {
          step: 1,
          body: ar
            ? `${L.greeting(name)} أنا ${ctx.sender_name} من ${ctx.sender_company}. لاحظت ${first.title} على موقع ${ctx.company_name}. هل يناسبك أن أرسل ملاحظاتي باختصار؟`
            : `${L.greeting(name)} I'm ${ctx.sender_name} from ${ctx.sender_company}. I noticed ${first.title.toLowerCase()} on ${ctx.company_name}'s site. Happy to send a short note on it?`,
        },
      ]
    : [];

  return { messages: [msg1, msg2, msg3, msg4], whatsapp_drafts };
}

export function createFixtureAi(): AiProvider {
  return {
    name: 'fixture-ai',
    live: false,
    async generate<T>(request: AiRequest<T>): Promise<ProviderResult<T>> {
      return timed('fixture-ai', false, async () => {
        let payload: unknown;

        switch (request.operation) {
          case 'sector_detection': {
            const detected = detectSectorFromEvidence(request.context as unknown as SectorDetectionContext);
            if (!detected) {
              throw new Error('no sector could be inferred from the available evidence');
            }
            payload = {
              sector: detected.sector,
              sub_sector: detected.sub_sector,
              business_model: detected.business_model,
              primary_customer_type: detected.customer_type,
              expected_website_role: detected.role,
              confidence: detected.confidence,
              evidence: detected.evidence,
            };
            break;
          }
          case 'website_assessment':
            payload = assessFromEvidence(request.context as unknown as AssessmentContext);
            break;
          case 'competitor_validation': {
            const ctx = request.context as { candidate_sub_sector?: string; target_sub_sector?: string; candidate_geography?: string; target_geography?: string };
            const subMatch =
              !!ctx.candidate_sub_sector &&
              !!ctx.target_sub_sector &&
              ctx.candidate_sub_sector.toLowerCase() === ctx.target_sub_sector.toLowerCase();
            const geoMatch =
              !ctx.target_geography ||
              !ctx.candidate_geography ||
              ctx.candidate_geography.toLowerCase().includes(ctx.target_geography.toLowerCase().split(',')[0]!.trim()) ||
              ctx.target_geography.toLowerCase().includes(ctx.candidate_geography.toLowerCase().split(',')[0]!.trim());
            payload = {
              valid: subMatch,
              relevance_score: subMatch ? (geoMatch ? 88 : 68) : 25,
              reason: subMatch
                ? `Same sub-sector (${ctx.candidate_sub_sector})${geoMatch ? ' and overlapping geography' : ', different geography'}.`
                : `Sub-sector "${ctx.candidate_sub_sector ?? 'unknown'}" does not match the target "${ctx.target_sub_sector ?? 'unknown'}".`,
            };
            break;
          }
          case 'outreach':
            payload = buildOutreach(request.context as unknown as OutreachContext);
            break;
          case 'competitor_candidates':
          default:
            payload = { candidates: [], limitations: ['fixture provider does not generate competitor candidates'] };
            break;
        }

        // Fixture output goes through exactly the same schema gate as a live model's.
        const parsed = safeParseAi(request.schema, payload);
        if (!parsed.ok) throw new Error(`fixture payload failed ${request.schemaName} validation: ${parsed.error}`);
        return { data: parsed.data as T, raw: payload };
      });
    },
  };
}
