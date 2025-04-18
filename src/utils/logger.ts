import fs from "fs/promises";
import { logConfig } from "../config";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug: (message: string) => Promise<void>;
  info: (message: string) => Promise<void>;
  warn: (message: string) => Promise<void>;
  error: (message: string) => Promise<void>;
}

let logger: Logger | null = null;

export const setupLogging = async (): Promise<Logger> => {
  if (logger) return logger;

  const logsDir = logConfig.logsDir;
  try {
    await fs.access(logsDir);
  } catch {
    await fs.mkdir(logsDir, { recursive: true });
  }

  const today = new Date().toISOString().split("T")[0];
  const logFile = `${logsDir}/${today}.log`;

  const logWithLevel = async (message: string, level: LogLevel) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
    await fs.appendFile(logFile, logMessage);
  };

  logger = {
    debug: (message: string) => logWithLevel(message, "debug"),
    info: (message: string) => logWithLevel(message, "info"),
    warn: (message: string) => logWithLevel(message, "warn"),
    error: (message: string) => logWithLevel(message, "error"),
  };

  return logger;
};
