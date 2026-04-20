export function getEnv(key: string, fallback?: string): string {
  const value = process.env[key];
  if (value) return value;
  
  if (fallback) {
    const fallbackValue = process.env[fallback];
    if (fallbackValue) return fallbackValue;
  }
  
  return '';
}
