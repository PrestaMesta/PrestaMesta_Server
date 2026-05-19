import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import { Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const statusCode = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    let message: string;
    let statusText: string;

    if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
      statusText = exception.name.replace('Exception', '');
    } else {
      const resp = exceptionResponse as Record<string, unknown>;
      const msg = resp.message;
      message = Array.isArray(msg)
        ? (msg as string[])[0]
        : ((msg as string) ?? exception.message);
      statusText = (resp.error as string) ?? exception.name.replace('Exception', '');
    }

    response.status(statusCode).json({
      code: statusCode,
      status: statusText,
      message,
    });
  }
}
