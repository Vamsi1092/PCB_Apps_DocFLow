create table public.validation_runs (
    id uuid primary key default gen_random_uuid(),
    document_id uuid not null
        references public.ap_documents(id),
    match_type text not null
        check (match_type in ('UNMATCHED', '2_WAY', '3_WAY')),
    outcome text not null
        check (outcome in ('MATCHED', 'VARIANCE', 'UNMATCHED')),
    engine_version text not null,
    is_current boolean not null default true,
    supersedes_run_id uuid null
        references public.validation_runs(id),
    created_at timestamptz not null default now()
);

create unique index validation_runs_one_current_per_document
    on public.validation_runs(document_id)
    where is_current;

alter table public.validation_results
    add column validation_run_id uuid null
        references public.validation_runs(id),
    add column engine_version text not null default 'legacy_poc_v1',
    add column is_current boolean not null default false;

create index validation_results_current_document_idx
    on public.validation_results(document_id, is_current);

alter table public.validation_runs enable row level security;

comment on table public.validation_runs is
    'Versioned matching executions. Legacy validation rows remain available as audit history.';
comment on column public.validation_runs.match_type is
    'Derived from reference presence: no PO = UNMATCHED, PO only = 2_WAY, PO plus GRN = 3_WAY.';
