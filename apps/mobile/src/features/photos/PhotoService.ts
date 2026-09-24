import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { getDatabase } from '../../db/database';
import { authSupabase } from '../../auth/authClient';

export interface TaskPhotoRow {
  id: string;
  task_id: string;
  url: string | null;
  local_uri: string | null;
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
   * Capture photo with camera and store in persistent local storage & SQLite
   */
  static async capturePhoto(taskId: string): Promise<TaskPhotoRow | null> {
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

    return this.savePhotoLocally(taskId, result.assets[0].uri);
  }

  /**
   * Pick photo from device gallery
   */
  static async pickPhoto(taskId: string): Promise<TaskPhotoRow | null> {
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

    return this.savePhotoLocally(taskId, result.assets[0].uri);
  }

  /**
   * Copy file into sandbox and insert into SQLite
   */
  private static async savePhotoLocally(taskId: string, sourceUri: string): Promise<TaskPhotoRow> {
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
      ) VALUES (?, ?, NULL, ?, 'standard', 'pending_upload', ?, 1);
    `, [photoId, taskId, destinationUri, now]);

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
        photo_type: 'standard',
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
      photo_type: 'standard',
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
