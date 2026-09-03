/**
 * Verifica `toToolCallResult`: el helper que convierte un `ToolResult`
 * interno en la forma esperada por `McpServer.registerTool`.
 *
 * Caso critico: si `data` es un array raiz (p. ej. la respuesta de
 * `GET /api/companies`), NO debe incluirse en `structuredContent`,
 * porque el SDK de MCP valida ese campo con Zod `record<string, unknown>`
 * y rechaza arrays con `MCP error -32602: expected "record", received "array"`.
 *
 * El JSON debe seguir viajando en `content` (texto) para que el LLM
 * pueda parsearlo.
 */

import { describe, expect, it } from 'vitest';
import { toToolCallResult, ok, fail } from '../src/tool-base.js';

describe('toToolCallResult', () => {
  it('incluye structuredContent cuando data es un objeto plano', () => {
    const r = ok({ id: 1, name: 'test' });
    const out = toToolCallResult(r);
    expect(out.isError).toBeUndefined();
    expect(out.structuredContent).toEqual({ id: 1, name: 'test' });
    expect(out.content[0]?.text).toContain('"id": 1');
  });

  it('NO incluye structuredContent cuando data es un array (caso bug companies_list)', () => {
    const companies = [
      { id: 1, name: 'test' },
      { id: 12, name: 'test3' },
    ];
    const r = ok(companies);
    const out = toToolCallResult(r);
    expect(out.isError).toBeUndefined();
    expect(out.structuredContent).toBeUndefined();
    // Pero el JSON sigue presente en content para que el LLM lo lea
    expect(out.content[0]?.text).toContain('"id": 1');
    expect(out.content[0]?.text).toContain('"id": 12');
    expect(out.content[0]?.text).toContain('"name": "test3"');
  });

  it('NO incluye structuredContent cuando data es null o undefined', () => {
    expect(toToolCallResult(ok(null)).structuredContent).toBeUndefined();
    expect(toToolCallResult(ok(undefined)).structuredContent).toBeUndefined();
    expect(toToolCallResult(ok('hola')).structuredContent).toBeUndefined();
  });

  it('NO incluye structuredContent cuando data es un array vacio', () => {
    const r = ok([]);
    const out = toToolCallResult(r);
    expect(out.structuredContent).toBeUndefined();
    expect(out.content[0]?.text).toBe('[]');
  });

  it('preserva isError y serializa el error cuando el handler fallo', () => {
    const r = fail(new Error('boom'));
    const out = toToolCallResult(r);
    expect(out.isError).toBe(true);
    expect(out.structuredContent).toBeUndefined();
    expect(out.content[0]?.text).toContain('boom');
  });
});