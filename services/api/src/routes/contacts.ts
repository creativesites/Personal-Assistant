import type { FastifyInstance } from 'fastify';
import { db } from '../lib/db';
import { authenticate } from '../plugins/authenticate';

export async function contactsRoutes(fastify: FastifyInstance): Promise<void> {

  // ── List contacts ──────────────────────────────────────────────────────────
  fastify.get('/api/contacts', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };

    const { rows } = await db.query(
      `SELECT
        co.id,
        COALESCE(co.custom_name, co.display_name, co.phone_number, co.whatsapp_jid) AS name,
        co.phone_number,
        co.avatar_url,
        co.email,
        co.company,
        co.job_title,
        co.industry,
        co.notes,
        co.customer_status,
        co.pipeline_stage,
        co.lead_score,
        co.last_message_at,
        r.id AS relationship_id,
        COALESCE(r.relationship_type, 'acquaintance') AS relationship_type,
        COALESCE(r.importance_tier, 3) AS importance_tier,
        COALESCE(r.health_score, 70) AS health_score,
        COALESCE(r.health_trend, 'stable') AS health_trend,
        r.last_interaction_at,
        cp.personality_summary,
        cp.mood_baseline,
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT ct.tag ORDER BY ct.tag), NULL) AS tags,
        COALESCE((
          SELECT COUNT(*) FROM contact_insights ci
          WHERE ci.contact_id = co.id AND ci.user_id = $1 AND ci.is_active = TRUE
        ), 0)::int AS insight_count,
        COALESCE((
          SELECT COUNT(*) FROM proactive_queue pq
          WHERE pq.contact_id = co.id AND pq.user_id = $1 AND pq.status = 'pending'
        ), 0)::int AS pending_actions
      FROM contacts co
      LEFT JOIN relationships r        ON r.contact_id  = co.id AND r.user_id  = $1
      LEFT JOIN contact_profiles cp    ON cp.contact_id = co.id AND cp.user_id = $1
      LEFT JOIN contact_tags ct        ON ct.contact_id = co.id AND ct.user_id = $1
      WHERE co.user_id = $1 AND co.is_group = false AND co.archived_at IS NULL
      GROUP BY co.id, r.id, cp.id
      ORDER BY r.importance_tier ASC NULLS LAST, co.last_message_at DESC NULLS LAST
      LIMIT 500`,
      [userId],
    );

    return reply.send({
      contacts: rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        phone: r.phone_number,
        email: r.email,
        company: r.company,
        jobTitle: r.job_title,
        industry: r.industry,
        notes: r.notes,
        avatarUrl: r.avatar_url,
        customerStatus: r.customer_status,
        pipelineStage: r.pipeline_stage,
        leadScore: r.lead_score,
        lastMessageAt: r.last_message_at,
        tags: r.tags ?? [],
        relationship: {
          type: r.relationship_type,
          importanceTier: r.importance_tier,
          healthScore: r.health_score,
          healthTrend: r.health_trend,
          lastInteractionAt: r.last_interaction_at,
        },
        profile: r.personality_summary
          ? { personalitySummary: r.personality_summary, moodBaseline: r.mood_baseline }
          : null,
        insightCount: r.insight_count,
        pendingActions: r.pending_actions,
      })),
    });
  });

  // ── Get single contact ─────────────────────────────────────────────────────
  fastify.get('/api/contacts/:id', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const { rows: [contact] } = await db.query(
      `SELECT
        co.id,
        co.whatsapp_jid,
        co.phone_number,
        co.display_name,
        co.custom_name,
        COALESCE(co.custom_name, co.display_name, co.phone_number, co.whatsapp_jid) AS name,
        co.avatar_url,
        co.email,
        co.company,
        co.job_title,
        co.industry,
        co.website,
        co.notes,
        co.customer_status,
        co.pipeline_stage,
        co.lead_score,
        co.source,
        co.last_message_at,
        co.created_at,
        r.id AS relationship_id,
        COALESCE(r.relationship_type, 'acquaintance') AS relationship_type,
        COALESCE(r.importance_tier, 3) AS importance_tier,
        COALESCE(r.health_score, 70) AS health_score,
        COALESCE(r.health_trend, 'stable') AS health_trend,
        r.last_interaction_at,
        r.notes AS relationship_notes,
        cp.personality_summary,
        cp.communication_style,
        cp.emotional_patterns,
        cp.known_triggers,
        cp.current_life_context,
        cp.mood_baseline,
        cp.preferences,
        cp.goals,
        cp.pain_points,
        cp.buying_behaviour,
        cp.relationship_stage,
        COALESCE(cp.locked_fields, '{}')      AS locked_fields,
        COALESCE(cp.user_edited_fields, '{}') AS user_edited_fields,
        cp.updated_at AS profile_updated_at
      FROM contacts co
      LEFT JOIN relationships r     ON r.contact_id  = co.id AND r.user_id  = $2
      LEFT JOIN contact_profiles cp ON cp.contact_id = co.id AND cp.user_id = $2
      WHERE co.id = $1 AND co.user_id = $2`,
      [id, userId],
    );

    if (!contact) return reply.code(404).send({ error: 'Contact not found' });

    const [insights, healthLogs, msgStats, tagsResult, proactiveResult, eventsResult] = await Promise.all([
      db.query(
        `SELECT insight_key, insight_value, confidence, supporting_text, created_at
         FROM contact_insights
         WHERE contact_id = $1 AND user_id = $2 AND is_active = TRUE
         ORDER BY confidence DESC NULLS LAST, created_at DESC
         LIMIT 50`,
        [id, userId],
      ),
      db.query(
        `SELECT rhl.health_score, rhl.previous_score, rhl.change_reason,
                rhl.contributing_factors, rhl.logged_at
         FROM relationship_health_logs rhl
         JOIN relationships r ON r.id = rhl.relationship_id
         WHERE r.contact_id = $1 AND r.user_id = $2
         ORDER BY rhl.logged_at DESC
         LIMIT 20`,
        [id, userId],
      ),
      db.query(
        `SELECT
          COUNT(*)                                          AS total_messages,
          COUNT(*) FILTER (WHERE m.sender_type = 'user')    AS sent,
          COUNT(*) FILTER (WHERE m.sender_type = 'contact') AS received,
          MAX(m.whatsapp_timestamp)                         AS last_message_at
         FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
         WHERE c.contact_id = $1 AND c.user_id = $2`,
        [id, userId],
      ),
      db.query(
        `SELECT tag FROM contact_tags WHERE contact_id = $1 AND user_id = $2 ORDER BY tag`,
        [id, userId],
      ),
      db.query(
        `SELECT id, suggestion_type, title, body, draft_message, priority
         FROM proactive_queue
         WHERE contact_id = $1 AND user_id = $2 AND status = 'pending'
         ORDER BY priority ASC, created_at DESC
         LIMIT 3`,
        [id, userId],
      ),
      db.query(
        `SELECT id, event_type, title, event_date, is_recurring, confidence_score
         FROM events
         WHERE contact_id = $1 AND user_id = $2 AND event_date >= CURRENT_DATE
         ORDER BY event_date ASC
         LIMIT 5`,
        [id, userId],
      ),
    ]);

    return reply.send({
      contact: {
        id:             contact.id,
        whatsappJid:    contact.whatsapp_jid,
        name:           contact.name,
        displayName:    contact.display_name,
        customName:     contact.custom_name,
        avatarUrl:      contact.avatar_url,
        phoneNumber:    contact.phone_number,
        email:          contact.email,
        company:        contact.company,
        jobTitle:       contact.job_title,
        industry:       contact.industry,
        website:        contact.website,
        notes:          contact.notes,
        customerStatus: contact.customer_status,
        pipelineStage:  contact.pipeline_stage,
        leadScore:      contact.lead_score,
        source:         contact.source,
        lastMessageAt:  contact.last_message_at,
        createdAt:      contact.created_at,
        tags:           tagsResult.rows.map((t: any) => t.tag),
        relationship: {
          type:              contact.relationship_type,
          importanceTier:    contact.importance_tier,
          healthScore:       contact.health_score,
          healthTrend:       contact.health_trend,
          lastInteractionAt: contact.last_interaction_at,
          notes:             contact.relationship_notes,
        },
        profile: (contact.personality_summary || contact.preferences || contact.goals || contact.relationship_stage) ? {
          personalitySummary: contact.personality_summary,
          communicationStyle: contact.communication_style,
          emotionalPatterns:  contact.emotional_patterns,
          knownTriggers:      contact.known_triggers,
          currentLifeContext: contact.current_life_context,
          moodBaseline:       contact.mood_baseline,
          preferences:        contact.preferences,
          goals:              contact.goals,
          painPoints:         contact.pain_points,
          buyingBehaviour:    contact.buying_behaviour,
          relationshipStage:  contact.relationship_stage,
          lockedFields:       contact.locked_fields ?? [],
          userEditedFields:   contact.user_edited_fields ?? [],
          updatedAt:          contact.profile_updated_at,
        } : {
          personalitySummary: null,
          communicationStyle: null,
          emotionalPatterns:  null,
          knownTriggers:      null,
          currentLifeContext: null,
          moodBaseline:       null,
          preferences:        null,
          goals:              null,
          painPoints:         null,
          buyingBehaviour:    null,
          relationshipStage:  null,
          lockedFields:       contact.locked_fields ?? [],
          userEditedFields:   contact.user_edited_fields ?? [],
          updatedAt:          null,
        },
        insights: insights.rows.map((i: any) => ({
          key:           i.insight_key,
          value:         i.insight_value,
          confidence:    parseFloat(i.confidence ?? '0'),
          supportingText: i.supporting_text,
          createdAt:     i.created_at,
        })),
        healthHistory: healthLogs.rows.map((h: any) => ({
          score:         h.health_score,
          previousScore: h.previous_score,
          changeReason:  h.change_reason,
          factors:       h.contributing_factors,
          recordedAt:    h.logged_at,
        })),
        stats: {
          totalMessages: parseInt(msgStats.rows[0]?.total_messages || '0'),
          sent:          parseInt(msgStats.rows[0]?.sent || '0'),
          received:      parseInt(msgStats.rows[0]?.received || '0'),
        },
        proactiveSuggestions: proactiveResult.rows.map((p: any) => ({
          id:             p.id,
          suggestionType: p.suggestion_type,
          title:          p.title,
          body:           p.body,
          draftMessage:   p.draft_message,
          priority:       p.priority,
        })),
        upcomingEvents: eventsResult.rows.map((e: any) => ({
          id:         e.id,
          eventType:  e.event_type,
          title:      e.title,
          eventDate:  e.event_date,
          isRecurring:e.is_recurring,
          confidence: parseFloat(e.confidence_score ?? '0'),
        })),
      },
    });
  });

  // ── Create contact manually ────────────────────────────────────────────────
  fastify.post('/api/contacts', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const body = request.body as {
      phoneNumber?: string
      name?: string
      email?: string
      company?: string
      jobTitle?: string
      industry?: string
      website?: string
      notes?: string
      customerStatus?: string
      pipelineStage?: string
    };

    if (!body.phoneNumber && !body.name) {
      return reply.code(400).send({ error: 'phoneNumber or name is required' });
    }

    const phone = (body.phoneNumber ?? '').replace(/\D/g, '');
    const jid   = phone ? `${phone}@c.us` : `manual_${Date.now()}@c.us`;

    const { rows: [created] } = await db.query(
      `INSERT INTO contacts (
        user_id, whatsapp_jid, phone_number, display_name, custom_name,
        email, company, job_title, industry, website, notes,
        customer_status, pipeline_stage, source
      ) VALUES ($1,$2,$3,$4,$4,$5,$6,$7,$8,$9,$10,$11,$12,'manual')
      ON CONFLICT (user_id, whatsapp_jid) DO UPDATE SET
        custom_name     = COALESCE(EXCLUDED.custom_name,     contacts.custom_name),
        email           = COALESCE(EXCLUDED.email,           contacts.email),
        company         = COALESCE(EXCLUDED.company,         contacts.company),
        customer_status = COALESCE(EXCLUDED.customer_status, contacts.customer_status),
        updated_at      = NOW()
      RETURNING id`,
      [
        userId, jid, phone || null, body.name ?? null,
        body.email ?? null, body.company ?? null, body.jobTitle ?? null,
        body.industry ?? null, body.website ?? null, body.notes ?? null,
        body.customerStatus ?? 'contact', body.pipelineStage ?? null,
      ],
    );

    return reply.code(201).send({ contact: { id: created.id } });
  });

  // ── Update contact ─────────────────────────────────────────────────────────
  fastify.patch('/api/contacts/:id', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;

    const fieldMap: Record<string, string> = {
      name:           'custom_name',
      customName:     'custom_name',
      phoneNumber:    'phone_number',
      email:          'email',
      company:        'company',
      jobTitle:       'job_title',
      industry:       'industry',
      website:        'website',
      notes:          'notes',
      customerStatus: 'customer_status',
      pipelineStage:  'pipeline_stage',
      leadScore:      'lead_score',
    };

    const sets: string[]    = [];
    const values: unknown[] = [id, userId];
    let idx = 3;

    for (const [jsKey, sqlCol] of Object.entries(fieldMap)) {
      if (jsKey in body) {
        sets.push(`${sqlCol} = $${idx++}`);
        values.push(body[jsKey] ?? null);
      }
    }

    if (sets.length === 0) {
      return reply.code(400).send({ error: 'No updatable fields provided' });
    }
    sets.push('updated_at = NOW()');

    const { rowCount } = await db.query(
      `UPDATE contacts SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2`,
      values,
    );

    if (!rowCount) return reply.code(404).send({ error: 'Contact not found' });
    return reply.send({ ok: true });
  });

  // ── Archive contact ────────────────────────────────────────────────────────
  fastify.delete('/api/contacts/:id', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const { rowCount } = await db.query(
      `UPDATE contacts SET archived_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND user_id = $2 AND archived_at IS NULL`,
      [id, userId],
    );

    if (!rowCount) return reply.code(404).send({ error: 'Contact not found' });
    return reply.send({ ok: true });
  });

  // ── Relationship clock — get ───────────────────────────────────────────────
  fastify.get('/api/contacts/:id/clock', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const { rows } = await db.query(
      `SELECT rc.id, rc.clock_type, rc.avg_days_between_messages,
              rc.std_dev_days, rc.peak_hours, rc.typical_day_of_week,
              rc.is_active, rc.is_manually_configured, rc.check_interval_days,
              rc.last_checked_at, rc.last_nudge_at, rc.next_check_at, rc.nudge_count,
              rc.created_at, rc.updated_at
       FROM relationship_clocks rc
       JOIN contacts co ON co.id = rc.contact_id
       WHERE rc.contact_id = $1 AND rc.user_id = $2 AND co.user_id = $2
       ORDER BY rc.clock_type ASC`,
      [id, userId],
    );

    return reply.send({
      clocks: rows.map((r: any) => ({
        id:                     r.id,
        clockType:              r.clock_type,
        avgDaysBetweenMessages: r.avg_days_between_messages ? parseFloat(r.avg_days_between_messages) : null,
        stdDevDays:             r.std_dev_days ? parseFloat(r.std_dev_days) : null,
        peakHours:              r.peak_hours,
        isActive:               r.is_active,
        isManuallyConfigured:   r.is_manually_configured,
        checkIntervalDays:      r.check_interval_days,
        lastCheckedAt:          r.last_checked_at,
        lastNudgeAt:            r.last_nudge_at,
        nextCheckAt:            r.next_check_at,
        nudgeCount:             r.nudge_count,
      })),
    });
  });

  // ── Add tag ────────────────────────────────────────────────────────────────
  fastify.post('/api/contacts/:id/tags', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    const { tag } = (request.body ?? {}) as { tag?: string };

    if (!tag?.trim()) return reply.code(400).send({ error: 'tag is required' });

    await db.query(
      `INSERT INTO contact_tags (user_id, contact_id, tag)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, contact_id, tag) DO NOTHING`,
      [userId, id, tag.trim().toLowerCase()],
    );

    return reply.send({ ok: true });
  });

  // ── Remove tag ─────────────────────────────────────────────────────────────
  fastify.delete('/api/contacts/:id/tags/:tag', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id, tag } = request.params as { id: string; tag: string };

    await db.query(
      'DELETE FROM contact_tags WHERE user_id = $1 AND contact_id = $2 AND tag = $3',
      [userId, id, tag],
    );

    return reply.send({ ok: true });
  });

  // ── Relationship clock — update ────────────────────────────────────────────
  fastify.put('/api/contacts/:id/clock/:clockType', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id, clockType } = request.params as { id: string; clockType: string };
    const body = request.body as { isActive?: boolean; checkIntervalDays?: number };

    const validClockTypes = ['dormancy_watch', 'weekly_touchpoint', 'daily_checkin', 'post_event_followup'];
    if (!validClockTypes.includes(clockType)) {
      return reply.code(400).send({ error: 'Invalid clock type' });
    }

    const { rowCount } = await db.query(
      `UPDATE relationship_clocks
       SET is_active              = COALESCE($3, is_active),
           check_interval_days   = COALESCE($4, check_interval_days),
           is_manually_configured = TRUE,
           updated_at             = NOW()
       WHERE contact_id = $1 AND user_id = $2 AND clock_type = $5`,
      [id, userId, body.isActive ?? null, body.checkIntervalDays ?? null, clockType],
    );

    if (!rowCount) return reply.code(404).send({ error: 'Clock not found' });
    return reply.send({ ok: true });
  });

  // ── Tasks — list ──────────────────────────────────────────────────────────
  fastify.get('/api/contacts/:id/tasks', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const { rows } = await db.query(
      `SELECT id, title, description, due_date, completed_at, created_by, sort_order, created_at
       FROM contact_tasks
       WHERE contact_id = $1 AND user_id = $2
       ORDER BY completed_at IS NOT NULL ASC, due_date ASC NULLS LAST, sort_order ASC, created_at ASC`,
      [id, userId],
    );

    return reply.send({ tasks: rows.map((r: any) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      dueDate: r.due_date,
      completedAt: r.completed_at,
      createdBy: r.created_by,
      sortOrder: r.sort_order,
      createdAt: r.created_at,
    })) });
  });

  // ── Tasks — create ────────────────────────────────────────────────────────
  fastify.post('/api/contacts/:id/tasks', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    const body = request.body as { title?: string; description?: string; dueDate?: string };

    if (!body.title?.trim()) return reply.code(400).send({ error: 'title is required' });

    const { rows: [task] } = await db.query(
      `INSERT INTO contact_tasks (user_id, contact_id, title, description, due_date)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, title, description, due_date, completed_at, created_by, created_at`,
      [userId, id, body.title.trim(), body.description ?? null, body.dueDate ?? null],
    );

    return reply.code(201).send({ task: {
      id: task.id,
      title: task.title,
      description: task.description,
      dueDate: task.due_date,
      completedAt: task.completed_at,
      createdBy: task.created_by,
      createdAt: task.created_at,
    } });
  });

  // ── Tasks — update ────────────────────────────────────────────────────────
  fastify.patch('/api/contacts/:id/tasks/:taskId', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id, taskId } = request.params as { id: string; taskId: string };
    const body = request.body as { title?: string; description?: string; dueDate?: string; completed?: boolean };

    const sets: string[] = [];
    const values: unknown[] = [taskId, userId, id];
    let idx = 4;

    if (body.title !== undefined)       { sets.push(`title = $${idx++}`);       values.push(body.title.trim()); }
    if (body.description !== undefined) { sets.push(`description = $${idx++}`); values.push(body.description || null); }
    if (body.dueDate !== undefined)     { sets.push(`due_date = $${idx++}`);    values.push(body.dueDate || null); }
    if (body.completed !== undefined)   {
      sets.push(`completed_at = $${idx++}`);
      values.push(body.completed ? new Date().toISOString() : null);
    }

    if (sets.length === 0) return reply.code(400).send({ error: 'Nothing to update' });
    sets.push('updated_at = NOW()');

    const { rowCount } = await db.query(
      `UPDATE contact_tasks SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2 AND contact_id = $3`,
      values,
    );

    if (!rowCount) return reply.code(404).send({ error: 'Task not found' });
    return reply.send({ ok: true });
  });

  // ── Tasks — delete ────────────────────────────────────────────────────────
  fastify.delete('/api/contacts/:id/tasks/:taskId', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id, taskId } = request.params as { id: string; taskId: string };

    await db.query(
      'DELETE FROM contact_tasks WHERE id = $1 AND user_id = $2 AND contact_id = $3',
      [taskId, userId, id],
    );

    return reply.send({ ok: true });
  });

  // ── Context pins — list ───────────────────────────────────────────────────
  fastify.get('/api/contacts/:id/context', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const { rows } = await db.query(
      `SELECT id, content, sort_order, created_at
       FROM contact_context_pins
       WHERE contact_id = $1 AND user_id = $2
       ORDER BY sort_order ASC, created_at ASC`,
      [id, userId],
    );

    return reply.send({ pins: rows.map((r: any) => ({ id: r.id, content: r.content, createdAt: r.created_at })) });
  });

  // ── Context pins — create ─────────────────────────────────────────────────
  fastify.post('/api/contacts/:id/context', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    const body = request.body as { content?: string };

    if (!body.content?.trim()) return reply.code(400).send({ error: 'content is required' });

    const { rows: [pin] } = await db.query(
      `INSERT INTO contact_context_pins (user_id, contact_id, content)
       VALUES ($1, $2, $3)
       ON CONFLICT (contact_id, user_id, content) DO UPDATE SET updated_at = NOW()
       RETURNING id, content, created_at`,
      [userId, id, body.content.trim()],
    );

    return reply.code(201).send({ pin: { id: pin.id, content: pin.content, createdAt: pin.created_at } });
  });

  // ── Context pins — delete ─────────────────────────────────────────────────
  fastify.delete('/api/contacts/:id/context/:pinId', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id, pinId } = request.params as { id: string; pinId: string };

    await db.query(
      'DELETE FROM contact_context_pins WHERE id = $1 AND user_id = $2 AND contact_id = $3',
      [pinId, userId, id],
    );

    return reply.send({ ok: true });
  });

  // ── Profile field update (AI-generated with lock tracking) ──────────────
  fastify.patch('/api/contacts/:id/profile', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    const body = request.body as {
      field: string;
      value: string | null;
      lockAction?: 'lock' | 'unlock' | 'none';
    };

    const fieldMap: Record<string, string> = {
      personalitySummary: 'personality_summary',
      communicationStyle: 'communication_style',
      currentLifeContext: 'current_life_context',
      moodBaseline:       'mood_baseline',
      preferences:        'preferences',
      goals:              'goals',
      painPoints:         'pain_points',
      buyingBehaviour:    'buying_behaviour',
      relationshipStage:  'relationship_stage',
    };

    const sqlField = fieldMap[body.field];
    if (!sqlField) return reply.code(400).send({ error: 'Invalid field' });

    // Ensure a profile row exists for this contact
    await db.query(
      `INSERT INTO contact_profiles (user_id, contact_id) VALUES ($1, $2) ON CONFLICT (contact_id) DO NOTHING`,
      [userId, id],
    );

    const fieldKey = `$4::text`;
    const sets: string[] = [`${sqlField} = $3`, 'updated_at = NOW()'];
    const values: unknown[] = [id, userId, body.value, body.field];

    const action = body.lockAction ?? 'none';
    if (action === 'lock') {
      sets.push(`locked_fields      = array_append(array_remove(locked_fields, ${fieldKey}), ${fieldKey})`);
      sets.push(`user_edited_fields = array_append(array_remove(user_edited_fields, ${fieldKey}), ${fieldKey})`);
    } else if (action === 'unlock') {
      sets.push(`locked_fields      = array_remove(locked_fields, ${fieldKey})`);
      sets.push(`user_edited_fields = array_append(array_remove(user_edited_fields, ${fieldKey}), ${fieldKey})`);
    } else {
      // no lock change — just mark as user-edited
      sets.push(`user_edited_fields = array_append(array_remove(user_edited_fields, ${fieldKey}), ${fieldKey})`);
    }

    const { rowCount } = await db.query(
      `UPDATE contact_profiles SET ${sets.join(', ')} WHERE contact_id = $1 AND user_id = $2`,
      values,
    );

    if (!rowCount) return reply.code(404).send({ error: 'Profile not found' });
    return reply.send({ ok: true });
  });

  // ── Documents — list ─────────────────────────────────────────────────────
  fastify.get('/api/contacts/:id/documents', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const { rows } = await db.query(
      `SELECT id, file_name, file_type, file_size, storage_url, doc_category, notes, uploaded_at
       FROM contact_documents
       WHERE contact_id = $1 AND user_id = $2
       ORDER BY uploaded_at DESC`,
      [id, userId],
    );

    return reply.send({ documents: rows.map((r: any) => ({
      id:          r.id,
      fileName:    r.file_name,
      fileType:    r.file_type,
      fileSize:    r.file_size,
      storageUrl:  r.storage_url,
      docCategory: r.doc_category,
      notes:       r.notes,
      uploadedAt:  r.uploaded_at,
    })) });
  });

  // ── Documents — create ───────────────────────────────────────────────────
  fastify.post('/api/contacts/:id/documents', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    const body = request.body as {
      fileName?: string;
      storageUrl?: string;
      docCategory?: string;
      notes?: string;
      fileType?: string;
    };

    if (!body.fileName?.trim()) return reply.code(400).send({ error: 'fileName is required' });
    if (!body.storageUrl?.trim()) return reply.code(400).send({ error: 'storageUrl is required' });

    const validCategories = ['invoice','contract','receipt','image','pdf','vehicle_photo','other'];
    const category = validCategories.includes(body.docCategory ?? '') ? body.docCategory : 'other';

    const { rows: [doc] } = await db.query(
      `INSERT INTO contact_documents (user_id, contact_id, file_name, storage_url, doc_category, notes, file_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, file_name, file_type, storage_url, doc_category, notes, uploaded_at`,
      [userId, id, body.fileName.trim(), body.storageUrl.trim(), category, body.notes ?? null, body.fileType ?? null],
    );

    return reply.code(201).send({ document: {
      id: doc.id, fileName: doc.file_name, fileType: doc.file_type,
      storageUrl: doc.storage_url, docCategory: doc.doc_category,
      notes: doc.notes, uploadedAt: doc.uploaded_at,
    } });
  });

  // ── Documents — delete ───────────────────────────────────────────────────
  fastify.delete('/api/contacts/:id/documents/:docId', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id, docId } = request.params as { id: string; docId: string };

    await db.query(
      'DELETE FROM contact_documents WHERE id = $1 AND user_id = $2 AND contact_id = $3',
      [docId, userId, id],
    );

    return reply.send({ ok: true });
  });

  // ── Events — create manual event ─────────────────────────────────────────
  fastify.post('/api/contacts/:id/events', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    const body = request.body as {
      eventType?: string;
      title?: string;
      description?: string;
      eventDate?: string;
      isRecurring?: boolean;
    };

    if (!body.title?.trim()) return reply.code(400).send({ error: 'title is required' });
    if (!body.eventDate) return reply.code(400).send({ error: 'eventDate is required' });

    const validTypes = ['birthday','anniversary','job_change','life_event','travel','appointment','deadline','celebration','loss','other','meeting','payment','delivery','service_reminder'];
    const eventType = validTypes.includes(body.eventType ?? '') ? body.eventType : 'other';

    const { rows: [event] } = await db.query(
      `INSERT INTO events (user_id, contact_id, event_type, title, description, event_date, is_recurring, source, is_confirmed)
       VALUES ($1, $2, $3::event_type, $4, $5, $6, $7, 'user_input', true)
       RETURNING id, event_type, title, event_date, is_recurring`,
      [userId, id, eventType, body.title.trim(), body.description ?? null, body.eventDate, body.isRecurring ?? false],
    );

    return reply.code(201).send({ event: {
      id: event.id, eventType: event.event_type, title: event.title,
      eventDate: event.event_date, isRecurring: event.is_recurring,
    } });
  });

  // ── Events — delete ──────────────────────────────────────────────────────
  fastify.delete('/api/contacts/:id/events/:eventId', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id, eventId } = request.params as { id: string; eventId: string };

    await db.query(
      'DELETE FROM events WHERE id = $1 AND user_id = $2 AND contact_id = $3',
      [eventId, userId, id],
    );

    return reply.send({ ok: true });
  });

  // ── Contact messages ──────────────────────────────────────────────────────
  fastify.get('/api/contacts/:id/messages', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const { rows: [conv] } = await db.query(
      'SELECT id FROM conversations WHERE contact_id = $1 AND user_id = $2 LIMIT 1',
      [id, userId],
    );

    if (!conv) return reply.send({ messages: [], conversationId: null });

    const { rows } = await db.query(
      `SELECT
        m.id,
        m.sender_type,
        m.message_type,
        m.body,
        m.whatsapp_timestamp,
        m.media_url,
        m.media_mime_type,
        m.transcription,
        m.quoted_message_id,
        (SELECT COUNT(*) FROM suggested_replies sr WHERE sr.message_id = m.id AND sr.status = 'pending') AS pending_suggestions
       FROM messages m
       WHERE m.conversation_id = $1 AND m.is_deleted = false
       ORDER BY m.whatsapp_timestamp ASC
       LIMIT 100`,
      [conv.id],
    );

    return reply.send({
      conversationId: conv.id,
      messages: rows.map((m: any) => ({
        id: m.id,
        senderType: m.sender_type,
        messageType: m.message_type,
        body: m.body,
        timestamp: m.whatsapp_timestamp,
        mediaUrl: m.media_url,
        mediaMimeType: m.media_mime_type,
        transcription: m.transcription,
        quotedMessageId: m.quoted_message_id,
        pendingSuggestions: parseInt(m.pending_suggestions, 10),
      })),
    });
  });
}
