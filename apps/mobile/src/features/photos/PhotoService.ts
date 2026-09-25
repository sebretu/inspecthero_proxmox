import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { getDatabase } from '../../db/database';
import { authSupabase } from '../../auth/authClient';

export interface TaskPhotoRow {
  id: string;
  task_id: string;
  url: string | null;
  local_uri: string | null;
  storage_path?: string | null;
  photo_type: string;
  upload_status: 'pending_upload' | 'uploaded' | 'failed';
  created_at: string;
  version: number;
}

const PHOTOS_DIR = `${FileSystem.documentDirectory}task_photos/`;

async function ensurePhotosDirExists(): Promise<void> {
  const dirInfo = await FileSystem.getInfoAsync(PHOTOS_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(PHOTOS_DIR, { intermediates: true });
  }
}

export class PhotoService {
  /**
   * Resolve displayable URI from local URI, storage path, or public URL
   */
  static resolvePhotoUrl(photo: Partial<TaskPhotoRow>): string {
    if (photo.local_uri) return photo.local_uri;
    if (photo.url) {
      if (photo.url.startsWith('http://') || photo.url.startsWith('https://') || photo.url.startsWith('file://')) {
        return photo.url;
      }
      const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://api.inspecthero.pl';
      return `${baseUrl}/storage/v1/object/public/task-photos/${photo.url.replace(/^\/+/, '')}`;
    }
    if (photo.storage_path) {
      const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://api.inspecthero.pl';
      return `${baseUrl}/storage/v1/object/public/task-photos/${photo.storage_path.replace(/^\/+/, '')}`;
    }
    return '';
  }

  /**
   * Fetch online photos for task and cache them into SQLite
   */
  static async fetchOnlineTaskPhotos(taskId: string): Promise<TaskPhotoRow[]> {
    try {
      const { data: { session } } = await authSupabase.auth.getSession();
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://inspecthero.pl';
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const res = await fetch(`${apiUrl}/api/task-photos?taskId=${encodeURIComponent(taskId)}`, {
        headers,
      });

      if (!res.ok) return [];
      const json = await res.json();
      if (!json.ok || !Array.isArray(json.data)) return [];

      const db = await getDatabase();
      const savedPhotos: TaskPhotoRow[] = [];

      for (const item of json.data) {
        const resolvedUrl = item.url || (item.storage_path ? PhotoService.resolvePhotoUrl({ storage_path: item.storage_path }) : null);
        await db.runAsync(`
          INSERT INTO task_photos (
            id, task_id, url, storage_path, photo_type, upload_status, created_at, version
          ) VALUES (?, ?, ?, ?, ?, 'uploaded', ?, 1)
          ON CONFLICT(id) DO UPDATE SET 
            url = excluded.url,
            storage_path = excluded.storage_path,
            photo_type = excluded.photo_type,
            upload_status = 'uploaded';
        `, [
          item.id,
          taskId,
          resolvedUrl,
          item.storage_path || null,
          item.photo_type || 'STANDARD',
          item.created_at || new Date().toISOString(),
        ]).catch(() => {});

        savedPhotos.push({
          id: item.id,
          task_id: taskId,
          url: resolvedUrl,
          local_uri: null,
          storage_path: item.storage_path || null,
          photo_type: item.photo_type || 'STANDARD',
          upload_status: 'uploaded',
          created_at: item.created_at || new Date().toISOString(),
          version: 1,
        });
      }

      return savedPhotos;
    } catch (e) {
      console.warn('[PhotoService] Failed to fetch online photos for task:', taskId, e);
      return [];
    }
  }

  /**
   * Capture photo with camera and store in persistent local storage & SQLite
   */
  /**
   * Capture photo with camera and store in persistent local storage & SQLite
   */
  static async capturePhoto(taskId: string, photoType: string = 'STANDARD'): Promise<TaskPhotoRow | null> {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Brak uprawnień do aparatu');
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: false,
    });

    if (result.canceled || !result.assets[0]?.uri) {
      return null;
    }

    return this.savePhotoLocally(taskId, result.assets[0].uri, photoType);
  }

  /**
   * Pick photo from device gallery
   */
  static async pickPhoto(taskId: string, photoType: string = 'STANDARD'): Promise<TaskPhotoRow | null> {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Brak uprawnień do galerii');
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: false,
    });

    if (result.canceled || !result.assets[0]?.uri) {
      return null;
    }

    return this.savePhotoLocally(taskId, result.assets[0].uri, photoType);
  }

  /**
   * Copy file into sandbox and insert into SQLite
   */
  private static async savePhotoLocally(taskId: string, sourceUri: string, photoType: string = 'STANDARD'): Promise<TaskPhotoRow> {
    await ensurePhotosDirExists();

    const photoId = `pho-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const destinationUri = `${PHOTOS_DIR}${photoId}.jpg`;
    const now = new Date().toISOString();

    await FileSystem.copyAsync({
      from: sourceUri,
      to: destinationUri,
    });

    const db = await getDatabase();
    await db.runAsync(`
      INSERT INTO task_photos (
        id, task_id, url, local_uri, photo_type, upload_status, created_at, version
      ) VALUES (?, ?, NULL, ?, ?, 'pending_upload', ?, 1);
    `, [photoId, taskId, destinationUri, photoType, now]);

    // Record mutation for sync queue
    await db.runAsync(`
      INSERT INTO mutations (
        mutation_id, entity_type, entity_id, operation, base_version, payload, status, attempts, created_at, updated_at
      ) VALUES (?, 'task_photos', ?, 'INSERT', 0, ?, 'PENDING', 0, ?, ?);
    `, [
      `mut-${Date.now()}-${photoId}`,
      photoId,
      JSON.stringify({
        task_id: taskId,
        photo_type: photoType,
        created_at: now,
      }),
      now,
      now,
    ]);

    return {
      id: photoId,
      task_id: taskId,
      url: null,
      local_uri: destinationUri,
      photo_type: photoType,
      upload_status: 'pending_upload',
      created_at: now,
      version: 1,
    };
  }

  /**
   * Upload all pending local photos to Supabase Storage
   */
  static async uploadPendingPhotos(): Promise<number> {
    const db = await getDatabase();
    const pendingPhotos = await db.getAllAsync<TaskPhotoRow>(
      "SELECT * FROM task_photos WHERE upload_status = 'pending_upload' AND deleted_at IS NULL;"
    );

    if (pendingPhotos.length === 0) return 0;

    let uploadedCount = 0;

    for (const photo of pendingPhotos) {
      if (!photo.local_uri) continue;

      try {
        const fileInfo = await FileSystem.getInfoAsync(photo.local_uri);
        if (!fileInfo.exists) continue;

        const base64 = await FileSystem.readAsStringAsync(photo.local_uri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const buffer = Buffer.from(base64, 'base64');
        const filePath = `task_photos/${photo.task_id}/${photo.id}.jpg`;

        const { data, error } = await authSupabase.storage
          .from('task-photos')
          .upload(filePath, buffer, {
            contentType: 'image/jpeg',
            upsert: true,
          });

        if (error) {
          console.warn(`[PhotoService] Upload error for ${photo.id}:`, error);
          continue;
        }

        const { data: publicUrlData } = authSupabase.storage
          .from('task-photos')
          .getPublicUrl(filePath);

        const publicUrl = publicUrlData.publicUrl;

        await db.runAsync(
          "UPDATE task_photos SET url = ?, upload_status = 'uploaded', updated_at = ? WHERE id = ?;",
          [publicUrl, new Date().toISOString(), photo.id]
        );

        uploadedCount++;
      } catch (err) {
        console.error(`[PhotoService] Error uploading photo ${photo.id}:`, err);
      }
    }

    return uploadedCount;
  }
}
