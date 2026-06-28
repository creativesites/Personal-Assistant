import type { FastifyRequest, FastifyReply } from 'fastify'

export async function authenticateAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    await request.jwtVerify()
  } catch {
    return reply.code(401).send({ error: 'Unauthorized' })
  }

  const user = request.user as { userId: string; isAdmin?: boolean }
  if (!user.isAdmin) {
    return reply.code(403).send({ error: 'Admin access required' })
  }
}
