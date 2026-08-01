// salespersons.ts
const { resolveCompanyId } = require('./helpers');
const { assertConfirm, ok, fail } = require('./helpers');
const { z } = require('zod');

// Salesperson schemas
const salespersonCreateSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  companyId: resolveCompanyId,
  department: z.string().min(2)
});

const salespersonUpdateSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  passwordResetToNotify: z.string().datetime().optional()
});

// Operation schemas
const salespersonIdSchema = z.object({ id: z.string().uuid() });

const suggestionRequestSchema = z.object({
  query: z.string().min(2),
  companyId: resolveCompanyId
});

// Salesperson operations
export const listSalespersons = (filters = {}) => {
  if (filters.companyId) {
    ok(resolveCompanyId(filters.companyId), 'Invalid company ID');
  }
  // TODO: fetch salespersons with filters
  return ok([]);
};

export const createSalesperson = (data) => {
  const result = salespersonCreateSchema.safeParse(data);
  if (!result.success) return fail(result.error.errors);
  
  // TODO: create salesperson
  return ok({ id: crypto.randomUUID(), ...result.data });
};

export const getSalesperson = (id) => {
  const result = salespersonIdSchema.safeParse({ id });
  if (!result.success) return fail(result.error.errors);
  
  // TODO: fetch salesperson by id
  return ok({ id, ...result.data });
};

export const updateSalesperson = (id, updates) => {
  const result = salespersonIdSchema.safeParse({ id });
  if (!result.success) return fail(result.error.errors);
  
  const updateResult = salespersonUpdateSchema.safeParse(updates);
  if (!updateResult.success) return fail(updateResult.error.errors);
  
  // TODO: update salesperson
  return ok({ id, ...updates });
};

export const deleteSalesperson = (id, confirm) => {
  const result = salespersonIdSchema.safeParse({ id });
  if (!result.success) return fail(result.error.errors);
  assertConfirm(confirm);
  
  // TODO: delete salesperson
  return ok({ message: 'Salesperson deleted' });
};

export const suggestSalespersons = (filters) => {
  const result = suggestionRequestSchema.safeParse(filters);
  if (!result.success) return fail(result.error.errors);
  
  // TODO: generate suggestions based on filters
  return ok([]);
};