-- users
CREATE INDEX idx_users_email ON users(email);

-- whatsapp_instances
CREATE INDEX idx_whatsapp_instances_user_id ON whatsapp_instances(user_id);
CREATE INDEX idx_whatsapp_instances_status ON whatsapp_instances(status);

-- contacts
CREATE INDEX idx_contacts_user_id ON contacts(user_id);
CREATE INDEX idx_contacts_last_message_at ON contacts(last_message_at DESC NULLS LAST);

-- relationships
CREATE INDEX idx_relationships_user_id ON relationships(user_id);
CREATE INDEX idx_relationships_contact_id ON relationships(contact_id);
CREATE INDEX idx_relationships_health_score ON relationships(health_score);
CREATE INDEX idx_relationships_importance_tier ON relationships(importance_tier);

-- relationship_health_logs
CREATE INDEX idx_relationship_health_logs_relationship_id ON relationship_health_logs(relationship_id);
CREATE INDEX idx_relationship_health_logs_logged_at ON relationship_health_logs(logged_at DESC);

-- conversations
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_contact_id ON conversations(contact_id);
CREATE INDEX idx_conversations_last_message_at ON conversations(last_message_at DESC NULLS LAST);

-- messages
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_whatsapp_timestamp ON messages(whatsapp_timestamp DESC);
CREATE INDEX idx_messages_sender_type ON messages(sender_type);

-- message_analyses
CREATE INDEX idx_message_analyses_message_id ON message_analyses(message_id);
CREATE INDEX idx_message_analyses_sentiment ON message_analyses(sentiment);
CREATE INDEX idx_message_analyses_requires_response ON message_analyses(requires_response) WHERE requires_response = TRUE;
CREATE INDEX idx_message_analyses_embedding ON message_analyses USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- contact_insights
CREATE INDEX idx_contact_insights_contact_id ON contact_insights(contact_id);
CREATE INDEX idx_contact_insights_is_active ON contact_insights(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_contact_insights_key ON contact_insights(insight_key);

-- context_snapshots
CREATE INDEX idx_context_snapshots_contact_id ON context_snapshots(contact_id);
CREATE INDEX idx_context_snapshots_is_current ON context_snapshots(is_current) WHERE is_current = TRUE;
CREATE INDEX idx_context_snapshots_embedding ON context_snapshots USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- events
CREATE INDEX idx_events_user_id ON events(user_id);
CREATE INDEX idx_events_contact_id ON events(contact_id);
CREATE INDEX idx_events_event_date ON events(event_date);
CREATE INDEX idx_events_is_confirmed ON events(is_confirmed);

-- proactive_queue
CREATE INDEX idx_proactive_queue_user_id ON proactive_queue(user_id);
CREATE INDEX idx_proactive_queue_status ON proactive_queue(status);
CREATE INDEX idx_proactive_queue_suggested_for_date ON proactive_queue(suggested_for_date);

-- calendar_events
CREATE INDEX idx_calendar_events_user_id ON calendar_events(user_id);
CREATE INDEX idx_calendar_events_start_time ON calendar_events(start_time);

-- calendar_reminders
CREATE INDEX idx_calendar_reminders_remind_at ON calendar_reminders(remind_at) WHERE is_sent = FALSE;

-- notifications
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read) WHERE is_read = FALSE;
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);
