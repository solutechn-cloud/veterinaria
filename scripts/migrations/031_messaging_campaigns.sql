CREATE TABLE IF NOT EXISTS messaging_campaigns (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(180) NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    audience_type VARCHAR(40) NOT NULL DEFAULT 'all_tutors',
    status VARCHAR(30) NOT NULL DEFAULT 'draft',
    total_recipients INTEGER NOT NULL DEFAULT 0,
    sent_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    skipped_count INTEGER NOT NULL DEFAULT 0,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by VARCHAR(80),
    sent_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (audience_type IN ('all_tutors', 'active_patients', 'recent_tutors')),
    CHECK (status IN ('draft', 'sending', 'sent', 'failed', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS messaging_campaign_recipients (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    campaign_id BIGINT NOT NULL REFERENCES messaging_campaigns(id) ON DELETE CASCADE,
    cliente_id VARCHAR(20),
    recipient_email VARCHAR(255) NOT NULL,
    recipient_name VARCHAR(180),
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    message_id BIGINT REFERENCES messaging_messages(id) ON DELETE SET NULL,
    error TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
    UNIQUE (campaign_id, recipient_email)
);

CREATE INDEX IF NOT EXISTS idx_messaging_campaigns_tenant_created
    ON messaging_campaigns(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messaging_campaign_recipients_campaign
    ON messaging_campaign_recipients(tenant_id, campaign_id, status);

ALTER TABLE messaging_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE messaging_campaigns FORCE ROW LEVEL SECURITY;
ALTER TABLE messaging_campaign_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE messaging_campaign_recipients FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_messaging_campaigns ON messaging_campaigns;
CREATE POLICY tenant_isolation_messaging_campaigns ON messaging_campaigns
    USING (rls_bypass_active() OR tenant_id = current_tenant_id())
    WITH CHECK (rls_bypass_active() OR tenant_id = current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_messaging_campaign_recipients ON messaging_campaign_recipients;
CREATE POLICY tenant_isolation_messaging_campaign_recipients ON messaging_campaign_recipients
    USING (rls_bypass_active() OR tenant_id = current_tenant_id())
    WITH CHECK (rls_bypass_active() OR tenant_id = current_tenant_id());
