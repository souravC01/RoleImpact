CREATE TABLE organizations (
    id UUID PRIMARY KEY,
    slug VARCHAR(80) NOT NULL UNIQUE,
    name VARCHAR(160) NOT NULL,
    current_version INTEGER NOT NULL CHECK (current_version > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE teams (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name VARCHAR(120) NOT NULL,
    department VARCHAR(120) NOT NULL,
    manager_employee_id UUID,
    CONSTRAINT uq_teams_organization_name UNIQUE (organization_id, name)
);

CREATE TABLE employees (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    team_id UUID NOT NULL REFERENCES teams(id),
    employee_no VARCHAR(40) NOT NULL UNIQUE,
    name VARCHAR(160) NOT NULL,
    email VARCHAR(254) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE')),
    region VARCHAR(30) NOT NULL CHECK (region IN ('NORTH_AMERICA', 'EUROPE', 'ASIA_PACIFIC')),
    shift VARCHAR(20) NOT NULL CHECK (shift IN ('DAY', 'EVENING', 'NIGHT'))
);

ALTER TABLE teams
    ADD CONSTRAINT fk_teams_manager_employee
    FOREIGN KEY (manager_employee_id) REFERENCES employees(id);

CREATE TABLE roles (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name VARCHAR(120) NOT NULL,
    description TEXT NOT NULL,
    sensitivity VARCHAR(20) NOT NULL CHECK (sensitivity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    owner_employee_id UUID REFERENCES employees(id),
    CONSTRAINT uq_roles_organization_name UNIQUE (organization_id, name)
);

CREATE TABLE employee_roles (
    employee_id UUID NOT NULL REFERENCES employees(id),
    role_id UUID NOT NULL REFERENCES roles(id),
    assigned_at TIMESTAMPTZ NOT NULL,
    assigned_by VARCHAR(160) NOT NULL,
    PRIMARY KEY (employee_id, role_id)
);

CREATE TABLE applications (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name VARCHAR(120) NOT NULL,
    category VARCHAR(80) NOT NULL,
    owner_employee_id UUID REFERENCES employees(id),
    CONSTRAINT uq_applications_organization_name UNIQUE (organization_id, name)
);

CREATE TABLE resources (
    id UUID PRIMARY KEY,
    application_id UUID NOT NULL REFERENCES applications(id),
    name VARCHAR(140) NOT NULL,
    resource_type VARCHAR(80) NOT NULL,
    CONSTRAINT uq_resources_application_name UNIQUE (application_id, name),
    CONSTRAINT uq_resources_id_application UNIQUE (id, application_id)
);

CREATE TABLE permissions (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    application_id UUID NOT NULL REFERENCES applications(id),
    resource_id UUID NOT NULL,
    action VARCHAR(120) NOT NULL,
    sensitivity VARCHAR(20) NOT NULL CHECK (sensitivity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    CONSTRAINT fk_permissions_resource_application
        FOREIGN KEY (resource_id, application_id) REFERENCES resources(id, application_id),
    CONSTRAINT uq_permissions_application_resource_action UNIQUE (application_id, resource_id, action)
);

CREATE TABLE role_permissions (
    role_id UUID NOT NULL REFERENCES roles(id),
    permission_id UUID NOT NULL REFERENCES permissions(id),
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE capabilities (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name VARCHAR(160) NOT NULL,
    description TEXT NOT NULL,
    CONSTRAINT uq_capabilities_organization_name UNIQUE (organization_id, name)
);

CREATE TABLE capability_permissions (
    capability_id UUID NOT NULL REFERENCES capabilities(id),
    permission_id UUID NOT NULL REFERENCES permissions(id),
    PRIMARY KEY (capability_id, permission_id)
);

CREATE TABLE workflows (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name VARCHAR(160) NOT NULL,
    criticality VARCHAR(20) NOT NULL CHECK (criticality IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
    owner_employee_id UUID REFERENCES employees(id),
    CONSTRAINT uq_workflows_organization_name UNIQUE (organization_id, name)
);

CREATE TABLE workflow_steps (
    id UUID PRIMARY KEY,
    workflow_id UUID NOT NULL REFERENCES workflows(id),
    step_key VARCHAR(80) NOT NULL,
    name VARCHAR(160) NOT NULL,
    position INTEGER NOT NULL CHECK (position > 0),
    required_capability_id UUID NOT NULL REFERENCES capabilities(id),
    minimum_actors INTEGER NOT NULL CHECK (minimum_actors > 0),
    resilience_target INTEGER NOT NULL,
    required_department VARCHAR(120),
    required_region VARCHAR(30) CHECK (required_region IS NULL OR required_region IN ('NORTH_AMERICA', 'EUROPE', 'ASIA_PACIFIC')),
    required_shift VARCHAR(20) CHECK (required_shift IS NULL OR required_shift IN ('DAY', 'EVENING', 'NIGHT')),
    required_application_id UUID REFERENCES applications(id),
    CONSTRAINT ck_workflow_steps_resilience CHECK (resilience_target >= minimum_actors),
    CONSTRAINT uq_workflow_steps_key UNIQUE (workflow_id, step_key),
    CONSTRAINT uq_workflow_steps_position UNIQUE (workflow_id, position)
);

CREATE TABLE workflow_constraints (
    id UUID PRIMARY KEY,
    workflow_id UUID NOT NULL REFERENCES workflows(id),
    type VARCHAR(40) NOT NULL CHECK (type IN ('SOD', 'EXCLUDE_EMPLOYEE', 'DIFFERENT_ACTORS')),
    parameters JSONB NOT NULL,
    CONSTRAINT ck_workflow_constraints_parameters_object CHECK (jsonb_typeof(parameters) = 'object')
);

CREATE TABLE workflow_step_constraints (
    workflow_step_id UUID NOT NULL REFERENCES workflow_steps(id),
    constraint_id UUID NOT NULL REFERENCES workflow_constraints(id),
    PRIMARY KEY (workflow_step_id, constraint_id)
);

CREATE TABLE organization_versions (
    organization_id UUID NOT NULL REFERENCES organizations(id),
    version INTEGER NOT NULL CHECK (version > 0),
    content_hash CHAR(64) NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (organization_id, version)
);

CREATE TABLE simulations (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    parent_simulation_id UUID REFERENCES simulations(id),
    baseline_version INTEGER NOT NULL CHECK (baseline_version > 0),
    engine_version VARCHAR(40) NOT NULL,
    idempotency_key VARCHAR(160),
    request_hash CHAR(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
    change_type VARCHAR(40) NOT NULL CHECK (change_type IN ('OFFBOARD_EMPLOYEE', 'REVOKE_EMPLOYEE_ROLE', 'REMOVE_ROLE_PERMISSION')),
    change_payload JSONB NOT NULL,
    result_status VARCHAR(20) NOT NULL CHECK (result_status IN ('COMPLETE', 'INCONCLUSIVE')),
    result_payload JSONB NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NONE')),
    name VARCHAR(180),
    reviewer_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT fk_simulations_baseline_version
        FOREIGN KEY (organization_id, baseline_version)
        REFERENCES organization_versions(organization_id, version),
    CONSTRAINT uq_simulations_idempotency UNIQUE (organization_id, idempotency_key),
    CONSTRAINT ck_simulations_parent_not_self CHECK (parent_simulation_id IS NULL OR parent_simulation_id <> id),
    CONSTRAINT ck_simulations_change_schema_version CHECK (change_payload ? 'schemaVersion'),
    CONSTRAINT ck_simulations_result_schema_version CHECK (result_payload ? 'schemaVersion'),
    CONSTRAINT ck_simulations_completion_order CHECK (completed_at >= created_at)
);

CREATE OR REPLACE FUNCTION enforce_simulation_immutability()
RETURNS TRIGGER AS $$
BEGIN
    IF (to_jsonb(NEW) - ARRAY['name', 'reviewer_notes'])
        IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['name', 'reviewer_notes']) THEN
        RAISE EXCEPTION 'Simulation inputs and results are immutable';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_simulations_immutable
BEFORE UPDATE ON simulations
FOR EACH ROW EXECUTE FUNCTION enforce_simulation_immutability();

CREATE INDEX idx_teams_organization_id ON teams(organization_id);
CREATE INDEX idx_teams_manager_employee_id ON teams(manager_employee_id);
CREATE INDEX idx_employees_team_id ON employees(team_id);
CREATE INDEX idx_employees_organization_status ON employees(organization_id, status);
CREATE INDEX idx_roles_organization_id ON roles(organization_id);
CREATE INDEX idx_roles_owner_employee_id ON roles(owner_employee_id);
CREATE INDEX idx_employee_roles_role_employee ON employee_roles(role_id, employee_id);
CREATE INDEX idx_applications_organization_id ON applications(organization_id);
CREATE INDEX idx_applications_owner_employee_id ON applications(owner_employee_id);
CREATE INDEX idx_resources_application_id ON resources(application_id);
CREATE INDEX idx_permissions_organization_id ON permissions(organization_id);
CREATE INDEX idx_permissions_application_id ON permissions(application_id);
CREATE INDEX idx_permissions_resource_id ON permissions(resource_id);
CREATE INDEX idx_role_permissions_permission_role ON role_permissions(permission_id, role_id);
CREATE INDEX idx_capabilities_organization_id ON capabilities(organization_id);
CREATE INDEX idx_capability_permissions_permission_id ON capability_permissions(permission_id);
CREATE INDEX idx_workflows_organization_id ON workflows(organization_id);
CREATE INDEX idx_workflows_owner_employee_id ON workflows(owner_employee_id);
CREATE INDEX idx_workflow_steps_workflow_id ON workflow_steps(workflow_id);
CREATE INDEX idx_workflow_steps_required_capability_id ON workflow_steps(required_capability_id);
CREATE INDEX idx_workflow_steps_required_application_id ON workflow_steps(required_application_id);
CREATE INDEX idx_workflow_constraints_workflow_id ON workflow_constraints(workflow_id);
CREATE INDEX idx_workflow_step_constraints_constraint_id ON workflow_step_constraints(constraint_id);
CREATE INDEX idx_simulations_organization_created_at ON simulations(organization_id, created_at DESC);
CREATE INDEX idx_simulations_parent_simulation_id ON simulations(parent_simulation_id);
