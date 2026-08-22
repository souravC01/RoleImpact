ALTER TABLE organizations
    DROP CONSTRAINT IF EXISTS ck_organizations_public_code_format;

ALTER TABLE organizations
    ADD CONSTRAINT ck_organizations_public_code_format
        CHECK (
            public_code ~ '^[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{16}$'
            OR public_code ~ '^[A-HJ-NP-Z2-9]{3}-[A-F0-9]{32}$'
        );
