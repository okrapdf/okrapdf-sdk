import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import type { ChatMessage } from '../types';

interface ChatState {
  documentUuid: string | null;
  messages: ChatMessage[];
  inputValue: string;
  isStreaming: boolean;
  streamingMessageId: string | null;
  error: string | null;
}

const initialState: ChatState = {
  documentUuid: null,
  messages: [],
  inputValue: '',
  isStreaming: false,
  streamingMessageId: null,
  error: null,
};

export const sendMessage = createAsyncThunk<
  ChatMessage,
  { documentUuid: string; content: string; sendFn?: (content: string) => Promise<string> },
  { rejectValue: string }
>('chat/sendMessage', async ({ documentUuid, content, sendFn }, { dispatch, rejectWithValue }) => {
  try {
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };
    dispatch(addMessage(userMessage));
    dispatch(setInputValue(''));

    const assistantMessageId = (Date.now() + 1).toString();
    dispatch(startStreaming(assistantMessageId));

    const responseContent = sendFn 
      ? await sendFn(content)
      : `Analyzing "${content}"... (placeholder)`;

    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: responseContent,
      timestamp: new Date().toISOString(),
    };

    dispatch(stopStreaming());
    return assistantMessage;
  } catch (err) {
    dispatch(stopStreaming());
    return rejectWithValue(err instanceof Error ? err.message : 'Failed to send message');
  }
});

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    initializeChat: (state, action: PayloadAction<string>) => {
      if (state.documentUuid !== action.payload) {
        state.documentUuid = action.payload;
        state.messages = [{
          id: 'welcome',
          role: 'assistant',
          content: 'Hello! I can help you analyze this document.',
          timestamp: new Date().toISOString(),
        }];
        state.inputValue = '';
        state.isStreaming = false;
        state.streamingMessageId = null;
        state.error = null;
      }
    },

    addMessage: (state, action: PayloadAction<ChatMessage>) => {
      state.messages.push(action.payload);
    },

    updateStreamingMessage: (state, action: PayloadAction<{ id: string; content: string }>) => {
      const message = state.messages.find((m) => m.id === action.payload.id);
      if (message) {
        message.content = action.payload.content;
      }
    },

    appendToStreamingMessage: (state, action: PayloadAction<string>) => {
      if (state.streamingMessageId) {
        const message = state.messages.find((m) => m.id === state.streamingMessageId);
        if (message) {
          message.content += action.payload;
        }
      }
    },

    setInputValue: (state, action: PayloadAction<string>) => {
      state.inputValue = action.payload;
    },

    startStreaming: (state, action: PayloadAction<string>) => {
      state.isStreaming = true;
      state.streamingMessageId = action.payload;
      state.messages.push({
        id: action.payload,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
      });
    },

    stopStreaming: (state) => {
      state.isStreaming = false;
      state.streamingMessageId = null;
    },

    clearChatError: (state) => {
      state.error = null;
    },

    resetChat: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      .addCase(sendMessage.fulfilled, (state, action) => {
        const message = state.messages.find((m) => m.id === action.payload.id);
        if (message) {
          message.content = action.payload.content;
          message.timestamp = action.payload.timestamp;
        }
      })
      .addCase(sendMessage.rejected, (state, action) => {
        state.error = action.payload ?? 'Failed to send message';
        if (state.streamingMessageId) {
          state.messages = state.messages.filter((m) => m.id !== state.streamingMessageId);
        }
      });
  },
});

export const {
  initializeChat,
  addMessage,
  updateStreamingMessage,
  appendToStreamingMessage,
  setInputValue,
  startStreaming,
  stopStreaming,
  clearChatError,
  resetChat,
} = chatSlice.actions;

export default chatSlice.reducer;
