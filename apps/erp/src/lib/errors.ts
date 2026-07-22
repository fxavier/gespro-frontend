// Hierarquia de erros aplicacional. Serviços/actions lançam estes; o cliente
// nunca vê stack traces. Cross-tenant é sempre NotFound (404), nunca 403.

export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: string, message: string, status = 400, details?: unknown) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Dados inválidos', details?: unknown) {
    super('VALIDACAO', message, 422, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Não autenticado') {
    super('NAO_AUTENTICADO', message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Sem permissão para esta operação') {
    super('SEM_PERMISSAO', message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Recurso não encontrado') {
    super('NAO_ENCONTRADO', message, 404);
  }
}

// Violações de regra de negócio com código estável (TRANSICAO_INVALIDA, etc.).
export class BusinessRuleError extends AppError {
  constructor(code: string, message: string, details?: unknown) {
    super(code, message, 409, details);
  }
}
