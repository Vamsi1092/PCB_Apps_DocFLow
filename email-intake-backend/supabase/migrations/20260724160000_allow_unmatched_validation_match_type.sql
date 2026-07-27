alter table public.validation_results
    drop constraint chk_validation_match_type,
    add constraint chk_validation_match_type
        check (
            match_type is null
            or match_type in (
                'NON_PO',
                'UNMATCHED',
                '2_WAY',
                '3_WAY'
            )
        );

comment on column public.validation_results.match_type is
    'Current values are UNMATCHED, 2_WAY, and 3_WAY; NON_PO is retained for legacy validation history.';
