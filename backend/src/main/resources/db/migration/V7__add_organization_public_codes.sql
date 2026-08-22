ALTER TABLE organizations ADD COLUMN public_code VARCHAR(10);

CREATE FUNCTION pg_temp.encode_workspace_number(value BIGINT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    alphabet CONSTANT TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    encoded TEXT := '';
    remainder INTEGER;
BEGIN
    FOR position IN 1..6 LOOP
        remainder := MOD(value, 32);
        encoded := SUBSTRING(alphabet FROM remainder + 1 FOR 1) || encoded;
        value := value / 32;
    END LOOP;
    RETURN encoded;
END;
$$;

WITH ranked_organizations AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS code_number
    FROM organizations
)
UPDATE organizations organization
SET public_code = RPAD(
        SUBSTRING(
            TRANSLATE(
                COALESCE(NULLIF(UPPER(REGEXP_REPLACE(organization.name, '[^A-Za-z0-9]', '', 'g')), ''), 'ORG'),
                'OI01',
                'QJ23'
            )
            FROM 1 FOR 3
        ),
        3,
        'X'
    ) || '-' || pg_temp.encode_workspace_number(ranked.code_number)
FROM ranked_organizations ranked
WHERE ranked.id = organization.id;

ALTER TABLE organizations
    ALTER COLUMN public_code SET NOT NULL,
    ADD CONSTRAINT ck_organizations_public_code_format
        CHECK (public_code ~ '^[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{6}$');

CREATE UNIQUE INDEX uq_organizations_public_code_ci
    ON organizations (UPPER(public_code));

DROP INDEX IF EXISTS idx_organizations_source_template;

ALTER TABLE organizations
    DROP CONSTRAINT IF EXISTS ck_organizations_not_own_template,
    DROP COLUMN source_template_organization_id;
