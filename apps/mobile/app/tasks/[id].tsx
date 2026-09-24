import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Alert,
  FlatList,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { getDatabase } from '../../src/db/database';
import { PhotoService, TaskPhotoRow } from '../../src/features/photos/PhotoService';

interface TaskDetail {
  id: string;
  plan_id: string;
  title: string;
  description: string | null;
  status: 'open' | 'in_progress' | 'closed';
  priority: string | null;
  pos_x?: number;
  pos_y?: number;
  version: number;
  created_at: string;
  updated_at: string;
  plan_name?: string;
  building_name?: string;
  floor_name?: string;
}

interface TaskComment {
  id: string;
  task_id: string;
  user_id?: string;
  comment: string;
  created_at: string;
}

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [task, setTask] = useState<TaskDetail | null>(null);
  const [photos, setPhotos] = useState<TaskPhotoRow[]>([]);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [capturingPhoto, setCapturingPhoto] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const db = await getDatabase();

      // 1. Task info
      const taskRow = await db.getFirstAsync<TaskDetail>(`
        SELECT 
          t.*,
          p.name as plan_name,
          f.name as floor_name,
          b.name as building_name
        FROM tasks t
        LEFT JOIN plans p ON t.plan_id = p.id
        LEFT JOIN floors f ON p.floor_id = f.id
        LEFT JOIN buildings b ON f.building_id = b.id
        WHERE t.id = ?;
      `, [id]);
      setTask(taskRow ?? null);

      // 2. Photos
      const photoRows = await db.getAllAsync<TaskPhotoRow>(
        'SELECT * FROM task_photos WHERE task_id = ? AND deleted_at IS NULL ORDER BY created_at DESC;',
        [id]
      );
      setPhotos(photoRows);

      // 3. Comments
      const commentRows = await db.getAllAsync<TaskComment>(
        'SELECT * FROM task_comments WHERE task_id = ? AND deleted_at IS NULL ORDER BY created_at ASC;',
        [id]
      );
      setComments(commentRows);
    } catch (err) {
      console.error('[TaskDetailScreen] Error loading task data:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const updateStatus = async (nextStatus: 'open' | 'in_progress' | 'closed') => {
    if (!task) return;
    try {
      const db = await getDatabase();
      const nextVersion = task.version + 1;
      const now = new Date().toISOString();

      await db.runAsync(
        'UPDATE tasks SET status = ?, version = ?, updated_at = ? WHERE id = ?;',
        [nextStatus, nextVersion, now, task.id]
      );

      await db.runAsync(`
        INSERT INTO mutations (
          mutation_id, entity_type, entity_id, operation, base_version, payload, status, attempts, created_at, updated_at
        ) VALUES (?, 'tasks', ?, 'UPDATE', ?, ?, 'PENDING', 0, ?, ?);
      `, [
        `mut-${Date.now()}-${task.id}`,
        task.id,
        task.version,
        JSON.stringify({ status: nextStatus, updated_at: now }),
        now,
        now,
      ]);

      setTask((prev) => (prev ? { ...prev, status: nextStatus, version: nextVersion, updated_at: now } : null));
    } catch (err: any) {
      Alert.alert('Błąd zapisu', err?.message || 'Nie udało się zaktualizować statusu zadania');
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || !task) return;

    try {
      setSubmittingComment(true);
      const db = await getDatabase();
      const commentId = `com-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const now = new Date().toISOString();

      await db.runAsync(`
        INSERT INTO task_comments (id, task_id, user_id, comment, created_at, version)
        VALUES (?, ?, 'offline_user', ?, ?, 1);
      `, [commentId, task.id, newComment.trim(), now]);

      await db.runAsync(`
        INSERT INTO mutations (
          mutation_id, entity_type, entity_id, operation, base_version, payload, status, attempts, created_at, updated_at
        ) VALUES (?, 'task_comments', ?, 'INSERT', 0, ?, 'PENDING', 0, ?, ?);
      `, [
        `mut-${Date.now()}-${commentId}`,
        commentId,
        JSON.stringify({
          task_id: task.id,
          comment: newComment.trim(),
          created_at: now,
        }),
        now,
        now,
      ]);

      setComments((prev) => [
        ...prev,
        { id: commentId, task_id: task.id, comment: newComment.trim(), created_at: now },
      ]);
      setNewComment('');
    } catch (err: any) {
      Alert.alert('Błąd', err?.message || 'Nie udało się zapisać komentarza');
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleTakePhoto = async () => {
    if (!task) return;
    try {
      setCapturingPhoto(true);
      const photo = await PhotoService.capturePhoto(task.id);
      if (photo) {
        setPhotos((prev) => [photo, ...prev]);
      }
    } catch (err: any) {
      Alert.alert('Aparat', err?.message || 'Nie udało się wykonać zdjęcia');
    } finally {
      setCapturingPhoto(false);
    }
  };

  const handlePickPhoto = async () => {
    if (!task) return;
    try {
      setCapturingPhoto(true);
      const photo = await PhotoService.pickPhoto(task.id);
      if (photo) {
        setPhotos((prev) => [photo, ...prev]);
      }
    } catch (err: any) {
      Alert.alert('Galeria', err?.message || 'Nie udało się wybrać zdjęcia');
    } finally {
      setCapturingPhoto(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'closed':
        return { label: 'ZAMKNIĘTE', bg: 'rgba(34, 197, 94, 0.15)', text: '#22C55E' };
      case 'in_progress':
        return { label: 'W TRAKCIE', bg: 'rgba(234, 179, 8, 0.15)', text: '#EAB308' };
      default:
        return { label: 'OTWARTE', bg: 'rgba(56, 189, 248, 0.15)', text: '#38BDF8' };
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{
          title: 'Szczegóły Zadania',
          headerShown: true,
          headerBackTitle: 'Wstecz',
          headerStyle: { backgroundColor: '#0B0F19' },
          headerTintColor: '#38BDF8',
          headerTitleStyle: { color: '#F8FAFC', fontWeight: '700' },
        }}
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#38BDF8" />
        </View>
      ) : !task ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Nie znaleziono zadania</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>Powrót</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Breadcrumbs */}
          <View style={styles.breadcrumbCard}>
            <Text style={styles.breadcrumbText}>
              🏢 {task.building_name || 'Budynek'} › 📍 {task.floor_name || 'Kondygnacja'} › 📐 {task.plan_name || 'Rzut'}
            </Text>
          </View>

          {/* Main Card */}
          <View style={styles.card}>
            <Text style={styles.taskTitle}>{task.title}</Text>
            {task.description ? (
              <Text style={styles.taskDesc}>{task.description}</Text>
            ) : null}

            <View style={styles.metaGrid}>
              <View style={styles.metaCol}>
                <Text style={styles.metaLabel}>PRIORYTET</Text>
                <Text style={styles.metaValue}>{task.priority?.toUpperCase() || 'NORMALNY'}</Text>
              </View>
              <View style={styles.metaCol}>
                <Text style={styles.metaLabel}>WERSJA REKORDU</Text>
                <Text style={styles.metaValue}>v{task.version} (SQLite)</Text>
              </View>
            </View>
          </View>

          {/* Status Control */}
          <View style={styles.statusSection}>
            <Text style={styles.sectionHeading}>ZMIEŃ STATUS (TRYB OFFLINE)</Text>
            <View style={styles.statusButtonsRow}>
              {(['open', 'in_progress', 'closed'] as const).map((st) => {
                const badge = getStatusBadge(st);
                const isActive = task.status === st;
                return (
                  <TouchableOpacity
                    key={st}
                    style={[
                      styles.statusToggleBtn,
                      isActive && { backgroundColor: badge.bg, borderColor: badge.text },
                    ]}
                    onPress={() => updateStatus(st)}
                  >
                    <Text
                      style={[
                        styles.statusToggleText,
                        isActive ? { color: badge.text } : { color: '#64748B' },
                      ]}
                    >
                      {badge.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Photos Section */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionHeading}>DOKUMENTACJA ZDJĘCIOWA ({photos.length})</Text>
              <View style={styles.photoActionsRow}>
                <TouchableOpacity
                  style={styles.photoActionBtn}
                  onPress={handleTakePhoto}
                  disabled={capturingPhoto}
                >
                  <Text style={styles.photoActionBtnText}>📸 Aparat</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.photoActionBtn}
                  onPress={handlePickPhoto}
                  disabled={capturingPhoto}
                >
                  <Text style={styles.photoActionBtnText}>🖼️ Galeria</Text>
                </TouchableOpacity>
              </View>
            </View>

            {photos.length === 0 ? (
              <Text style={styles.emptySectionText}>Brak dodanych zdjęć do tego zadania.</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photosScroll}>
                {photos.map((p) => {
                  const imageSource = p.local_uri || p.url || '';
                  return (
                    <View key={p.id} style={styles.photoWrapper}>
                      <Image
                        source={{ uri: imageSource }}
                        style={styles.photoThumb}
                        contentFit="cover"
                        transition={200}
                      />
                      <View style={styles.photoStatusTag}>
                        <Text style={styles.photoStatusText}>
                          {p.upload_status === 'uploaded' ? '🟢 Wgrane' : '🟡 Offline'}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>

          {/* Comments Section */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionHeading}>KOMENTARZE I UWAGI MONTERA ({comments.length})</Text>

            {comments.length === 0 ? (
              <Text style={styles.emptySectionText}>Brak komentarzy. Dodaj pierwszą notatkę poniżej.</Text>
            ) : (
              <View style={styles.commentsList}>
                {comments.map((c) => (
                  <View key={c.id} style={styles.commentItem}>
                    <Text style={styles.commentText}>{c.comment}</Text>
                    <Text style={styles.commentMeta}>
                      {new Date(c.created_at).toLocaleDateString()} {new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.addCommentRow}>
              <TextInput
                style={styles.commentInput}
                placeholder="Napisz komentarz / notatkę..."
                placeholderTextColor="#64748B"
                value={newComment}
                onChangeText={setNewComment}
              />
              <TouchableOpacity
                style={[styles.commentSendBtn, submittingComment && styles.btnDisabled]}
                onPress={handleAddComment}
                disabled={submittingComment || !newComment.trim()}
              >
                {submittingComment ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.commentSendBtnText}>Wyślij</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#030712',
  },
  scroll: {
    padding: 16,
    paddingBottom: 40,
  },
  breadcrumbCard: {
    backgroundColor: '#0B0F19',
    padding: 12,
    borderRadius: 8,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  breadcrumbText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  card: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 14,
  },
  taskTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 10,
  },
  taskDesc: {
    fontSize: 15,
    color: '#94A3B8',
    lineHeight: 22,
    marginBottom: 18,
  },
  metaGrid: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingTop: 14,
  },
  metaCol: {
    flex: 1,
  },
  metaLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  metaValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F8FAFC',
  },
  statusSection: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 14,
  },
  sectionCard: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 14,
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 1,
    marginBottom: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  photoActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  photoActionBtn: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  photoActionBtnText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '700',
  },
  photosScroll: {
    flexDirection: 'row',
    marginTop: 4,
  },
  photoWrapper: {
    marginRight: 10,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  photoThumb: {
    width: 120,
    height: 120,
    borderRadius: 10,
  },
  photoStatusTag: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  photoStatusText: {
    fontSize: 9,
    color: '#F8FAFC',
    fontWeight: '700',
  },
  commentsList: {
    gap: 8,
    marginBottom: 14,
  },
  commentItem: {
    backgroundColor: '#0B0F19',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  commentText: {
    fontSize: 14,
    color: '#F8FAFC',
    lineHeight: 20,
    marginBottom: 4,
  },
  commentMeta: {
    fontSize: 10,
    color: '#64748B',
  },
  emptySectionText: {
    fontSize: 13,
    color: '#64748B',
    marginVertical: 6,
  },
  addCommentRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  commentInput: {
    flex: 1,
    backgroundColor: '#030712',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#F8FAFC',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  commentSendBtn: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: 8,
  },
  commentSendBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  statusButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statusToggleBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  statusToggleText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyTitle: {
    fontSize: 18,
    color: '#F8FAFC',
    fontWeight: '700',
    marginBottom: 12,
  },
  backBtn: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  backBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
