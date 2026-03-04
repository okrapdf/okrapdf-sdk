import { createContext, useContext, useMemo, createElement } from 'react';
import { createOkra } from '../providers';
import type { OkraClient } from '../client';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface OkraContextValue {
  client: OkraClient;
  apiKey: string;
}

const OkraContext = createContext<OkraContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface OkraProviderProps {
  apiKey: string;
  baseUrl?: string;
  children: React.ReactNode;
}

/**
 * Provides the OkraPDF runtime client to all child hooks.
 *
 * ```tsx
 * <OkraProvider apiKey={process.env.OKRA_API_KEY!}>
 *   <App />
 * </OkraProvider>
 * ```
 */
export function OkraProvider({ apiKey, baseUrl, children }: OkraProviderProps) {
  const value = useMemo<OkraContextValue>(() => {
    const client = createOkra({ apiKey, baseUrl });
    return { client, apiKey };
  }, [apiKey, baseUrl]);

  return createElement(OkraContext.Provider, { value }, children);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Access the OkraPDF runtime client from context.
 *
 * ```ts
 * const { client } = useOkra();
 * const session = await client.sessions.create(file);
 * ```
 */
export function useOkra(): OkraContextValue {
  const ctx = useContext(OkraContext);
  if (!ctx) {
    throw new Error('useOkra must be used within an <OkraProvider>');
  }
  return ctx;
}
