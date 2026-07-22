import { describe, expect, it } from 'vitest';
import {
  AppError,
  BusinessRuleError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from './errors';

describe('AppError', () => {
  it('cross-tenant/ausente é 404, nunca 403', () => {
    expect(new NotFoundError().status).toBe(404);
    expect(new NotFoundError().code).toBe('NAO_ENCONTRADO');
  });

  it('mapeia código e status por tipo', () => {
    expect(new ValidationError().status).toBe(422);
    expect(new UnauthorizedError().status).toBe(401);
    expect(new ForbiddenError().status).toBe(403);
    expect(new BusinessRuleError('STOCK_INSUFICIENTE', 'sem stock').status).toBe(409);
    expect(new BusinessRuleError('STOCK_INSUFICIENTE', 'sem stock').code).toBe('STOCK_INSUFICIENTE');
  });

  it('preserva details e é instância de AppError', () => {
    const err = new ValidationError('x', { campo: 'email' });
    expect(err).toBeInstanceOf(AppError);
    expect(err.details).toEqual({ campo: 'email' });
  });
});
