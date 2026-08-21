import { PianoStorageError } from './errors'

export async function sha256Hex(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new PianoStorageError('DATABASE_UNAVAILABLE', 'This browser cannot create the score fingerprint required for immutable imports.')
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
