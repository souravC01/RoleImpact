ALTER TABLE organizations
    DROP CONSTRAINT IF EXISTS ck_organizations_public_code_format;

ALTER TABLE organizations
    ALTER COLUMN public_code TYPE VARCHAR(36);

UPDATE organizations
SET public_code = SUBSTRING(public_code FROM 1 FOR 3)
        || '-'
        || UPPER(MD5(gen_random_uuid()::TEXT || gen_random_uuid()::TEXT || id::TEXT));

ALTER TABLE organizations
    ADD CONSTRAINT ck_organizations_public_code_format
        CHECK (public_code ~ '^[A-HJ-NP-Z2-9]{3}-[A-F0-9]{32}$');
