import { OkraClient } from '../client';
import { OkraDocument, UploadResponse, DocumentOrJob, OcrJob } from '../types';
import { isOcrJobId } from '@okrapdf/refinery';

export class DocumentsResource {
  private client: OkraClient;

  constructor(client: OkraClient) {
    this.client = client;
  }

  /**
   * Get a document or OCR job by ID.
   * Automatically handles routing based on ID format (UUID vs 'ocr-').
   *            Note: OkraDocument is being superseded by OcrJob.
   */
  async get(id: string): Promise<DocumentOrJob> {
    if (isOcrJobId(id)) {
      // It's a transient OCR job
      // Assuming endpoint pattern /api/ocr-jobs/:id
      // We might need to wrap the response to match DocumentOrJob if the API returns something different
      // but for now let's assume it returns OcrJob
      return this.client.fetch<OcrJob>(`/api/ocr-jobs/${id}`);
    } else {
      // It's a standard user document (deprecated)
      return this.client.fetch<OkraDocument>(`/api/documents/${id}`);
    }
  }

  /**
   * List all documents for the authenticated user.
   */
  async list(): Promise<OkraDocument[]> {
    const response = await this.client.fetch<{ documents: OkraDocument[] }>('/api/documents');
    return response.documents;
  }

  /**
   * Upload a file to OkraPDF.
   * @param file - The File object or Blob to upload.
   * @param fileName - Name of the file.
   */
  async upload(file: File | Blob, fileName: string): Promise<UploadResponse> {
    const fileSize = file.size;
    
    // 1. Get Signed URL
    // We generate a path. The server logic usually expects just a path or handles it.
    // Looking at the server code, it expects 'gcsPath'.
    // We should probably rely on a helper or just generate a random path?
    // The server doesn't seem to enforce path structure in `signed-url` endpoint, 
    // but `library/save` expects `fileStoreName` (which is likely the GS path).
    
    // Let's assume we construct a path: `uploads/{random}/{filename}`
    // But wait, the server usually handles "where to put it" for security.
    // The `signed-url` endpoint just signs what we give it. 
    // OK, let's generate a unique path.
    const uniqueId = Math.random().toString(36).substring(2, 15);
    const gcsPath = `gs://${this.client.bucketName}/uploads/${uniqueId}/${fileName}`;
    
    const { signedUrl } = await this.client.fetch<{ signedUrl: string }>('/api/gcs/signed-url', {
      method: 'POST',
      body: JSON.stringify({
        gcsPath,
        action: 'write',
        contentType: file.type || 'application/octet-stream',
      }),
    });

    // 2. Upload to GCS
    const uploadRes = await this.client.rawFetch(signedUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
      },
    });

    if (!uploadRes.ok) {
      throw new Error(`Failed to upload file to storage: ${uploadRes.statusText}`);
    }

    // 3. Register Document
    return this.client.fetch<UploadResponse>('/api/library/save', {
      method: 'POST',
      body: JSON.stringify({
        fileName,
        fileStoreName: gcsPath,
        fileSize,
        documentType: 'pdf_chat', // Default
      }),
    });
  }
}
