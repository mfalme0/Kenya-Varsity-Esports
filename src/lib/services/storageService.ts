import { Client, Storage, ID } from 'appwrite';

class StorageService {
  private client: Client | null = null;
  private storage: Storage | null = null;
  private bucketId = 'season-images'; // Default bucket identified from AdminBannersPage

  /**
   * Lazily create the Appwrite storage client so importing this module does
   * not require environment variables (e.g. during `next build`).
   */
  private getStorage(): Storage {
    if (!this.storage) {
      const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
      const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;

      if (!endpoint || !projectId) {
        throw new Error(
          'Appwrite is not configured: NEXT_PUBLIC_APPWRITE_ENDPOINT and NEXT_PUBLIC_APPWRITE_PROJECT_ID are required'
        );
      }

      this.client = new Client().setEndpoint(endpoint).setProject(projectId);
      this.storage = new Storage(this.client);
    }

    return this.storage;
  }

  /**
   * Upload a file to Appwrite Storage via Server-Side API
   * @param file - The file to upload
   * @param bucketId - Optional bucket ID (defaults to season-images)
   * @returns The public view URL of the uploaded file
   */
  async uploadFile(file: File, bucketId: string = this.bucketId): Promise<string> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('bucketId', bucketId);

      const response = await fetch('/api/admin/upload', {
        method: 'POST',
        body: formData,
      });

      let data;
      try {
        data = await response.json();
      } catch (e) {
        throw new Error(`Upload failed with status ${response.status}: ${response.statusText}`);
      }

      if (!data.success) {
        throw new Error(data.error || 'Upload failed');
      }

      return data.data.url;
    } catch (error: any) {
      console.error('Error uploading file via API:', error);
      throw new Error(error.message || 'Failed to upload file');
    }
  }

  /**
   * Delete a file from Appwrite Storage
   * @param fileId - The ID of the file to delete
   * @param bucketId - Optional bucket ID
   */
  async deleteFile(fileId: string, bucketId: string = this.bucketId): Promise<void> {
    try {
      await this.getStorage().deleteFile(bucketId, fileId);
    } catch (error) {
      console.error('Error deleting file from Appwrite Storage:', error);
      throw error;
    }
  }

  /**
   * Extract file ID from an Appwrite view URL
   * @param url - The Appwrite view URL
   * @returns The file ID or null if not found
   */
  getFileIdFromUrl(url: string): string | null {
    if (!url.includes('/storage/buckets/') || !url.includes('/files/')) {
      return null;
    }
    
    const parts = url.split('/files/');
    if (parts.length < 2) return null;
    
    const fileIdPart = parts[1].split('/')[0];
    return fileIdPart.split('?')[0];
  }
}

export const storageService = new StorageService();
