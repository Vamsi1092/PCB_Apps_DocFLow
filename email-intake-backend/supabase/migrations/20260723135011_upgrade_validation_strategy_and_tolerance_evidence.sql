alter table public.validation_results
    add column check_status text;

update public.validation_results
set check_status = case
    when passed then 'PASS'
    else 'FAIL'
end;

alter table public.validation_results
    alter column check_status set not null,
    alter column passed drop not null,
    add column match_type text,
    add column deviation_abs numeric,
    add column tolerance_rule_id uuid,
    add column tolerance_threshold_pct numeric,
    add column tolerance_threshold_amt numeric,
    add constraint chk_validation_check_status
        check (check_status in ('PASS', 'FAIL', 'NOT_AVAILABLE', 'NOT_APPLICABLE')),
    add constraint chk_validation_match_type
        check (match_type is null or match_type in ('NON_PO', '2_WAY', '3_WAY')),
    add constraint chk_validation_deviation_abs
        check (deviation_abs is null or deviation_abs >= 0),
    add constraint chk_validation_deviation_pct
        check (deviation_pct is null or deviation_pct >= 0),
    add constraint chk_validation_tolerance_pct
        check (tolerance_threshold_pct is null or tolerance_threshold_pct >= 0),
    add constraint chk_validation_tolerance_amt
        check (tolerance_threshold_amt is null or tolerance_threshold_amt >= 0),
    add constraint fk_validation_tolerance_rule
        foreign key (tolerance_rule_id)
        references public.tolerance_rules(id)
        on update cascade
        on delete set null;

comment on column public.validation_results.check_status is
    'PASS, FAIL, NOT_AVAILABLE, or NOT_APPLICABLE.';
comment on column public.validation_results.deviation_abs is
    'Absolute difference between compared numeric values.';
comment on column public.validation_results.deviation_pct is
    'Absolute difference divided by the absolute expected value, multiplied by 100.';
