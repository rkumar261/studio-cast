export function base64url(buf: ArrayBuffer | Uint8Array) {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  let str = Buffer.from(bytes).toString('base64');
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function sha256(input: string) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(digest);
}

export async function createPkcePair() {
  // RFC 7636: 43–128 chars, unguessable. Using 96 chars.
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(64)));
  const challenge = base64url(await sha256(verifier));
  return { verifier, challenge };
}
