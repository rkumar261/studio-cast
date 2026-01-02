import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessJwt } from '../lib/jwt.js';
import { prisma } from '../lib/prisma.js';  // or your repo wrapper

/*************  ✨ Windsurf Command ⭐  *************/
/*******  a75e7a4a-724a-43b5-a7b6-5844ff659e4a  *******/
export async function authGuard(req: FastifyRequest, reply: FastifyReply) {
  try {
    const bearer = req.headers.authorization?.split(' ')[1];
    const cookieJwt = (req.cookies as any)?.access_token as string | undefined;
    const jwt = bearer ?? cookieJwt;

    if (!jwt) {
      return reply.code(401).send({ error: 'unauthenticated' });
    }

    const { payload } = await verifyAccessJwt(jwt);
    const userId = String(payload.sub);

    // Fetch user details
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, imageUrl: true },
    });

    if (!user) {
      return reply.code(401).send({ error: 'user_not_found' });
    }

    (req as any).user = user;
  } catch (err) {
    return reply.code(401).send({ error: 'unauthenticated' });
  }
}
