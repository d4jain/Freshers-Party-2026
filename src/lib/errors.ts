/** Expected, user-facing failures. Anything else is a 500 with a generic message. */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
