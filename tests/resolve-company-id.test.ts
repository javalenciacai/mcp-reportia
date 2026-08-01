/**
 * Tests para `resolveCompanyId` y para los `assertConfirmed`.
 *
 * Estas funciones son los "guards" principales de las tools que
 * requieren empresa o confirmacion destructiva. Cubren:
 *   - prioridad input > default
 *   - validacion de tipos (string numerico, NaN, negativo)
 *   - error explicito si ambos faltan
 *   - assertConfirmed exige `confirm: true` literal
 */

import { describe, expect, it } from 'vitest';
import {
  assertConfirmed,
  resolveCompanyId,
  type ToolContext,
} from '../src/tool-base.js';
import { ReportiaError } from '../src/errors.js';
import type { ReportiaClient } from '../src/client.js';

function ctxWithDefault(defaultCompanyId?: number): ToolContext {
  const dummyClient = {} as unknown as ReportiaClient;
  return { client: dummyClient, defaultCompanyId };
}

describe('resolveCompanyId', () => {
  it('prefiere companyId del input sobre el default', () => {
    const ctx = ctxWithDefault(1);
    expect(resolveCompanyId({ companyId: 99 }, ctx)).toBe(99);
  });

  it('usa el default si input no aporta companyId', () => {
    const ctx = ctxWithDefault(7);
    expect(resolveCompanyId({}, ctx)).toBe(7);
  });

  it('convierte string numerico valido a entero positivo', () => {
    const ctx = ctxWithDefault(undefined);
    expect(resolveCompanyId({ companyId: '123' as unknown as number }, ctx)).toBe(123);
  });

  it('lanza ReportiaError con codigo MISSING_COMPANY_ID si ambos faltan', () => {
    const ctx = ctxWithDefault(undefined);
    try {
      resolveCompanyId({}, ctx);
      throw new Error('No lanzo error');
    } catch (e) {
      expect(e).toBeInstanceOf(ReportiaError);
      expect((e as ReportiaError).code).toBe('MISSING_COMPANY_ID');
      expect((e as ReportiaError).message).toMatch(/Falta companyId/);
    }
  });

  it('rechaza companyId no numerico', () => {
    const ctx = ctxWithDefault(undefined);
    expect(() =>
      resolveCompanyId({ companyId: Number('abc') as unknown as number }, ctx),
    ).toThrowError(/Falta companyId/);
  });

  it('rechaza companyId <= 0', () => {
    const ctx = ctxWithDefault(undefined);
    expect(() => resolveCompanyId({ companyId: 0 }, ctx)).toThrowError();
    expect(() => resolveCompanyId({ companyId: -3 }, ctx)).toThrowError();
  });

  it('rechaza companyId no entero', () => {
    const ctx = ctxWithDefault(undefined);
    expect(() => resolveCompanyId({ companyId: 3.7 }, ctx)).toThrowError();
  });
});

describe('assertConfirmed', () => {
  it('no lanza si confirm === true', () => {
    expect(() => assertConfirmed({ confirm: true }, 'tool')).not.toThrow();
  });

  it('lanza GUARD_REJECTED si confirm falta', () => {
    expect(() => assertConfirmed({}, 'my_tool')).toThrowError(/GUARD_REJECTED|my_tool/);
  });

  it('lanza GUARD_REJECTED si confirm es false', () => {
    expect(() => assertConfirmed({ confirm: false }, 'my_tool')).toThrowError();
  });
});
