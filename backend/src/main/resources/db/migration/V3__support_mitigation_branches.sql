ALTER TABLE simulations
    ALTER COLUMN change_type TYPE VARCHAR(64);

ALTER TABLE simulations
    DROP CONSTRAINT simulations_change_type_check;

ALTER TABLE simulations
    ADD CONSTRAINT ck_simulations_change_type CHECK (
        change_type IN (
            'OFFBOARD_EMPLOYEE',
            'REVOKE_EMPLOYEE_ROLE',
            'REMOVE_ROLE_PERMISSION',
            'REVOKE_EMPLOYEE_ROLE_AND_ASSIGN_REPLACEMENT'
        )
    );
