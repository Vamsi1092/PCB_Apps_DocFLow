alter table public.reference_purchase_orders
    add column document_filename text null,
    add column document_storage_bucket text null,
    add column document_storage_path text null;

alter table public.reference_goods_receipts
    add column document_filename text null,
    add column document_storage_bucket text null,
    add column document_storage_path text null;

alter table public.validation_runs
    add column two_way_status text null,
    add column three_way_status text null,
    add column exception_summary text null,
    add column exception_count integer not null default 0;

alter table public.validation_runs
    add constraint validation_runs_two_way_status_check
        check (
            two_way_status is null
            or two_way_status in ('MATCHED', 'VARIANCE', 'UNMATCHED')
        ),
    add constraint validation_runs_three_way_status_check
        check (
            three_way_status is null
            or three_way_status in ('MATCHED', 'VARIANCE', 'UNMATCHED')
        );

alter table public.exception_cases
    add column validation_run_id uuid null
        references public.validation_runs(id);

create unique index exception_cases_one_per_validation_run
    on public.exception_cases(validation_run_id)
    where validation_run_id is not null;

with statuses as (
    select
        vr.id,
        case
            when vr.match_type = 'UNMATCHED' then 'UNMATCHED'
            when bool_or(
                vres.check_status in ('FAIL', 'NOT_AVAILABLE')
            ) filter (
                where vres.check_type not like 'three_way_%'
                  and vres.check_type <> 'grn_exists'
            ) then 'VARIANCE'
            else 'MATCHED'
        end as two_way_status,
        case
            when vr.match_type = '3_WAY' then vr.outcome
            else null
        end as three_way_status,
        count(*) filter (
            where vres.check_status in ('FAIL', 'NOT_AVAILABLE')
        ) as exception_count,
        string_agg(
            distinct replace(vres.check_type, '_', ' '),
            ', '
            order by replace(vres.check_type, '_', ' ')
        ) filter (
            where vres.check_status in ('FAIL', 'NOT_AVAILABLE')
        ) as problem_list
    from public.validation_runs vr
    left join public.validation_results vres
        on vres.validation_run_id = vr.id
       and vres.is_current
    group by vr.id
)
update public.validation_runs vr
set
    two_way_status = statuses.two_way_status,
    three_way_status = statuses.three_way_status,
    exception_count = statuses.exception_count,
    exception_summary = case
        when statuses.exception_count > 0
        then 'Review required: ' || statuses.problem_list || '.'
        else null
    end
from statuses
where statuses.id = vr.id;

insert into public.exception_cases (
    document_id,
    validation_run_id,
    exception_type,
    severity,
    reason,
    suggested_correction,
    status
)
select
    vr.document_id,
    vr.id,
    'MATCH_VARIANCE',
    'high',
    vr.exception_summary,
    'Review failed or unavailable matching checks, correct the source data, and rerun matching.',
    'open'
from public.validation_runs vr
where vr.is_current
  and vr.outcome = 'VARIANCE'
  and not exists (
      select 1
      from public.exception_cases ec
      where ec.validation_run_id = vr.id
  );

update public.reference_purchase_orders
set source_system = 'POC_GENERATED'
where notes = 'AI Generated Reference PO';

update public.reference_goods_receipts
set source_system = 'POC_GENERATED'
where notes = 'AI Generated Reference GRN';

create or replace view public.invoice_match_review_view
with (security_invoker = true)
as
select
    ad.id as document_id,
    ih.id as invoice_header_id,
    ih.invoice_number,
    ih.po_number,
    ad.attachment_id as invoice_attachment_id,
    ia.filename as invoice_filename,
    ia.storage_bucket as invoice_storage_bucket,
    ia.storage_path as invoice_storage_path,
    (invoice_object.id is not null) as invoice_document_exists,
    rp.id as reference_po_id,
    rp.document_filename as po_filename,
    rp.document_storage_bucket as po_storage_bucket,
    rp.document_storage_path as po_storage_path,
    (po_object.id is not null) as po_document_exists,
    rg.id as reference_grn_id,
    rg.grn_number,
    rg.document_filename as grn_filename,
    rg.document_storage_bucket as grn_storage_bucket,
    rg.document_storage_path as grn_storage_path,
    (grn_object.id is not null) as grn_document_exists,
    vr.id as validation_run_id,
    vr.match_type,
    vr.outcome as match_status,
    vr.two_way_status,
    vr.three_way_status,
    vr.exception_count,
    vr.exception_summary
from public.ap_documents ad
join public.invoice_headers ih
    on ih.document_id = ad.id
left join public.email_attachments ia
    on ia.id = ad.attachment_id
left join storage.objects invoice_object
    on invoice_object.bucket_id = ia.storage_bucket
   and invoice_object.name = ia.storage_path
left join public.reference_purchase_orders rp
    on rp.po_number = ih.po_number
left join storage.objects po_object
    on po_object.bucket_id = rp.document_storage_bucket
   and po_object.name = rp.document_storage_path
left join public.reference_goods_receipts rg
    on rg.reference_po_id = rp.id
left join storage.objects grn_object
    on grn_object.bucket_id = rg.document_storage_bucket
   and grn_object.name = rg.document_storage_path
left join public.validation_runs vr
    on vr.document_id = ad.id
   and vr.is_current;

grant select on public.invoice_match_review_view to anon;

comment on view public.invoice_match_review_view is
    'Read-only Document Review contract with invoice/PO/GRN preview objects, separate two-way/three-way statuses, and persisted exception summary.';
