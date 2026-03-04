import { useState, useRef, useCallback } from 'react';
import type { Message, UseChatReturn, ChatConfig } from './types';

let _idCounter = 0;
function genId(): string {
  return `msg_${Date.now()}_${++_idCounter}`;
}

export function useChat(config: ChatConfig): UseChatReturn {
  const { session, stream = true, onFinish, onError } = config;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsLoading(false);
  }, []);

  const append = useCallback(
    (msg: Pick<Message, 'role' | 'content'>) => {
      const full: Message = { id: genId(), createdAt: new Date(), ...msg };
      setMessages((prev) => [...prev, full]);
    },
    [],
  );

  const sendMessages = useCallback(
    async (_allMessages: Message[], userQuery: string) => {
      if (!session) return;
      setIsLoading(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        if (stream) {
          // Streaming path — accumulate text_delta events
          const assistantId = genId();
          let fullText = '';
          let sources: Array<{ page: number; snippet: string }> | undefined;

          // Add placeholder assistant message
          setMessages((prev) => [
            ...prev,
            { id: assistantId, role: 'assistant', content: '', createdAt: new Date() },
          ]);

          const gen = session.stream(userQuery, { signal: controller.signal });

          for await (const event of gen) {
            if (controller.signal.aborted) break;

            if (event.type === 'text_delta') {
              fullText += event.text;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: fullText } : m,
                ),
              );
            } else if (event.type === 'done') {
              fullText = event.answer || fullText;
              sources = event.sources;
            } else if (event.type === 'error') {
              throw new Error(event.message);
            }
          }

          const finalMsg: Message = {
            id: assistantId,
            role: 'assistant',
            content: fullText,
            createdAt: new Date(),
            sources,
          };

          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? finalMsg : m)),
          );

          onFinish?.(finalMsg);
        } else {
          // Non-streaming path
          const result = await session.prompt(userQuery, {
            signal: controller.signal,
          });

          if (controller.signal.aborted) return;

          const assistantMsg: Message = {
            id: genId(),
            role: 'assistant',
            content: result.answer,
            createdAt: new Date(),
            sources: result.sources,
          };

          setMessages((prev) => [...prev, assistantMsg]);
          onFinish?.(assistantMsg);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        const error = err instanceof Error ? err : new Error(String(err));
        onError?.(error);
      } finally {
        setIsLoading(false);
        abortRef.current = null;
      }
    },
    [session, stream, onFinish, onError],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setInput(e.target.value);
    },
    [],
  );

  const handleSubmit = useCallback(
    (e?: { preventDefault?: () => void }) => {
      e?.preventDefault?.();
      const trimmed = input.trim();
      if (!trimmed || isLoading || !session) return;

      const userMsg: Message = {
        id: genId(),
        role: 'user',
        content: trimmed,
        createdAt: new Date(),
      };

      const nextMessages = [...messages, userMsg];
      setMessages(nextMessages);
      setInput('');
      sendMessages(nextMessages, trimmed);
    },
    [input, isLoading, session, messages, sendMessages],
  );

  return {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    stop,
    append,
    setMessages,
  };
}
