import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessJwt } from '../lib/jwt.js';
import '@fastify/cookie';

export async function authGuard(req: FastifyRequest, reply: FastifyReply) {
    try {
        const bearer = req.headers.authorization?.split(' ')[1];
        const cookieJwt = (req.cookies as any)?.access_token as string | undefined;
        const jwt = bearer ?? cookieJwt;
        if (!jwt) return reply.code(401).send({ error: 'unauthenticated' });
 
        const { payload } = await verifyAccessJwt(jwt);
        (req as any).user = { id: String(payload.sub) };
    } catch {
        return reply.code(401).send({ error: 'unauthenticated' });
    }
}
