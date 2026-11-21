class AppError extends Error {
  public statusCode: number;
  public extraData?: Record<string, any>;

  constructor(statusCode: number, message: string, stack = '', extraData?: Record<string, any>) {
    super(message);
    this.statusCode = statusCode;
    this.extraData = extraData;

    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export default AppError;
