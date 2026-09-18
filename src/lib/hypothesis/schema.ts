import { z } from "zod";

export const HYPOTHESIS_SCHEMA_ID = "fortvna.hypothesis.v0" as const;

export const HypothesisStatusSchema = z.enum([
  "research",
  "ask_measured",
  "run_measured",
  "desk_validated",
  "rejected",
]);

export const SeriesClassSchema = z.enum(["yahoo", "futures", "binanceusdm", "stocks"]);

export const InstrumentSchema = z.object({
  series_class: SeriesClassSchema,
  symbol: z.string().min(1),
  timeframe: z.string().min(1),
  session: z.string().optional(),
  note: z.string().optional(),
});

export const HypothesisPointersSchema = z.object({
  orb_playbook_id: z.string().nullable(),
  themis_idea_slug: z.string().nullable(),
  themis_spec_ids: z.array(z.string()),
  crucible_strategy_id: z.string().nullable(),
});

export const HypothesisSchema = z.object({
  schema: z.literal(HYPOTHESIS_SCHEMA_ID),
  id: z.string().regex(/^hyp-[a-z0-9-]+$/),
  metis_slug: z.string().min(1),
  english: z.string(),
  setup: z.string(),
  entry: z.string(),
  exit: z.string(),
  invalidation: z.string(),
  source_url: z.string(),
  grounding_version: z.string(),
  instruments: z.array(InstrumentSchema).min(1),
  status: HypothesisStatusSchema,
  pointers: HypothesisPointersSchema,
});

export type HypothesisStatus = z.infer<typeof HypothesisStatusSchema>;
export type SeriesClass = z.infer<typeof SeriesClassSchema>;
export type HypothesisInstrument = z.infer<typeof InstrumentSchema>;
export type HypothesisPointers = z.infer<typeof HypothesisPointersSchema>;
export type Hypothesis = z.infer<typeof HypothesisSchema>;

export function parseHypothesis(data: unknown): Hypothesis {
  return HypothesisSchema.parse(data);
}
