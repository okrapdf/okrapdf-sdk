import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OkraClient } from '../src/client';
import { DocumentsResource } from '../src/resources/documents';
import { OkraDocument, OcrJob, UploadResponse } from '../src/types';

describe('DocumentsResource', () => {
  let mockClient: OkraClient;
  let documentsResource: DocumentsResource;

  beforeEach(() => {
    mockClient = new OkraClient({ apiKey: 'test-api-key', baseUrl: 'http://localhost' });
    documentsResource = new DocumentsResource(mockClient);

    // Mock the fetch method for the client
    vi.spyOn(mockClient, 'fetch').mockResolvedValue(null);
    vi.spyOn(mockClient, 'rawFetch').mockResolvedValue(new Response(null, { status: 200 }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should fetch an OCR job by ID', async () => {
    const ocrJobId = 'ocr-test-123';
    const mockOcrJob: OcrJob = {
      id: ocrJobId,
      status: 'completed',
      created_at: new Date().toISOString(),
      file_name: 'test_ocr_file.pdf',
    };
    (mockClient.fetch as vi.Mock).mockResolvedValueOnce(mockOcrJob);

    const result = await documentsResource.get(ocrJobId);

    expect(mockClient.fetch).toHaveBeenCalledWith(`/api/ocr-jobs/${ocrJobId}`);
    expect(result).toEqual(mockOcrJob);
  });

  it('should fetch a document by UUID', async () => {
    const documentUuid = 'a1b2c3d4-e5f6-7890-1234-567890abcdef';
    const mockDocument: OkraDocument = {
      uuid: documentUuid,
      file_name: 'test_document.pdf',
      file_size: 1024,
      upload_date: new Date().toISOString(),
      verification_status: null,
      verification_progress: null,
      tables_count: 0,
      outputs_count: 0,
    };
    (mockClient.fetch as vi.Mock).mockResolvedValueOnce(mockDocument);

    const result = await documentsResource.get(documentUuid);

    expect(mockClient.fetch).toHaveBeenCalledWith(`/api/documents/${documentUuid}`);
    expect(result).toEqual(mockDocument);
  });

  it('should list all documents', async () => {
    const mockDocuments: OkraDocument[] = [
      {
        uuid: 'doc-1',
        file_name: 'doc1.pdf',
        file_size: 100,
        upload_date: new Date().toISOString(),
        verification_status: null,
        verification_progress: null,
        tables_count: 0,
        outputs_count: 0,
      },
      {
        uuid: 'doc-2',
        file_name: 'doc2.pdf',
        file_size: 200,
        upload_date: new Date().toISOString(),
        verification_status: null,
        verification_progress: null,
        tables_count: 0,
        outputs_count: 0,
      },
    ];
    (mockClient.fetch as vi.Mock).mockResolvedValueOnce({ documents: mockDocuments });

    const result = await documentsResource.list();

    expect(mockClient.fetch).toHaveBeenCalledWith('/api/documents');
    expect(result).toEqual(mockDocuments);
  });

  it('should upload a file successfully', async () => {
    const mockFile = new Blob(['file content'], { type: 'application/pdf' });
    const fileName = 'upload.pdf';
    const signedUrl = 'http://localhost/signed-url-for-upload';
    const uploadResponse: UploadResponse = {
      success: true,
      documentUuid: 'uploaded-doc-uuid',
      documentId: 1,
      uploadDate: new Date().toISOString(),
    };

    // Mock for signed URL request
    (mockClient.fetch as vi.Mock).mockResolvedValueOnce({ signedUrl });
    // Mock for document registration
    (mockClient.fetch as vi.Mock).mockResolvedValueOnce(uploadResponse);

    const result = await documentsResource.upload(mockFile, fileName);

    expect(mockClient.fetch).toHaveBeenCalledWith('/api/gcs/signed-url', expect.any(Object));
    expect(mockClient.rawFetch).toHaveBeenCalledWith(signedUrl, expect.objectContaining({
      method: 'PUT',
      body: mockFile,
      headers: { 'Content-Type': 'application/pdf' },
    }));
    expect(mockClient.fetch).toHaveBeenCalledWith('/api/library/save', expect.any(Object));
    expect(result).toEqual(uploadResponse);
  });

  it('should use default content type if file type is missing', async () => {
    // Blob with no type
    const mockFile = new Blob(['file content']);
    const fileName = 'unknown.dat';
    const signedUrl = 'http://localhost/signed-url-for-upload-no-type';
    const uploadResponse: UploadResponse = {
      success: true,
      documentUuid: 'uuid-no-type',
      documentId: 2,
      uploadDate: new Date().toISOString(),
    };

    (mockClient.fetch as vi.Mock).mockResolvedValueOnce({ signedUrl });
    (mockClient.fetch as vi.Mock).mockResolvedValueOnce(uploadResponse);

    await documentsResource.upload(mockFile, fileName);

    expect(mockClient.fetch).toHaveBeenCalledWith('/api/gcs/signed-url', expect.objectContaining({
      body: expect.stringContaining('"contentType":"application/octet-stream"'),
    }));
    expect(mockClient.rawFetch).toHaveBeenCalledWith(signedUrl, expect.objectContaining({
      headers: { 'Content-Type': 'application/octet-stream' },
    }));
  });

  it('should throw an error if file upload to GCS fails', async () => {
    const mockFile = new Blob(['file content'], { type: 'application/pdf' });
    const fileName = 'upload.pdf';
    const signedUrl = 'http://localhost/signed-url-for-failure';

    (mockClient.fetch as vi.Mock).mockResolvedValueOnce({ signedUrl });
    (mockClient.rawFetch as vi.Mock).mockResolvedValueOnce(new Response(null, { status: 500, statusText: 'Internal Server Error' }));

    await expect(documentsResource.upload(mockFile, fileName)).rejects.toThrow('Failed to upload file to storage: Internal Server Error');
  });
});
