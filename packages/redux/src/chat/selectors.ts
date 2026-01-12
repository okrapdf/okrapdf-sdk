import { createSelector } from '@reduxjs/toolkit';

interface ChatState {
  documentUuid: string | null;
  messages: { id: string; role: string; content: string; timestamp: string }[];
  inputValue: string;
  isStreaming: boolean;
  streamingMessageId: string | null;
  error: string | null;
}

type RootStateWithChat = { chat: ChatState };

export const selectChatState = (state: RootStateWithChat) => state.chat;

export const selectMessages = createSelector(
  selectChatState,
  (chat) => chat.messages
);

export const selectInputValue = createSelector(
  selectChatState,
  (chat) => chat.inputValue
);

export const selectIsStreaming = createSelector(
  selectChatState,
  (chat) => chat.isStreaming
);

export const selectStreamingMessageId = createSelector(
  selectChatState,
  (chat) => chat.streamingMessageId
);

export const selectChatError = createSelector(
  selectChatState,
  (chat) => chat.error
);

export const selectDocumentUuid = createSelector(
  selectChatState,
  (chat) => chat.documentUuid
);

export const selectLastAssistantMessage = createSelector(
  selectMessages,
  (messages) => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        return messages[i];
      }
    }
    return null;
  }
);
