/** Test-data helpers. Unique suffix keeps parallel runs from colliding; "[AUTO]" marks test records. */
export const uid = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
export const tagged = (text: string) => `[AUTO] ${text} ${uid()}`;
export const randomUuid = () => crypto.randomUUID();
export const isoDateFromNow = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

/** Pull an id out of a create response whose shape Swagger does not document. */
export function extractId(data: any, key = 'id'): string {
  if (typeof data === 'string' || typeof data === 'number') return String(data);
  const id = data?.[key] ?? data?.id;
  if (id === undefined || id === null) throw new Error(`No "${key}" in response: ${JSON.stringify(data)?.slice(0, 500)}`);
  return String(id);
}
