export const MIN_INTERVAL_MINUTES = 15;
export const MAX_INTERVAL_MINUTES = 24 * 60;

export const INTERVAL_OPTIONS = [15, 30, 60, 180, 360, 720, 1440] as const;

export function formatInterval(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes % 60 === 0 && minutes < 1440) return `${minutes / 60} h`;
  if (minutes === 1440) return "24 h";
  return `${Math.round(minutes / 6) / 10} h`;
}
