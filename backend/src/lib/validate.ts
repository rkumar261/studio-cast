import { ZodError, ZodSchema } from 'zod';
import { FastifyReply, FastifyRequest } from 'fastify';

type Schemas = {
  body?: ZodSchema<any>;
  query?: ZodSchema<any>;
  params?: ZodSchema<any>;
  headers?: ZodSchema<any>;
};

export function validate(schemas: Schemas) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      if (schemas.body)  (req as any).body  = schemas.body.parse(req.body);
      if (schemas.query) (req as any).query = schemas.query.parse(req.query);
      if (schemas.params)(req as any).params= schemas.params.parse(req.params);
      if (schemas.headers)(req as any).headers= schemas.headers.parse(req.headers);
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.code(400).send({
          error: 'validation_error',
          issues: err.issues.map(i => ({ path: i.path, message: i.message })),
        });
      }
      throw err;
    }
  };
}
