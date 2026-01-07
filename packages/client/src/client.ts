import { ClientConfig, ApiError } from './types';
import { DocumentsResource } from './resources/documents';
import { ChatResource } from './resources/chat';
import { ExtractionsResource } from './resources/extractions';

export class OkraClient {
  private apiKey?: string;
  private baseUrl: string;
  
  public documents: DocumentsResource;
  public chat: ChatResource;
  public extractions: ExtractionsResource;

  constructor(config: ClientConfig = {}) {
    this.apiKey = config.apiKey || process.env.OKRA_API_KEY;
    this.baseUrl = config.baseUrl || 'https://app.okrapdf.com'; // Default production URL
    
    this.documents = new DocumentsResource(this);
    this.chat = new ChatResource(this);
    this.extractions = new ExtractionsResource(this);
  }

  public async fetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers = new Headers(options.headers);

    if (this.apiKey) {
      headers.set('Authorization', `Bearer ${this.apiKey}`);
    }
    headers.set('Content-Type', 'application/json');

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(`OkraPDF API Error: ${errorBody.error || response.statusText}`);
    }

    return response.json() as Promise<T>;
  }
  
  // Helper for uploading files which requires specific headers handling (e.g. no Content-Type for PUT sometimes)
  public async rawFetch(url: string, options: RequestInit = {}): Promise<Response> {
     return fetch(url, options);
  }
}
