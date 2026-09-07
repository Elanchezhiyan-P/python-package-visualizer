/**
 * Generates a cryptographically-sufficient nonce string for Content Security Policy.
 * Used by both the main webview panel and the sidebar webview to authorize inline scripts.
 *
 * @returns A 32-character alphanumeric nonce string.
 */
export function getNonce(): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
