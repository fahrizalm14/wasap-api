export class AppError extends Error {
  public readonly statusCode: number;

  constructor(statusCode: number, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.statusCode = statusCode;
    this.name = 'AppError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
