import type { FastifyInstance } from 'fastify';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { z } from 'zod';
import { db } from '../lib/db';
import { authenticate } from '../plugins/authenticate';
import { config } from '../config';
import {
  formatProfile, businessProfileUpdateBody, ASSET_TYPES, ASSET_COLUMN, type AssetType,
} from './business-profile';

// Reusable named Brand Profiles (see plan doc / CLAUDE.md's Business
// Workspace section) — business-profile.ts (singular) is "the default
// profile" CRUD, unchanged for backward compatibility with the existing
// /business Brand Kit page. This file is the plural, multi-profile surface:
// a user running more than one business/side company creates additional
// named profiles here, each with its own logo/address/bank details/
// numbering sequence, and picks which one applies per document
// (documents.business_profile_id).

const createBody = businessProfileUpdateBody.extend({
  name: z.string().min(1).max(255),
});

export async function businessProfilesRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/business-profiles', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { rows } = await db.query(
      'SELECT * FROM business_profiles WHERE user_id = $1 ORDER BY is_default DESC, name ASC', [userId],
    );
    return reply.send({
      profiles: rows.map((r: any) => ({ ...formatProfile(r), name: r.name, isDefault: r.is_default })),
    });
  });

  fastify.post('/api/business-profiles', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const body = createBody.parse(request.body);

    const { rows: [created] } = await db.query(
      `INSERT INTO business_profiles
         (user_id, name, company_name, tagline, industry, brand_voice, company_values, logo_url,
          address, phone, email, website, tax_id, registration_number, bank_details, mobile_money,
          theme_color, accent_color, footer_text, default_terms, payment_instructions,
          default_currency, default_tax_rate, default_template_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
               COALESCE($17,'#4F46E5'),COALESCE($18,'#818CF8'),$19,$20,$21,COALESCE($22,'ZMW'),COALESCE($23,0),$24)
       RETURNING *`,
      [
        userId, body.name, body.companyName ?? null, body.tagline ?? null, body.industry ?? null,
        body.brandVoice ?? null, body.companyValues ?? null, body.logoUrl ?? null, body.address ?? null,
        body.phone ?? null, body.email ?? null, body.website ?? null, body.taxId ?? null,
        body.registrationNumber ?? null, body.bankDetails ? JSON.stringify(body.bankDetails) : '{}',
        body.mobileMoney ? JSON.stringify(body.mobileMoney) : '{}', body.themeColor ?? null,
        body.accentColor ?? null, body.footerText ?? null, body.defaultTerms ?? null,
        body.paymentInstructions ?? null, body.defaultCurrency ?? null, body.defaultTaxRate ?? null,
        body.defaultTemplateId ?? null,
      ],
    );
    return reply.code(201).send({ ...formatProfile(created), name: created.name, isDefault: created.is_default });
  });

  const patchHandler = async (request: any, reply: any) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    const body = createBody.partial().parse(request.body);

    const { rows: [existing] } = await db.query(
      'SELECT id FROM business_profiles WHERE id = $1 AND user_id = $2', [id, userId],
    );
    if (!existing) return reply.code(404).send({ error: 'Brand profile not found' });

    const { rows: [updated] } = await db.query(
      `UPDATE business_profiles SET
         name                 = COALESCE($1, name),
         company_name         = COALESCE($2, company_name),
         tagline               = COALESCE($3, tagline),
         industry              = COALESCE($4, industry),
         brand_voice           = COALESCE($5, brand_voice),
         company_values        = COALESCE($6, company_values),
         logo_url              = COALESCE($7, logo_url),
         address               = COALESCE($8, address),
         phone                 = COALESCE($9, phone),
         email                 = COALESCE($10, email),
         website               = COALESCE($11, website),
         tax_id                = COALESCE($12, tax_id),
         registration_number   = COALESCE($13, registration_number),
         bank_details          = COALESCE($14, bank_details),
         mobile_money          = COALESCE($15, mobile_money),
         theme_color           = COALESCE($16, theme_color),
         accent_color          = COALESCE($17, accent_color),
         footer_text           = COALESCE($18, footer_text),
         default_terms         = COALESCE($19, default_terms),
         payment_instructions  = COALESCE($20, payment_instructions),
         default_currency      = COALESCE($21, default_currency),
         default_tax_rate      = COALESCE($22, default_tax_rate),
         default_template_id   = CASE WHEN $23::boolean THEN $24::uuid ELSE default_template_id END,
         updated_at            = NOW()
       WHERE id = $25
       RETURNING *`,
      [
        body.name ?? null, body.companyName ?? null, body.tagline ?? null, body.industry ?? null,
        body.brandVoice ?? null, body.companyValues ?? null, body.logoUrl ?? null, body.address ?? null,
        body.phone ?? null, body.email ?? null, body.website ?? null, body.taxId ?? null,
        body.registrationNumber ?? null,
        body.bankDetails ? JSON.stringify(body.bankDetails) : null,
        body.mobileMoney ? JSON.stringify(body.mobileMoney) : null,
        body.themeColor ?? null, body.accentColor ?? null, body.footerText ?? null,
        body.defaultTerms ?? null, body.paymentInstructions ?? null, body.defaultCurrency ?? null,
        body.defaultTaxRate ?? null, 'defaultTemplateId' in body, body.defaultTemplateId ?? null, id,
      ],
    );
    return reply.send({ ...formatProfile(updated), name: updated.name, isDefault: updated.is_default });
  };

  fastify.patch('/api/business-profiles/:id', { preHandler: authenticate }, patchHandler);
  fastify.put('/api/business-profiles/:id', { preHandler: authenticate }, patchHandler);

  fastify.delete('/api/business-profiles/:id', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const { rows: [existing] } = await db.query(
      'SELECT id, is_default FROM business_profiles WHERE id = $1 AND user_id = $2', [id, userId],
    );
    if (!existing) return reply.code(404).send({ error: 'Brand profile not found' });
    if (existing.is_default) {
      return reply.code(400).send({ error: 'Set another profile as default before deleting this one' });
    }

    await db.query('DELETE FROM business_profiles WHERE id = $1', [id]);
    return reply.send({ ok: true });
  });

  // ── POST /api/business-profiles/:id/set-default — transactional flip:
  // clear the old default, set the new one. The partial unique index
  // (uq_business_profiles_default_per_user) guarantees at most one default
  // exists at any moment, so this must clear before it sets.
  fastify.post('/api/business-profiles/:id/set-default', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const { rows: [target] } = await db.query(
      'SELECT id FROM business_profiles WHERE id = $1 AND user_id = $2', [id, userId],
    );
    if (!target) return reply.code(404).send({ error: 'Brand profile not found' });

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE business_profiles SET is_default = false WHERE user_id = $1', [userId]);
      await client.query('UPDATE business_profiles SET is_default = true, updated_at = NOW() WHERE id = $1', [id]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return reply.send({ ok: true });
  });

  // ── POST /api/business-profiles/:id/assets?type=logo|signature|stamp ───
  // Identical upload logic to business-profile.ts's singular route, just
  // parameterized by :id + an ownership check instead of always resolving
  // via getOrCreateProfile (the default profile).
  fastify.post('/api/business-profiles/:id/assets', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    const { type } = request.query as { type?: string };

    if (!type || !ASSET_TYPES.includes(type as AssetType)) {
      return reply.code(400).send({ error: 'type must be one of logo, signature, stamp' });
    }

    const { rows: [profile] } = await db.query(
      'SELECT id FROM business_profiles WHERE id = $1 AND user_id = $2', [id, userId],
    );
    if (!profile) return reply.code(404).send({ error: 'Brand profile not found' });

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

    return reply.send({ ...formatProfile(updated), name: updated.name, isDefault: updated.is_default });
  });
}
