const API_BASE_URL = 'http://127.0.0.1:8000';

export interface DocumentQueueSla {
  status: string;
  remaining_minutes: number | null;
  due_at: string | null;
}

/** The AI extraction's own exception assessment for a document — the only
 * per-document signal that actually varies, since ap_documents.stage is
 * frozen at "review" from creation and never updated by a workflow. */
export interface DocumentQueueExceptionReview {
  review_required: boolean | null;
  exception_status: string | null;
  review_reason: string | null;
  exception_summary: string | null;
}

export interface DocumentQueueRecord {
  document_id: string;
  display_id: string;
  priority: string | null;
  priority_reason: string | null;
  supplier: string | null;
  document_reference: string | null;
  po_number: string | null;
  document_type: string | null;
  amount: number | null;
  currency: string | null;
  stage: string | null;
  confidence: number | null;
  exception_count: number;
  exception_review: DocumentQueueExceptionReview | null;
  recommended_action: string | null;
  sla: DocumentQueueSla;
  assigned_to: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface DocumentQueueResponse {
  success: boolean;
  message: string;
  total_records: number;
  documents: DocumentQueueRecord[];
  error?: string;
}

export async function getDocumentQueue(): Promise<DocumentQueueResponse> {
  const response = await fetch(`${API_BASE_URL}/api/document-queue`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch document queue: ${response.status} ${response.statusText}`);
  }

  const data: DocumentQueueResponse = await response.json();

  if (!data.success) {
    throw new Error(data.error || data.message || 'Failed to fetch document queue');
  }

  return data;
}

export interface AssignDocumentResponse {
  success: boolean;
  message: string;
  document_id: string;
  assigned_to: string | null;
  error?: string;
}

/** Pass `assignedTo: null` to unassign the document. */
export async function assignDocument(documentId: string, assignedTo: string | null): Promise<AssignDocumentResponse> {
  const response = await fetch(`${API_BASE_URL}/api/document-queue/${documentId}/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assigned_to: assignedTo }),
  });

  if (!response.ok) {
    throw new Error(`Failed to assign document: ${response.status} ${response.statusText}`);
  }

  const data: AssignDocumentResponse = await response.json();

  if (!data.success) {
    throw new Error(data.error || data.message || 'Failed to assign document');
  }

  return data;
}
