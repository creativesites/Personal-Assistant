import type { FastifyInstance } from 'fastify';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { z } from 'zod';
import { db } from '../lib/db';
import { authenticate } from '../plugins/authenticate';
import { config } from '../config';

const updateBody = z.object({
  companyName: z.string().max(255).optional(),
  address: z.string().max(2000).optional(),
  phone: z.string().max(50).optional(),
  email: z.string().email().max(255).optional().or(z.literal('')),
  website: z.string().max(255).optional(),
  taxId: z.string().max(100).optional(),
  registrationNumber: z.string().max(100).optional(),
  bankDetails: z.object({
    bankName: z.string().optional(),
    accountName: z.string().optional(),
    accountNumber: z.string().optional(),
    branchCode: z.string().optional(),
  }).optional(),
  mobileMoney: z.object({
    provider: z.string().optional(),
    number: z.string().optional(),
  }).optional(),
  themeColor: z.string().max(20).optional(),
  accentColor: z.string().max(20).optional(),
  footerText: z.string().max(2000).optional(),
  defaultTerms: z.string().max(4000).optional(),
  paymentInstructions: z.string().max(2000).optional(),
  defaultCurrency: z.string().length(3).optional(),
  defaultTaxRate: z.number().min(0).max(100).optional(),
  defaultTemplateId: z.string().uuid().nullable().optional(),
});

function formatProfile(r: any) {
  return {
    companyName: r.company_name,
    logoUrl: r.logo_storage_path ? `/api/documents/assets/${r.id}/logo` : null,
    address: r.address,
    phone: r.phone,
    email: r.email,
    website: r.website,
    taxId: r.tax_id,
    registrationNumber: r.registration_number,
    bankDetails: r.bank_details ?? {},
    mobileMoney: r.mobile_money ?? {},
    signatureUrl: r.signature_storage_path ? `/api/documents/assets/${r.id}/signature` : null,
    stampUrl: r.stamp_storage_path ? `/api/documents/assets/${r.id}/stamp` : null,
    themeColor: r.theme_color,
    accentColor: r.accent_color,
    defaultTemplateId: r.default_template_id,
    footerText: r.footer_text,
    defaultTerms: r.default_terms,
    paymentInstructions: r.payment_instructions,
    defaultCurrency: r.default_currency,
    defaultTaxRate: r.default_tax_rate !== null ? parseFloat(r.default_tax_rate) : 0,
    numbering: r.numbering ?? {},
  };
}

export async function getOrCreateProfile(userId: string) {
  const { rows: [existing] } = await db.query('SELECT * FROM business_profiles WHERE user_id = $1', [userId]);
  if (existing) return existing;

  const { rows: [created] } = await db.query(
    'INSERT INTO business_profiles (user_id) VALUES ($1) RETURNING *',
    [userId],
  );
  return created;
}

const ASSET_TYPES = ['logo', 'signature', 'stamp'] as const;
type AssetType = (typeof ASSET_TYPES)[number];
const ASSET_COLUMN: Record<AssetType, string> = {
  logo: 'logo_storage_path',
  signature: 'signature_storage_path',
  stamp: 'stamp_storage_path',
};

export async function businessProfileRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/business-profile', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const profile = await getOrCreateProfile(userId);
    return reply.send(formatProfile(profile));
  });

  fastify.put('/api/business-profile', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const body = updateBody.parse(request.body);
    await getOrCreateProfile(userId);

    const { rows: [updated] } = await db.query(
      `UPDATE business_profiles SET
         company_name         = COALESCE($1, company_name),
         address              = COALESCE($2, address),
         phone                = COALESCE($3, phone),
         email                = COALESCE($4, email),
         website              = COALESCE($5, website),
         tax_id               = COALESCE($6, tax_id),
         registration_number  = COALESCE($7, registration_number),
         bank_details         = COALESCE($8, bank_details),
         mobile_money         = COALESCE($9, mobile_money),
         theme_color          = COALESCE($10, theme_color),
         accent_color         = COALESCE($11, accent_color),
         footer_text          = COALESCE($12, footer_text),
         default_terms        = COALESCE($13, default_terms),
         payment_instructions = COALESCE($14, payment_instructions),
         default_currency     = COALESCE($15, default_currency),
         default_tax_rate     = COALESCE($16, default_tax_rate),
         default_template_id  = CASE WHEN $17::boolean THEN $18::uuid ELSE default_template_id END,
         updated_at           = NOW()
       WHERE user_id = $19
       RETURNING *`,
      [
        body.companyName ?? null,
        body.address ?? null,
        body.phone ?? null,
        body.email ?? null,
        body.website ?? null,
        body.taxId ?? null,
        body.registrationNumber ?? null,
        body.bankDetails ? JSON.stringify(body.bankDetails) : null,
        body.mobileMoney ? JSON.stringify(body.mobileMoney) : null,
        body.themeColor ?? null,
        body.accentColor ?? null,
        body.footerText ?? null,
        body.defaultTerms ?? null,
        body.paymentInstructions ?? null,
        body.defaultCurrency ?? null,
        body.defaultTaxRate ?? null,
        'defaultTemplateId' in body,
        body.defaultTemplateId ?? null,
        userId,
      ],
    );

    return reply.send(formatProfile(updated));
  });

  // ── POST /api/business-profile/assets?type=logo|signature|stamp ────────────
  fastify.post('/api/business-profile/assets', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { type } = request.query as { type?: string };

    if (!type || !ASSET_TYPES.includes(type as AssetType)) {
      return reply.code(400).send({ error: 'type must be one of logo, signature, stamp' });
    }

    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

    let data: any;
    try {
      data = await (request as any).file();
    } catch {
      return reply.code(400).send({ error: 'Multipart not supported' });
    }
    if (!data) return reply.code(400).send({ error: 'No file uploaded' });

    const buf: Buffer = await data.toBuffer();
    if (buf.length > MAX_FILE_SIZE) {
      return reply.code(400).send({ error: 'File exceeds 5MB limit' });
    }

    const mimetype: string = data.mimetype ?? '';
    if (!mimetype.startsWith('image/')) {
      return reply.code(400).send({ error: 'Only image files are accepted' });
    }

    const profile = await getOrCreateProfile(userId);
    const ext = path.extname(data.filename ?? '') || '.png';
    const dir = path.join(config.DOC_STORAGE_DIR, 'brand', userId);
    await fs.mkdir(dir, { recursive: true });
    const storagePath = path.join(dir, `${type}-${crypto.randomUUID()}${ext}`);
    await fs.writeFile(storagePath, buf);

    const column = ASSET_COLUMN[type as AssetType];
    const { rows: [updated] } = await db.query(
      `UPDATE business_profiles SET ${column} = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [storagePath, profile.id],
    );

    return reply.send(formatProfile(updated));
  });

  // ── GET /api/documents/assets/:profileId/:type — serves a brand asset.
  // Accepts the JWT via ?token= as well as the Authorization header, since
  // an <img> tag can't set custom headers — unlike media.ts's WhatsApp media
  // route, a token is always required here (no unauthenticated fallback).
  fastify.get('/api/documents/assets/:profileId/:type', async (request, reply) => {
    const { profileId, type } = request.params as { profileId: string; type: string };
    const { token } = request.query as { token?: string };

    let userId: string;
    try {
      const authHeader = request.headers.authorization;
      const jwtToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : token;
      if (!jwtToken) return reply.code(401).send({ error: 'Unauthorized' });
      const decoded = fastify.jwt.verify(jwtToken) as { userId: string };
      userId = decoded.userId;
    } catch {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    if (!ASSET_TYPES.includes(type as AssetType)) {
      return reply.code(400).send({ error: 'Invalid asset type' });
    }

    const column = ASSET_COLUMN[type as AssetType];
    const { rows: [profile] } = await db.query(
      `SELECT ${column} AS storage_path FROM business_profiles WHERE id = $1 AND user_id = $2`,
      [profileId, userId],
    );
    if (!profile?.storage_path) return reply.code(404).send({ error: 'Asset not found' });

    try {
      const buf = await fs.readFile(profile.storage_path);
      const ext = path.extname(profile.storage_path).slice(1).toLowerCase();
      const mime = ext === 'png' ? 'image/png' : ext === 'svg' ? 'image/svg+xml' : 'image/jpeg';
      reply.header('Content-Type', mime);
      reply.header('Cache-Control', 'private, max-age=86400');
      return reply.send(buf);
    } catch {
      return reply.code(404).send({ error: 'Asset not found' });
    }
  });
}
