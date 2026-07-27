create table public.document_match_records (
    id uuid primary key default gen_random_uuid(),
    document_chain_id uuid null
        references public.document_chains(id),
    invoice_document_id uuid not null
        references public.ap_documents(id),
    po_document_id uuid null
        references public.ap_documents(id),
    grn_document_id uuid null
        references public.ap_documents(id),
    validation_run_id uuid not null unique
        references public.validation_runs(id),
    invoice_number text null,
    po_number text null,
    grn_number text null,
    invoice_data jsonb null,
    po_data jsonb null,
    grn_data jsonb null,
    match_status_invoice_po text not null,
    match_status_invoice_grn text not null,
    match_status_po_grn text not null,
    overall_match_type text not null,
    overall_match_status text not null,
    exception_summary text null,
    ai_match_reason text null,
    ai_recommended_action text null,
    ai_decision_source text null,
    ai_model text null,
    ai_prompt_version text null,
    ai_confidence numeric null,
    ai_decided_at timestamptz null,
    engine_version text not null,
    is_current boolean not null default true,
    is_demo boolean not null default false,
    scenario_code text null,
    scenario_name text null,
    expected_match_type text null,
    expected_match_status text null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint document_match_records_invoice_po_status_check
        check (
            match_status_invoice_po in (
                'MATCHED',
                'VARIANCE',
                'UNMATCHED',
                'NOT_AVAILABLE',
                'NOT_APPLICABLE'
            )
        ),
    constraint document_match_records_invoice_grn_status_check
        check (
            match_status_invoice_grn in (
                'MATCHED',
                'VARIANCE',
                'UNMATCHED',
                'NOT_AVAILABLE',
                'NOT_APPLICABLE'
            )
        ),
    constraint document_match_records_po_grn_status_check
        check (
            match_status_po_grn in (
                'MATCHED',
                'VARIANCE',
                'UNMATCHED',
                'NOT_AVAILABLE',
                'NOT_APPLICABLE'
            )
        ),
    constraint document_match_records_match_type_check
        check (
            overall_match_type in (
                'UNMATCHED',
                '2_WAY',
                '3_WAY'
            )
        ),
    constraint document_match_records_match_status_check
        check (
            overall_match_status in (
                'MATCHED',
                'VARIANCE',
                'UNMATCHED'
            )
        )
);

create unique index document_match_records_one_current_invoice
    on public.document_match_records(invoice_document_id)
    where is_current;

create index document_match_records_chain_idx
    on public.document_match_records(document_chain_id);

create or replace function public.set_document_match_record_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger document_match_records_set_updated_at
before update on public.document_match_records
for each row
execute function public.set_document_match_record_updated_at();

alter table public.document_match_records enable row level security;

create policy document_match_records_anon_select
on public.document_match_records
for select
to anon
using (true);

grant select on public.document_match_records to anon;
revoke insert, update, delete, truncate, references, trigger
    on public.document_match_records from anon;

create or replace view public.current_match_results
with (security_invoker = true)
as
select
    dmr.invoice_document_id as document_id,
    dmr.validation_run_id,
    dmr.overall_match_type as match_type,
    dmr.overall_match_status as match_status,
    dmr.engine_version,
    dmr.created_at as matched_at,
    count(vres.id) filter (
        where vres.check_status = 'FAIL'
    ) as failed_check_count,
    count(vres.id) filter (
        where vres.check_status = 'NOT_AVAILABLE'
    ) as unavailable_check_count,
    dmr.match_status_invoice_po,
    dmr.match_status_invoice_grn,
    dmr.match_status_po_grn,
    dmr.exception_summary,
    dmr.ai_match_reason,
    dmr.ai_recommended_action,
    dmr.ai_decision_source as match_reason_source,
    dmr.scenario_code,
    dmr.scenario_name
from public.document_match_records dmr
left join public.validation_results vres
    on vres.validation_run_id = dmr.validation_run_id
   and vres.is_current
where dmr.is_current
group by dmr.id;

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
    cmr.unavailable_check_count,
    cmr.match_status_invoice_po,
    cmr.match_status_invoice_grn,
    cmr.match_status_po_grn,
    cmr.exception_summary as match_exception_summary,
    cmr.ai_match_reason,
    cmr.ai_recommended_action as match_recommended_action,
    cmr.match_reason_source,
    cmr.scenario_code,
    cmr.scenario_name
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

create or replace view public.invoice_match_review_view
with (security_invoker = true)
as
select
    invoice_document.id as document_id,
    ih.id as invoice_header_id,
    dmr.invoice_number,
    dmr.po_number,
    invoice_document.attachment_id as invoice_attachment_id,
    invoice_attachment.filename as invoice_filename,
    invoice_attachment.storage_bucket as invoice_storage_bucket,
    invoice_attachment.storage_path as invoice_storage_path,
    (invoice_object.id is not null) as invoice_document_exists,
    dmr.po_document_id as reference_po_id,
    po_attachment.filename as po_filename,
    po_attachment.storage_bucket as po_storage_bucket,
    po_attachment.storage_path as po_storage_path,
    (po_object.id is not null) as po_document_exists,
    dmr.grn_document_id as reference_grn_id,
    dmr.grn_number,
    grn_attachment.filename as grn_filename,
    grn_attachment.storage_bucket as grn_storage_bucket,
    grn_attachment.storage_path as grn_storage_path,
    (grn_object.id is not null) as grn_document_exists,
    dmr.validation_run_id,
    dmr.overall_match_type as match_type,
    dmr.overall_match_status as match_status,
    dmr.match_status_invoice_po as two_way_status,
    case
        when dmr.overall_match_type = '3_WAY'
        then dmr.overall_match_status
        else null
    end as three_way_status,
    (
        coalesce(cmr.failed_check_count, 0)
        + coalesce(cmr.unavailable_check_count, 0)
    )::integer as exception_count,
    dmr.exception_summary,
    dmr.match_status_invoice_po,
    dmr.match_status_invoice_grn,
    dmr.match_status_po_grn,
    dmr.ai_match_reason,
    dmr.ai_recommended_action,
    dmr.ai_decision_source as match_reason_source,
    dmr.ai_model,
    dmr.ai_prompt_version,
    dmr.ai_confidence,
    dmr.scenario_code,
    dmr.scenario_name,
    dmr.expected_match_type,
    dmr.expected_match_status,
    dmr.invoice_data,
    dmr.po_data,
    dmr.grn_data
from public.document_match_records dmr
join public.ap_documents invoice_document
    on invoice_document.id = dmr.invoice_document_id
join public.invoice_headers ih
    on ih.document_id = invoice_document.id
left join public.email_attachments invoice_attachment
    on invoice_attachment.id = invoice_document.attachment_id
left join storage.objects invoice_object
    on invoice_object.bucket_id = invoice_attachment.storage_bucket
   and invoice_object.name = invoice_attachment.storage_path
left join public.ap_documents po_document
    on po_document.id = dmr.po_document_id
left join public.email_attachments po_attachment
    on po_attachment.id = po_document.attachment_id
left join storage.objects po_object
    on po_object.bucket_id = po_attachment.storage_bucket
   and po_object.name = po_attachment.storage_path
left join public.ap_documents grn_document
    on grn_document.id = dmr.grn_document_id
left join public.email_attachments grn_attachment
    on grn_attachment.id = grn_document.attachment_id
left join storage.objects grn_object
    on grn_object.bucket_id = grn_attachment.storage_bucket
   and grn_object.name = grn_attachment.storage_path
left join public.current_match_results cmr
    on cmr.document_id = dmr.invoice_document_id
where dmr.is_current;

grant select on public.current_match_results to anon;
grant select on public.document_ui_view to anon;
grant select on public.invoice_match_review_view to anon;

comment on table public.document_match_records is
    'Immutable per-run real-chain matching snapshots for the UI and audit.';
comment on column public.document_match_records.ai_match_reason is
    'OCI-generated explanation of the deterministic match result.';
