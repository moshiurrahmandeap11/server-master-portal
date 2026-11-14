import status from 'http-status';
import { ZodError } from 'zod';
import { TErrorResponse, TErrorSources } from '../interfaces/error.interface';

export const handleZodError = (err: ZodError): TErrorResponse => {
  const errorSources: TErrorSources[] = err.issues.map((issue) => {
    return {
      path: String(issue.path[issue.path.length - 1] ?? 'unknown'),
      message: issue.message,
    };
  });

  return {
    success: false,
    statusCode: status.BAD_REQUEST,
    message: 'Validation Error',
    errorSources,
  };
};
