alter table public.suppliers
    add column if not exists address text null;

alter table public.email_attachments
    add column if not exists storage_bucket text null
        default 'ap-email-attachments';

alter table public.ap_documents
    add column if not exists extraction_status text null,
    add column if not exists received_at timestamptz null,
    add column if not exists pipeline_stage text null;

alter table public.ap_documents
    add constraint ap_documents_extraction_status_check
    check (
        extraction_status is null
        or extraction_status in (
            'not_received',
            'received_pending',
            'extracted',
            'extraction_failed'
        )
    ),
    add constraint ap_documents_pipeline_stage_check
    check (
        pipeline_stage is null
        or pipeline_stage in (
            'ingested',
            'extracted',
            'matched',
            'exception',
            'approved',
            'posted'
        )
    );

create table public.document_chains (
    id uuid primary key default gen_random_uuid(),
    transaction_key text not null unique,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.ap_documents
    add column document_chain_id uuid null
        references public.document_chains(id);

create index ap_documents_document_chain_idx
    on public.ap_documents(document_chain_id);

create or replace function public.normalized_transaction_key(
    raw_value text
) returns text
language sql
immutable
as $$
    select case
        when raw_value is null then null
        when lower(btrim(raw_value)) in (
            '', 'no', 'number', 'none', 'n/a', 'na', 'null'
        ) then null
        when length(
            regexp_replace(
                upper(btrim(raw_value)),
                '[^A-Z0-9]',
                '',
                'g'
            )
        ) not between 4 and 40 then null
        else regexp_replace(
            upper(btrim(raw_value)),
            '[^A-Z0-9]',
            '',
            'g'
        )
    end
$$;

create or replace function public.refresh_document_chain(
    target_document_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    chain_key text;
    chain_id uuid;
begin
    select public.normalized_transaction_key(
        coalesce(
            ih.po_number,
            em.ai_understanding->'header'->>'po_number',
            case
                when ad.document_type = 'purchase_order'
                then em.ai_understanding->>'document_number'
                else null
            end
        )
    )
    into chain_key
    from public.ap_documents ad
    left join public.invoice_headers ih
        on ih.document_id = ad.id
    left join public.email_messages em
        on em.id = ad.email_id
    where ad.id = target_document_id;

    if chain_key is null then
        update public.ap_documents
        set document_chain_id = null
        where id = target_document_id;
        return null;
    end if;

    insert into public.document_chains(transaction_key)
    values (chain_key)
    on conflict (transaction_key)
    do update set updated_at = now()
    returning id into chain_id;

    update public.ap_documents
    set document_chain_id = chain_id
    where id = target_document_id;

    return chain_id;
end;
$$;

create or replace function public.refresh_chain_from_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    perform public.refresh_document_chain(new.document_id);
    return new;
end;
$$;

create trigger invoice_header_refresh_document_chain
after insert or update of po_number on public.invoice_headers
for each row execute function public.refresh_chain_from_invoice();

create or replace function public.refresh_chains_from_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    document_record record;
begin
    for document_record in
        select id
        from public.ap_documents
        where email_id = new.id
    loop
        perform public.refresh_document_chain(document_record.id);
    end loop;
    return new;
end;
$$;

create trigger email_refresh_document_chains
after update of ai_understanding on public.email_messages
for each row execute function public.refresh_chains_from_email();

update public.ap_documents
set document_type = case
    when lower(document_type) = 'invoice' then 'invoice'
    when lower(document_type) = 'credit memo' then 'credit_memo'
    when lower(document_type) in (
        'purchase order',
        'purchase_order'
    ) then 'purchase_order'
    when lower(document_type) in (
        'acknowledgement',
        'po acknowledgement'
    ) then 'acknowledgement'
    when lower(document_type) in (
        'grn',
        'delivery / grn evidence'
    ) then 'grn'
    when lower(document_type) = 'supplier statement'
        then 'supplier_statement'
    else 'other'
end;

update public.ap_documents ad
set
    received_at = coalesce(em.received_at, ad.created_at),
    extraction_status = case
        when lower(coalesce(
            em.ai_understanding->>'ai_status',
            em.ai_understanding->>'extraction_status',
            ''
        )) in ('failed', 'error', 'extraction_failed')
            then 'extraction_failed'
        when em.ai_understanding is not null
             and (
                em.ai_understanding ? 'header'
                or lower(coalesce(
                    em.ai_understanding->>'extraction_status',
                    ''
                )) in (
                    'completed',
                    'success',
                    'review_required',
                    'needs_review'
                )
             )
            then 'extracted'
        when ad.email_id is not null then 'received_pending'
        else 'not_received'
    end
from public.email_messages em
where em.id = ad.email_id;

update public.ap_documents
set
    received_at = coalesce(received_at, created_at),
    extraction_status = coalesce(
        extraction_status,
        case
            when email_id is null then 'not_received'
            else 'received_pending'
        end
    );

update public.ap_documents ad
set pipeline_stage = case
    when ad.posted_at is not null then 'posted'
    when exists (
        select 1 from public.approval_requests ar
        where ar.document_id = ad.id
          and lower(ar.status) in ('approved', 'completed')
    ) then 'approved'
    when exists (
        select 1 from public.validation_runs vr
        where vr.document_id = ad.id
          and vr.is_current
          and vr.outcome = 'MATCHED'
    ) then 'matched'
    when exists (
        select 1 from public.validation_runs vr
        where vr.document_id = ad.id
          and vr.is_current
          and vr.outcome in ('VARIANCE', 'UNMATCHED')
    ) or ad.stage = 'exception' then 'exception'
    when ad.extraction_status = 'extracted' then 'extracted'
    else 'ingested'
end;

update public.ap_documents
set
    stage = pipeline_stage,
    sla_due_at = coalesce(
        sla_due_at,
        created_at + case priority
            when 'critical' then interval '4 hours'
            when 'high' then interval '1 day'
            when 'medium' then interval '2 days'
            else interval '3 days'
        end
    );

update public.ap_documents
set sla_breached = (
    sla_due_at < now()
    and pipeline_stage not in ('approved', 'posted')
);

do $$
declare
    document_record record;
begin
    for document_record in
        select id from public.ap_documents
    loop
        perform public.refresh_document_chain(document_record.id);
    end loop;
end
$$;

create or replace view public.current_match_results
with (security_invoker = true)
as
select
    vr.document_id,
    vr.id as validation_run_id,
    vr.match_type,
    vr.outcome as match_status,
    vr.engine_version,
    vr.created_at as matched_at,
    count(vres.id) filter (
        where vres.check_status = 'FAIL'
    ) as failed_check_count,
    count(vres.id) filter (
        where vres.check_status = 'NOT_AVAILABLE'
    ) as unavailable_check_count
from public.validation_runs vr
left join public.validation_results vres
    on vres.validation_run_id = vr.id
   and vres.is_current
where vr.is_current
group by vr.id;

create or replace view public.document_ui_view
with (security_invoker = true)
as
select
    ad.id as document_id,
    ad.document_type,
    ad.document_chain_id,
    dc.transaction_key,
    ad.pipeline_stage,
    ad.extraction_status,
    ad.received_at,
    ad.priority,
    ad.ai_priority_reason,
    ad.recommended_action,
    ad.recommended_action_code,
    ad.ai_decision_source,
    ad.sla_due_at,
    (
        ad.sla_due_at < now()
        and ad.pipeline_stage not in ('approved', 'posted')
    ) as sla_breached,
    s.id as supplier_id,
    s.vendor_code,
    s.name as supplier_name,
    ea.id as attachment_id,
    ea.filename,
    ea.file_type,
    ea.storage_bucket,
    ea.storage_path,
    (so.id is not null) as storage_object_exists,
    cmr.match_type,
    cmr.match_status,
    cmr.failed_check_count,
    cmr.unavailable_check_count
from public.ap_documents ad
left join public.document_chains dc
    on dc.id = ad.document_chain_id
left join public.suppliers s
    on s.id = ad.supplier_id
left join public.email_attachments ea
    on ea.id = ad.attachment_id
left join storage.objects so
    on so.bucket_id = ea.storage_bucket
   and so.name = ea.storage_path
left join public.current_match_results cmr
    on cmr.document_id = ad.id;

create or replace view public.document_lifecycle_view
with (security_invoker = true)
as
with stages(stage_name, stage_order) as (
    values
        ('purchase_order'::text, 1),
        ('acknowledgement'::text, 2),
        ('grn'::text, 3),
        ('invoice'::text, 4)
)
select
    dc.id as document_chain_id,
    dc.transaction_key,
    stages.stage_name,
    stages.stage_order,
    member.document_id,
    coalesce(member.extraction_status, 'not_received')
        as extraction_status,
    member.received_at,
    member.filename,
    member.storage_bucket,
    member.storage_path,
    member.storage_object_exists,
    member.match_type,
    member.match_status
from public.document_chains dc
cross join stages
left join lateral (
    select
        duv.document_id,
        duv.extraction_status,
        duv.received_at,
        duv.filename,
        duv.storage_bucket,
        duv.storage_path,
        duv.storage_object_exists,
        duv.match_type,
        duv.match_status
    from public.document_ui_view duv
    where duv.document_chain_id = dc.id
      and duv.document_type = stages.stage_name
    order by duv.received_at desc nulls last
    limit 1
) member on true;

alter table public.document_chains enable row level security;

insert into public.approval_requests (
    document_id,
    approval_reason,
    ai_risk_summary,
    status,
    assigned_to
)
select
    vr.document_id,
    'Matched invoice ready for approval',
    ad.ai_priority_reason,
    'pending',
    null
from public.validation_runs vr
join public.ap_documents ad on ad.id = vr.document_id
where vr.is_current
  and vr.outcome = 'MATCHED'
  and not exists (
      select 1 from public.approval_requests ar
      where ar.document_id = vr.document_id
        and ar.status = 'pending'
  )
limit 1;
