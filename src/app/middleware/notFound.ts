import { Request, Response } from 'express';
import status from 'http-status';

export const notFound = (req: Request, res: Response) => {
  res.status(status.NOT_FOUND).json({
    success: false,
    message: 'API Endpoint Not Found!',
    errorSources: [
      {
        path: req.originalUrl,
        message: `Route ${req.method} ${req.originalUrl} does not exist on this server`,
      },
    ],
  });
};
