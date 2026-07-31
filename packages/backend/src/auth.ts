import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { putItem, queryItems } from './db';
import type { JWTPayload } from '@player-eval/shared';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const BYPASS_AUTH = process.env.BYPASS_AUTH === 'true';
const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
const SES_FROM_EMAIL = process.env.SES_FROM_EMAIL || 'noreply@playereval.com';

const ses = new SESClient({ region: process.env.AWS_REGION || 'us-east-2' });

export function generateToken(): string {
  return uuidv4();
}

export async function sendMagicLink(email: string, teamId: string): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min

  await putItem({
    PK: `AUTH#${token}`,
    SK: `TOKEN`,
    email,
    teamId,
    expiresAt,
    type: 'auth_token',
  });

  const link = `${BASE_URL}/auth/verify?token=${token}`;

  if (process.env.NODE_ENV !== 'test') {
    await ses.send(
      new SendEmailCommand({
        Source: SES_FROM_EMAIL,
        Destination: { ToAddresses: [email] },
        Message: {
          Subject: { Data: 'PlayerEval - Your Login Link' },
          Body: {
            Html: {
              Data: `
                <h2>PlayerEval Login</h2>
                <p>Click the link below to sign in. This link expires in 15 minutes.</p>
                <a href="${link}">Sign In to PlayerEval</a>
                <p>If you didn't request this, you can safely ignore this email.</p>
              `,
            },
          },
        },
      })
    );
  }

  return token;
}

export async function verifyMagicToken(token: string): Promise<string | null> {
  const items = await queryItems(`AUTH#${token}`, 'TOKEN');
  if (!items.length) return null;

  const authToken = items[0];
  if (new Date(authToken.expiresAt) < new Date()) return null;

  // Find the coach by email
  // Return the email for the caller to look up the coach
  return authToken.email;
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
    // In test mode, accept a test header
    const testUser = headers['x-test-user'];
    if (testUser) {
      try {
        return JSON.parse(testUser) as JWTPayload;
      } catch {
        return null;
      }
    }
  }

  const authHeader = headers.authorization || headers.Authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  return verifyJWT(token);
}
