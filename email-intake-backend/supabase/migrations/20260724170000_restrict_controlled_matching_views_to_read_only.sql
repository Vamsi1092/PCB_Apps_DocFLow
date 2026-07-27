revoke all privileges
on public.current_match_results
from anon;

revoke all privileges
on public.document_ui_view
from anon;

revoke all privileges
on public.invoice_match_review_view
from anon;

grant select on public.current_match_results to anon;
grant select on public.document_ui_view to anon;
grant select on public.invoice_match_review_view to anon;
