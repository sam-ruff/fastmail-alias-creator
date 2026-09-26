export type ErrorKind = "auth" | "rateLimit" | "network" | "server" | "invalid";

export class AppError extends Error {
  constructor(
    readonly kind: ErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof TypeError) return new AppError("network", "Could not reach Fastmail");
  const message = err instanceof Error ? err.message : String(err);
  return new AppError("server", message);
}
