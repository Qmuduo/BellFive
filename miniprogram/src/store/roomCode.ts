export function normalizeMiniRoomCode(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  return /^[A-Z0-9]{6}$/.test(normalized) ? normalized : null;
}
