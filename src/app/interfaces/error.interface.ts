export interface TErrorSources {
  path: string | number;
  message: string;
}

export interface TErrorResponse {
  success: boolean;
  statusCode: number;
  message: string;
  errorSources: TErrorSources[];
}
