CREATE INDEX idx_permissions_resource_application
    ON permissions(resource_id, application_id);

CREATE INDEX idx_simulations_organization_baseline_version
    ON simulations(organization_id, baseline_version);
