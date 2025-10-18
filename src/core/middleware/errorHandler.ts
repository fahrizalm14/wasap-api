import { AppError } from '@/core/errors/AppError';
import { Logger } from '@/shared/utils/logger';
import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ErrorRequestHandler } from 'express';

const INTERNAL_ERROR_MESSAGE =
  'An unexpected internal server error occurred.';

export const createExpressErrorHandler =
  (logger: Logger): ErrorRequestHandler =>
  (err, _req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }

    if (err instanceof AppError) {
      logger.error(`[API Error] ${err.statusCode} - ${err.message}`, err);
      res.status(err.statusCode).json({ status: 'fail', message: err.message });
      return;
    }

    const error =
      err instanceof Error ? err : new Error('Unknown error received');

    logger.error('An unexpected error occurred', error);
    return res.status(500).json({
      status: 'error',
      message: INTERNAL_ERROR_MESSAGE,
    });
  };

export const createFastifyErrorHandler =
  (logger: Logger) =>
  (
    error: FastifyError,
    _request: FastifyRequest,
    reply: FastifyReply,
  ): void => {
    if (error instanceof AppError) {
      logger.error(`[API Error] ${error.statusCode} - ${error.message}`, error);
      void reply
        .status(error.statusCode)
        .send({ status: 'fail', message: error.message });
      return;
    }

    logger.error('An unexpected error occurred', error);
    void reply.status(500).send({
      status: 'error',
      message: INTERNAL_ERROR_MESSAGE,
    });
  };
