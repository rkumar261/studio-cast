import { prisma } from '../lib/prisma.js';
import { sha256 } from '../lib/jwt.js';

export async function upsertUserFromGoogle(profile: {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
}) {
  const { sub, email, name, picture } = profile;

  // If already linked, return existing user
  const existing = await prisma.oAuthAccount.findUnique({
    where: { provider_providerUserId: { provider: 'google', providerUserId: sub } },
    include: { user: true },
  });
  if (existing) return existing.user;

  // Create or connect by email, then link oauth account
  const user = await prisma.user.upsert({
    where: email ? { email } : { email: `google_${sub}@example.local` },
    create: { email: email ?? `google_${sub}@example.local`, name, imageUrl: picture },
    update: {},
  });

  await prisma.oAuthAccount.create({
    data: {
      userId: user.id,
      provider: 'google',
      providerUserId: sub,
      email,
      profileJson: { name, picture },
    },
  });

  return user;
}

export async function storeRefreshToken(params: {
  userId: string; jti: string; rawToken: string; expMs: number;
  userAgent?: string; ip?: string;
}) {
  const { userId, jti, rawToken, expMs, userAgent, ip } = params;
  await prisma.refreshToken.create({
    data: {
      userId,
      jti,
      hashedToken: sha256(rawToken),
      expiresAt: new Date(expMs),
      userAgent,
      ip,
    },
  });
}

export async function revokeRefreshByJti(jti: string) {
  await prisma.refreshToken.updateMany({
    where: { jti, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function findRefreshByJti(jti: string) {
  return prisma.refreshToken.findUnique({ where: { jti } }).catch(() => null);
}
