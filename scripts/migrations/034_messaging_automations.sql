CREATE TABLE IF NOT EXISTS messaging_automation_rules (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(180) NOT NULL,
    audience_type VARCHAR(40) NOT NULL DEFAULT 'all_tutors',
    template_id BIGINT NOT NULL REFERENCES messaging_templates(id) ON DELETE RESTRICT,
    frequency VARCHAR(20) NOT NULL DEFAULT 'weekly',
    run_time TIME NOT NULL DEFAULT '08:00',
    day_of_week SMALLINT,
    day_of_month SMALLINT,
    send_mode VARCHAR(20) NOT NULL DEFAULT 'schedule',
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    created_by VARCHAR(80),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (frequency IN ('daily', 'weekly', 'monthly')),
    CHECK (send_mode IN ('schedule', 'send_now')),
    CHECK (status IN ('active', 'paused', 'archived')),
    CHECK (day_of_week IS NULL OR day_of_week BETWEEN 0 AND 6),
    CHECK (day_of_month IS NULL OR day_of_month BETWEEN 1 AND 31)
);

CREATE TABLE IF NOT EXISTS messaging_automation_runs (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    automation_id BIGINT NOT NULL REFERENCES messaging_automation_rules(id) ON DELETE CASCADE,
    campaign_id BIGINT REFERENCES messaging_campaigns(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'running',
    recipients_count INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    CHECK (status IN ('running', 'completed', 'failed', 'skipped'))
);

CREATE INDEX IF NOT EXISTS idx_messaging_automation_rules_due
    ON messaging_automation_rules(tenant_id, status, next_run_at)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_messaging_automation_runs_rule
    ON messaging_automation_runs(tenant_id, automation_id, started_at DESC);

ALTER TABLE messaging_automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE messaging_automation_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE messaging_automation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE messaging_automation_runs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_messaging_automation_rules ON messaging_automation_rules;
CREATE POLICY tenant_isolation_messaging_automation_rules ON messaging_automation_rules
    USING (rls_bypass_active() OR tenant_id = current_tenant_id())
    WITH CHECK (rls_bypass_active() OR tenant_id = current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_messaging_automation_runs ON messaging_automation_runs;
CREATE POLICY tenant_isolation_messaging_automation_runs ON messaging_automation_runs
    USING (rls_bypass_active() OR tenant_id = current_tenant_id())
    WITH CHECK (rls_bypass_active() OR tenant_id = current_tenant_id());
