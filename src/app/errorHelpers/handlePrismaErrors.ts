import status from 'http-status';
import { Prisma } from '../../generated/prisma';
import { TErrorResponse, TErrorSources } from '../interfaces/error.interface';

const getStatusCodeFromPrismaError = (errorCode: string): number => {
  if (errorCode === 'P2002') return status.CONFLICT;
  if (['P2025', 'P2001', 'P2015', 'P2018'].includes(errorCode)) return status.NOT_FOUND;
  if (['P1000', 'P6002'].includes(errorCode)) return status.UNAUTHORIZED;
  if (['P1010', 'P6010'].includes(errorCode)) return status.FORBIDDEN;
  if (errorCode.startsWith('P2')) return status.BAD_REQUEST;
  return status.INTERNAL_SERVER_ERROR;
};

export const handlePrismaClientKnownRequestError = (error: Prisma.PrismaClientKnownRequestError): TErrorResponse => {
  const statusCode = getStatusCodeFromPrismaError(error.code);
  const meta = error.meta as Record<string, unknown> | undefined;

  let message = 'A database constraint error occurred';
  let errorPath = error.code;

  switch (error.code) {
    case 'P2002': {
      const target = meta?.target as string[] | string | undefined;
      const fields = Array.isArray(target) ? target.join(', ') : (target ?? 'field');
      message = `A record with this ${fields} already exists.`;
      errorPath = String(fields);
      break;
    }
    case 'P2025': {
      message = 'The requested record was not found.';
      break;
    }
    case 'P2003': {
      const field = meta?.field_name as string | undefined;
      message = field ? `Foreign key constraint failed on: ${field}` : 'Related record constraint failed.';
      errorPath = field ?? error.code;
      break;
    }
    default: {
      message = error.message.split('\n').filter(l => l.trim().length > 0)[0] || 'Database error occurred';
    }
  }

  return {
    success: false,
    statusCode,
    message,
    errorSources: [{ path: errorPath, message }],
  };
};

export const handlePrismaClientValidationError = (error: Prisma.PrismaClientValidationError): TErrorResponse => {
  return {
    success: false,
    statusCode: status.BAD_REQUEST,
    message: 'Validation failed - invalid data supplied to database query.',
    errorSources: [{ path: 'prisma_validation', message: error.message }],
  };
};
