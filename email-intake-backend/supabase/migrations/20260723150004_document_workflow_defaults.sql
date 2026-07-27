create or replace function public.apply_document_workflow_defaults()
returns trigger
language plpgsql
as $$
begin
    new.received_at := coalesce(new.received_at, new.created_at, now());
    new.extraction_status := coalesce(
        new.extraction_status,
        case
            when new.email_id is null then 'not_received'
            else 'received_pending'
        end
    );
    new.pipeline_stage := coalesce(
        new.pipeline_stage,
        case
            when new.extraction_status = 'extracted'
                then 'extracted'
            else 'ingested'
        end
    );
    new.sla_due_at := coalesce(
        new.sla_due_at,
        coalesce(new.created_at, now()) + case new.priority
            when 'critical' then interval '4 hours'
            when 'high' then interval '1 day'
            when 'medium' then interval '2 days'
            else interval '3 days'
        end
    );
    return new;
end;
$$;

create trigger ap_document_workflow_defaults
before insert or update of priority
on public.ap_documents
for each row execute function public.apply_document_workflow_defaults();
