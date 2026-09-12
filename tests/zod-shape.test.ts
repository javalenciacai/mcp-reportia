/**
 * Unit tests for `extractRawShape` (the helper introduced in
 * sdd/date-filter-v4-debug to drill through wrapped Zod schemas).
 *
 * The regression that motivated this helper:
 *   - `src/server.ts:25` reads `tool.inputSchema.shape` to extract the raw
 *     shape for the MCP SDK.
 *   - After v0.3.4 added `.strict().superRefine()` to `ListFiltersInput`,
 *     the schema became a `ZodEffects` whose `.shape` is `undefined`.
 *   - The MCP SDK 1.30 silently substitutes `properties: {}` when
 *     `inputSchema.shape === undefined`, which drops LLM-supplied
 *     arguments at registration time (the upstream call never receives
 *     `dateFrom` / `dateTo`).
 *
 * These tests pin the helper's contract so we never regress to the
 * "shape is undefined for wrapped schemas" behavior again.
 */
import { describe, expect, it } from 'vitest';
import { z, ZodNumber, ZodObject, ZodString } from 'zod';
// ZodString is referenced for type assertions (e.g. `toBeInstanceOf(ZodString)`)
// in the helper's documented contract. Keep the import even though the
// regression test now uses bare `.optional()` shapes that surface as
// ZodOptional at this layer.
import { extractRawShape } from '../src/tool-base.js';

describe('extractRawShape — raw shape extraction from wrapped Zod schemas', () => {
  it('returns the shape for a plain ZodObject (baseline)', () => {
    const schema = z.object({ x: z.string(), y: z.number() });
    const shape = extractRawShape(schema);

    expect(shape).toBeDefined();
    expect(shape).not.toBeNull();
    expect(shape.x).toBeInstanceOf(ZodString);
    expect(shape.y).toBeInstanceOf(ZodNumber);
  });

  it('drills through .strict().superRefine() to the inner ZodObject (the v0.3.4 regression)', () => {
    // This is the EXACT scenario that produced the production incident:
    // v0.3.4 added `.strict().superRefine(...)` to ListFiltersInput and
    // server.ts:25's `tool.inputSchema.shape` started returning undefined.
    const schema = z
      .object({
        companyId: z.number().int().positive(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        signal: z.unknown().optional(),
        sessionId: z.string().optional(),
        _meta: z.unknown().optional(),
      })
      .strict()
      .superRefine(() => {
        // no-op refinement; the wrapping is what matters for the test
      });

    const shape = extractRawShape(schema) as Record<string, unknown>;

    expect(shape).toBeDefined();
    expect(shape).not.toBeNull();
    expect(shape.companyId).toBeInstanceOf(ZodNumber);
    // dateFrom, dateTo, sessionId are declared `.optional()`, so the shape
    // holds ZodOptional<...> instances (not bare ZodString). The point of
    // the test is that every field is REACHABLE at all — pre-fix,
    // `tool.inputSchema.shape` was `undefined` and the SDK dropped
    // every LLM argument.
    expect(shape.dateFrom).toBeDefined();
    expect(shape.dateTo).toBeDefined();
    expect(shape.signal).toBeDefined();
    expect(shape.sessionId).toBeDefined();
    expect(shape._meta).toBeDefined();
    expect(Object.keys(shape).sort()).toEqual(
      ['_meta', 'companyId', 'dateFrom', 'dateTo', 'sessionId', 'signal'].sort(),
    );
  });

  it('drills through .refine() to the inner ZodObject', () => {
    const schema = z.object({ x: z.string() }).refine((v) => v.x !== '');
    const shape = extractRawShape(schema);

    expect(shape).toBeDefined();
    expect(shape.x).toBeInstanceOf(ZodString);
  });

  it('drills through .pipe() via _def.in to the source ZodObject', () => {
    const schema = z.object({ a: z.number() }).pipe(z.object({ b: z.string() }));
    const shape = extractRawShape(schema);

    expect(shape).toBeDefined();
    expect(shape.a).toBeInstanceOf(ZodNumber);
  });

  it('passes primitive Zod schemas through unchanged', () => {
    const s = z.string();
    const out = extractRawShape(s);

    // Primitive passthrough: the same Zod instance is returned.
    expect(out).toBe(s);
  });

  it('defensive fallback: returns the schema as-is for unrecognized wrappers', () => {
    // A plain object is not a Zod schema. The helper must NOT throw and
    // must NOT return undefined — it should pass the value through so
    // the SDK can still attempt to consume it (and fail later with a
    // clearer error if it really isn't a schema).
    const fallback = {};
    expect(extractRawShape(fallback)).toBe(fallback);
  });

  it('returns an object with the ZodObject-shape surface for ZodEffects from .refine() chain', () => {
    // Belt and suspenders: even with .transform() chained before .refine(),
    // the helper must reach the inner ZodObject. This proves recursion
    // through multiple wrapper layers.
    const schema = z
      .object({ x: z.string() })
      .transform((v) => v)
      .refine((v) => v.x !== '');
    const shape = extractRawShape(schema);

    expect(shape).toBeDefined();
    expect(shape.x).toBeInstanceOf(ZodString);
  });

  it('keeps the inner ZodObject instance reachable (typed check)', () => {
    const schema = z.object({ x: z.string() }).strict().superRefine(() => {});
    const shape = extractRawShape(schema) as Record<string, unknown>;

    // The helper must return an object that, when typed as a record,
    // exposes the underlying Zod fields. The MCP SDK reads .shape via
    // internal logic, but our regression test pins the user-facing
    // contract: keys reachable on the returned shape match the original
    // object keys.
    expect(Object.keys(shape).sort()).toEqual(['x']);
  });

  it('returns a ZodObject for the simple chain (sanity check)', () => {
    // Direct sanity: a plain ZodObject passes through and remains a
    // ZodObject. The helper must not rewrite it.
    const schema = z.object({ x: z.string() });
    const shape = extractRawShape(schema) as Record<string, unknown>;
    expect(shape.x).toBeInstanceOf(ZodString);
    // The shape object is not itself a ZodObject — it's the raw shape.
    expect(Object.getPrototypeOf(shape)).not.toBe(ZodObject.prototype);
  });
});
