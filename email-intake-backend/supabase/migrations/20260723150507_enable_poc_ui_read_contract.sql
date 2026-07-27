create policy "Allow anon read for POC"
on public.document_chains
for select to anon
using (true);

create policy "Allow anon read for POC"
on public.validation_runs
for select to anon
using (true);

create policy "Allow anon read for POC"
on public.reference_purchase_orders
for select to anon
using (true);

create policy "Allow anon read for POC"
on public.reference_purchase_order_lines
for select to anon
using (true);

create policy "Allow anon read for POC"
on public.reference_goods_receipts
for select to anon
using (true);

create policy "Allow anon read for POC"
on public.reference_goods_receipt_lines
for select to anon
using (true);

grant select on public.document_chains to anon;
grant select on public.validation_runs to anon;
grant select on public.reference_purchase_orders to anon;
grant select on public.reference_purchase_order_lines to anon;
grant select on public.reference_goods_receipts to anon;
grant select on public.reference_goods_receipt_lines to anon;
grant select on public.current_match_results to anon;
grant select on public.document_ui_view to anon;
grant select on public.document_lifecycle_view to anon;

comment on view public.document_ui_view is
    'Read-only POC contract for document list/review UI. Accessible to anon by explicit product-owner approval.';
comment on view public.document_lifecycle_view is
    'Read-only four-stage transaction lifecycle contract for the POC UI.';
