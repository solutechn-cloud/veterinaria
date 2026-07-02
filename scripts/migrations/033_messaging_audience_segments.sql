DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    IF to_regclass('public.messaging_campaigns') IS NULL THEN
        RETURN;
    END IF;

    SELECT conname
      INTO constraint_name
      FROM pg_constraint
     WHERE conrelid = 'public.messaging_campaigns'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%audience_type%'
     LIMIT 1;

    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE messaging_campaigns DROP CONSTRAINT %I', constraint_name);
    END IF;

    ALTER TABLE messaging_campaigns
        ADD CONSTRAINT messaging_campaigns_audience_type_check CHECK (
            audience_type IN (
                'all_tutors',
                'active_patients',
                'recent_tutors',
                'appointment_upcoming',
                'appointment_tomorrow',
                'vaccines_due',
                'vaccines_next_30',
                'inactive_tutors',
                'species_canine',
                'species_feline'
            )
        );
END $$;

DO $$
BEGIN
    IF to_regclass('public.citas') IS NOT NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_citas_tenant_tutor_fecha_estado ON citas(tenant_id, id_tutor, fecha_inicio, estado)';
    END IF;

    IF to_regclass('public.pacientes') IS NOT NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_pacientes_tenant_tutor_especie_estado ON pacientes(tenant_id, id_tutor, especie, estado)';
    END IF;

    IF to_regclass('public.vacunas_aplicadas') IS NOT NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_vacunas_tenant_paciente_proxima ON vacunas_aplicadas(tenant_id, id_paciente, proxima_dosis)';
    END IF;
END $$;
