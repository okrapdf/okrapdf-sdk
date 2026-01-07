import { OkraClient } from '../client';
import { ChatMessage, ChatResponse, ProvisionStoreResponse } from '../types';

export class ChatResource {
  private client: OkraClient;

  constructor(client: OkraClient) {
    this.client = client;
  }

  /**
   * Provisions a file search store for the document.
   * Required before starting a chat.
   */
  async provisionStore(documentUuid: string): Promise<string> {
    const response = await this.client.fetch<ProvisionStoreResponse>('/api/chat/provision-store', {
      method: 'POST',
      body: JSON.stringify({ documentUuid }),
    });
    return response.storeName;
  }

  /**
   * Generates a response from the chat model.
   */
  async generate(storeName: string, messages: ChatMessage[]): Promise<ChatResponse> {
    return this.client.fetch<ChatResponse>('/api/chat/generate', {
      method: 'POST',
      body: JSON.stringify({ storeName, messages }),
    });
  }
}
