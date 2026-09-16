export function toLocalDateString(date: Date): string {
  // Local yyyy-MM-dd, never toISOString().slice(0,10) — that shifts the day at UTC+ offsets.
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
