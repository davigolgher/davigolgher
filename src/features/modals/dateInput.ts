/** Bridge ISO timestamps and <input type="date"> (YYYY-MM-DD). */
export function toDateInput(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function fromDateInput(value: string): string {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return new Date().toISOString();
  const dt = new Date();
  dt.setFullYear(y, m - 1, d);
  dt.setHours(12, 0, 0, 0);
  return dt.toISOString();
}
