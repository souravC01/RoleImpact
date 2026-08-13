ALTER TABLE organizations
    ADD COLUMN workspace_status VARCHAR(20) NOT NULL DEFAULT 'PUBLISHED',
    ADD COLUMN source_template_organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE organizations
    DROP CONSTRAINT organizations_current_version_check;

ALTER TABLE organizations
    ADD CONSTRAINT ck_organizations_current_version CHECK (current_version >= 0),
    ADD CONSTRAINT ck_organizations_workspace_status CHECK (
        workspace_status IN ('DRAFT', 'PUBLISHED')
    ),
    ADD CONSTRAINT ck_organizations_lifecycle_version CHECK (
        (workspace_status = 'DRAFT' AND current_version = 0)
        OR (workspace_status = 'PUBLISHED' AND current_version > 0)
    ),
    ADD CONSTRAINT ck_organizations_not_own_template CHECK (
        source_template_organization_id IS NULL OR source_template_organization_id <> id
    );

ALTER TABLE employees
    DROP CONSTRAINT employees_employee_no_key,
    DROP CONSTRAINT employees_email_key;

ALTER TABLE employees
    ADD CONSTRAINT uq_employees_organization_employee_no UNIQUE (organization_id, employee_no),
    ADD CONSTRAINT uq_employees_organization_email UNIQUE (organization_id, email);

CREATE INDEX idx_organizations_workspace_status ON organizations(workspace_status);
CREATE INDEX idx_organizations_source_template ON organizations(source_template_organization_id);
