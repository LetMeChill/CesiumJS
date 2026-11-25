export async function sha256(value: BufferSource): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', value);
  return Array.from(new Uint8Array(hash), (v) => v.toString(16).padStart(2, '0')).join('');
}
export const jsonSha256 = (value: unknown) =>
  sha256(new TextEncoder().encode(JSON.stringify(value)));
