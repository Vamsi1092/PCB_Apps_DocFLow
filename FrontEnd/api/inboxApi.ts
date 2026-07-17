import type { InboxMessage } from '@/data';

const API_BASE_URL = 'http://127.0.0.1:8000';

// Builds the URL that streams a single attachment's file back for preview/download.
export function getAttachmentFileUrl(attachmentId: string): string {
  return `${API_BASE_URL}/api/attachments/${attachmentId}/file`;
}

export interface InboxMessagesResponse {
  success: boolean;
  message: string;
  messages: InboxMessage[];
  error?: string;
}

export async function getInboxMessages(): Promise<InboxMessagesResponse> {
  const response = await fetch(`${API_BASE_URL}/api/inbox-messages`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch inbox messages: ${response.status} ${response.statusText}`);
  }

  const data: InboxMessagesResponse = await response.json();

  if (!data.success) {
    throw new Error(data.error || data.message || 'Failed to fetch inbox messages');
  }

  return data;
}
