import { useState, useCallback, useRef } from 'react';
import type { OkraSession, DocumentStatus } from '../types';
import { useOkra } from './provider';
import type { SessionStatus, UseDocumentSessionReturn } from './types';

export interface UseDocumentSessionOptions {
  /** If true (default), waits for extraction to complete before session is ready */
  wait?: boolean;
}

/**
 * Upload a document and get an interactive session.
 *
 * ```tsx
 * const { session, status, upload } = useDocumentSession();
 * await upload(file); // or upload('https://...')
 * // session is ready when status === 'ready'
 * ```
 */
export function useDocumentSession(
  options: UseDocumentSessionOptions = {},
): UseDocumentSessionReturn {
  const { wait = true } = options;
  const { client } = useOkra();

  const [session, setSession] = useState<OkraSession | null>(null);
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [error, setError] = useState<Error | null>(null);
  const [documentStatus, setDocumentStatus] = useState<DocumentStatus | null>(null);

  const uploadIdRef = useRef(0);

  const upload = useCallback(
    async (source: string | File | Blob) => {
      const currentId = ++uploadIdRef.current;

      try {
        setError(null);
        setStatus('uploading');
        setDocumentStatus(null);
        setSession(null);

        const sess = await client.sessions.create(source, { wait });

        if (currentId !== uploadIdRef.current) return;

        const docStatus = await sess.status();
        setDocumentStatus(docStatus);
        setSession(sess);
        setStatus('ready');
      } catch (err) {
        if (currentId !== uploadIdRef.current) return;
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        setStatus('error');
      }
    },
    [client, wait],
  );

  return { session, status, error, upload, documentStatus };
}
