import pino from "pino";

const SECRET_PATTERNS = [
  /[A-Za-z0-9_-]{24}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{20,}/g,
  /(Bot\s+)[A-Za-z0-9._-]+/gi,
  /(token["']?\s*[:=]\s*["']?)[^"',\s]+/gi,
  /([A-Za-z0-9+/]{120,}={0,2})/g
];

export function createLogger(level = "info"): pino.Logger {
  return pino({
    level,
    redact: {
      paths: ["discordToken", "token", "*.discordToken", "*.token", "snapshot", "backupData"],
      censor: "[REDACTED]"
    }
  });
}

export function redactSecrets(value: unknown): string {
  let text = value instanceof Error ? `${value.name}: ${value.message}` : String(value);
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, (_match, prefix: string | undefined) =>
      prefix ? `${prefix}[REDACTED]` : "[REDACTED]"
    );
  }
  return text;
}
