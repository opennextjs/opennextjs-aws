export function safeParseJsonFile<T = any>(input: string, filePath: string, fallback?: T): T | undefined {
    try {
      return JSON.parse(input);
    } catch (err) {
      console.warn(`Failed to parse JSON file "${filePath}". Error: ${(err as Error).message}`);
      return fallback;
    }
  }