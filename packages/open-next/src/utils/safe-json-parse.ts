export function safeJsonParse<T = any>(input: string, fallback?: T): T | undefined {
    try {
      return JSON.parse(input);
    } catch (err) {
      return fallback;
    }
  }