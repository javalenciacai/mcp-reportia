/**
 * Validacion de los esquemas Zod de entrada de las herramientas
 * exportadas. No ejecuta los handlers ni hace red; solo verifica
 * que el esquema rechace payloads invalidos y acepte los validos.
 *
 * Sirve como guardia: si alguien renombra o rompe un esquema,
 * estos tests fallan.
 */

import { describe, expect, it } from 'vitest';
import { allTools } from '../src/tools/index.js';

describe('allTools', () => {
  it('exporta al menos 12 herramientas (auth-health + companies + accounting-movements + account-mappings + commission-reports + third-parties)', () => {
    expect(allTools.length).toBeGreaterThanOrEqual(12);
  });

  it('cada tool tiene name, description e inputSchema', () => {
    for (const t of allTools) {
      expect(t.name).toMatch(/^reportia_/);
      expect(typeof t.description).toBe('string');
      expect(t.description.length).toBeGreaterThan(10);
      expect(t.inputSchema).toBeTruthy();
      expect(typeof t.handler).toBe('function');
    }
  });

  it('los nombres son unicos', () => {
    const names = allTools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('esquemas Zod - validacion negativa basica', () => {
  it('los esquemas de herramientas que toman companyId rechazan entradas invalidas', () => {
    // Buscamos cualquier tool que tenga un campo companyId en su shape.
    const withCompany = allTools.find((t) => {
      const shape = (t.inputSchema as { shape?: Record<string, unknown> }).shape;
      return Boolean(shape && shape.companyId);
    });
    expect(withCompany).toBeDefined();
    if (!withCompany) return;
    const shape = (withCompany.inputSchema as { shape: Record<string, { safeParse: (v: unknown) => unknown }> }).shape;
    const companyField = shape.companyId;
    if (!companyField) return;
    // Zod opcionales aceptan undefined; pero no strings vacios,
    // ni negativos, ni no enteros para campos numericos positivos.
    const r1 = companyField.safeParse('abc');
    const r2 = companyField.safeParse(-1);
    const r3 = companyField.safeParse(3.14);
    expect((r1 as { success: boolean }).success).toBe(false);
    expect((r2 as { success: boolean }).success).toBe(false);
    expect((r3 as { success: boolean }).success).toBe(false);
    // Y aceptan enteros positivos.
    const ok = companyField.safeParse(42);
    expect((ok as { success: boolean }).success).toBe(true);
  });

  it('los esquemas sin shape (input vacio z.object({})) aceptan objeto vacio', () => {
    const empty = allTools.find(
      (t) => Object.keys((t.inputSchema as { shape: Record<string, unknown> }).shape ?? {}).length === 0,
    );
    if (!empty) {
      // No hay tools vacios en este momento; pasa trivialmente.
      return;
    }
    const r = empty.inputSchema.safeParse({});
    expect(r.success).toBe(true);
  });
});
