import jwt from 'jsonwebtoken';
import type { JWTPayload } from '@player-eval/shared';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const BYPASS_AUTH = process.env.BYPASS_AUTH === 'true';

export function generatePin(): string {
  // Generate a random 4-digit PIN between 1000 and 9999
  return String(Math.floor(Math.random() * 9000) + 1000);
}

export function verifyPin(stored: string, provided: string): boolean {
  return stored === provided;
}

export function issueJWT(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
}

export function verifyJWT(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
}

export function authenticateRequest(headers: Record<string, string | undefined>): JWTPayload | null {
  if (BYPASS_AUTH) {
    // In test mode, accept a test header with JSON user payload
    const testUser = headers['x-test-user'];
    if (testUser) {
      try {
        return JSON.parse(testUser) as JWTPayload;
      } catch {
        return null;
      }
    }

    // Also try Authorization header as JSON (base64 or plain)
    const authHeader = headers.authorization || headers.Authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      // Try JWT first
      const jwtResult = verifyJWT(token);
      if (jwtResult) return jwtResult;
      // Try base64-encoded JSON
      try {
        return JSON.parse(Buffer.from(token, 'base64').toString()) as JWTPayload;
      } catch {
        // Try plain JSON
        try {
          return JSON.parse(token) as JWTPayload;
        } catch {
          return null;
        }
      }
    }
    return null;
  }

  const authHeader = headers.authorization || headers.Authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  return verifyJWT(token);
}
