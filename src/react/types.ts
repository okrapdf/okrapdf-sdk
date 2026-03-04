import type {
  OkraSession,
  CompletionEvent,
  DocumentStatus,
  GenerateResult,
  Page,
} from '../types';

// ---------------------------------------------------------------------------
// AI SDK–compatible Message type
// Matches { id, role, content } shape for drop-in Shadcn Chat UI support
// ---------------------------------------------------------------------------

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: Date;
  sources?: Array<{ page: number; snippet: string }>;
}

// ---------------------------------------------------------------------------
// useDocumentSession
// ---------------------------------------------------------------------------

export type SessionStatus = 'idle' | 'uploading' | 'processing' | 'ready' | 'error';

export interface UseDocumentSessionReturn {
  session: OkraSession | null;
  status: SessionStatus;
  error: Error | null;
  upload: (source: string | File | Blob) => Promise<void>;
  documentStatus: DocumentStatus | null;
}

// ---------------------------------------------------------------------------
// useChat
// ---------------------------------------------------------------------------

export interface UseChatReturn {
  messages: Message[];
  input: string;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  handleSubmit: (e?: { preventDefault?: () => void }) => void;
  isLoading: boolean;
  stop: () => void;
  append: (message: Pick<Message, 'role' | 'content'>) => void;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
}

export interface ChatConfig {
  session: OkraSession | null;
  /** Use streaming (default: true) */
  stream?: boolean;
  onFinish?: (message: Message) => void;
  onError?: (error: Error) => void;
}

// Re-export useful runtime types
export type {
  OkraSession,
  CompletionEvent,
  DocumentStatus,
  GenerateResult,
  Page,
};
