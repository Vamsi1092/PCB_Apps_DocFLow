alter table public.ap_documents
    add column recommended_action text null,
    add column recommended_action_code text null,
    add column ai_decision_source text null,
    add column ai_decision_model text null,
    add column ai_decision_prompt_version text null,
    add column ai_decision_confidence numeric null,
    add column ai_decided_at timestamptz null;

comment on column public.ap_documents.recommended_action is
    'Current OCI-generated recommended next action for the AP user.';
comment on column public.ap_documents.ai_decision_source is
    'Decision provenance, normally oci; fallback sources remain explicit.';
