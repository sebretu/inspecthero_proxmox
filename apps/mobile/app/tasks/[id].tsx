import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Alert,
  Modal,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { getDatabase } from '../../src/db/database';
import { PhotoService, TaskPhotoRow } from '../../src/features/photos/PhotoService';
import { useAuth } from '../../src/auth/useAuth';

export type TaskStatus =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'DONE_WAITING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'open'
  | 'in_progress'
  | 'closed';

interface TaskDetail {
  id: string;
  plan_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: string | null;
  assigned_user_id?: string | null;
  assigned_user_name?: string | null;
  due_date?: string | null;
  rejection_reason?: string | null;
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
  const { isAdmin } = useAuth();

  const [task, setTask] = useState<TaskDetail | null>(null);
  const [photos, setPhotos] = useState<TaskPhotoRow[]>([]);
  const [selectedPhotoFilter, setSelectedPhotoFilter] = useState<'ALL' | 'BEFORE' | 'AFTER' | 'STANDARD'>('ALL');
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [capturingPhoto, setCapturingPhoto] = useState(false);

  // Photo phase selector modal
  const [photoTypeModalVisible, setPhotoTypeModalVisible] = useState(false);
  const [pendingPickerSource, setPendingPickerSource] = useState<'camera' | 'gallery' | null>(null);

  // Rejection modal
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectionReasonInput, setRejectionReasonInput] = useState('');
  const [previewPhotoUri, setPreviewPhotoUri] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const db = await getDatabase();

      // 1. Task info with joined breadcrumbs and assignee profile
      let taskRow: TaskDetail | null = null;
      try {
        taskRow = await db.getFirstAsync<TaskDetail>(`
          SELECT 
            t.*,
            p.name as plan_name,
            f.name as floor_name,
            b.name as building_name,
            COALESCE(pr.full_name, pr.email, t.assigned_to) as assigned_user_name
          FROM tasks t
          LEFT JOIN plans p ON t.plan_id = p.id
          LEFT JOIN floors f ON p.floor_id = f.id
          LEFT JOIN buildings b ON f.building_id = b.id
          LEFT JOIN profiles pr ON (t.assigned_user_id = pr.id OR t.assigned_to = pr.id)
          WHERE t.id = ?;
        `, [id]);
      } catch (queryErr) {
        console.warn('[TaskDetailScreen] Joined task query fallback:', queryErr);
        taskRow = await db.getFirstAsync<TaskDetail>(`SELECT * FROM tasks WHERE id = ?;`, [id]);
      }
      setTask(taskRow ?? null);

      // 2. Photos from local SQLite
      const photoRows = await db.getAllAsync<TaskPhotoRow>(
        'SELECT * FROM task_photos WHERE task_id = ? AND deleted_at IS NULL ORDER BY created_at DESC;',
        [id]
      );
      setPhotos(photoRows || []);

      // 3. Comments from local SQLite
      const commentRows = await db.getAllAsync<TaskComment>(
        'SELECT * FROM task_comments WHERE task_id = ? AND deleted_at IS NULL ORDER BY created_at ASC;',
        [id]
      );
      setComments(commentRows || []);

      // 4. Online Photo Hydration (non-blocking fallback to download photos created on web)
      if (id) {
        PhotoService.fetchOnlineTaskPhotos(id as string).then((freshPhotos) => {
          if (freshPhotos && freshPhotos.length > 0) {
            setPhotos((prev) => {
              const map = new Map<string, TaskPhotoRow>();
              freshPhotos.forEach((p) => map.set(p.id, p));
              prev.forEach((p) => map.set(p.id, p));
              return Array.from(map.values());
            });
          }
        }).catch((e) => console.warn('[TaskDetailScreen] Photo hydration err:', e));
      }
    } catch (err) {
      console.error('[TaskDetailScreen] Error loading task data:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const updateStatus = async (nextStatus: TaskStatus, rejectionReason?: string) => {
    if (!task) return;
    try {
      const db = await getDatabase();
      const nextVersion = task.version + 1;
      const now = new Date().toISOString();

      await db.runAsync(
        'UPDATE tasks SET status = ?, rejection_reason = ?, version = ?, updated_at = ? WHERE id = ?;',
        [nextStatus, rejectionReason || null, nextVersion, now, task.id]
      );

      await db.runAsync(`
        INSERT INTO mutations (
          mutation_id, entity_type, entity_id, operation, base_version, payload, status, attempts, created_at, updated_at
        ) VALUES (?, 'tasks', ?, 'UPDATE', ?, ?, 'PENDING', 0, ?, ?);
      `, [
        `mut-${Date.now()}-${task.id}`,
        task.id,
        task.version,
        JSON.stringify({
          status: nextStatus,
          rejection_reason: rejectionReason || null,
          updated_at: now,
        }),
        now,
        now,
      ]);

      setTask((prev) => (prev ? {
        ...prev,
        status: nextStatus,
        rejection_reason: rejectionReason ?? prev.rejection_reason,
        version: nextVersion,
        updated_at: now,
      } : null));

      if (nextStatus === 'REJECTED') {
        setRejectModalVisible(false);
        setRejectionReasonInput('');
      }
    } catch (err: any) {
      Alert.alert('Błąd zapisu', err?.message || 'Nie udało się zaktualizować statusu zadania');
    }
  };

  const handleConfirmReject = () => {
    if (!rejectionReasonInput.trim()) {
      Alert.alert('Wymagany powód', 'Wprowadź powód odrzucenia zadania.');
      return;
    }
    updateStatus('REJECTED', rejectionReasonInput.trim());
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

  const initiatePhotoCapture = (source: 'camera' | 'gallery') => {
    setPendingPickerSource(source);
    setPhotoTypeModalVisible(true);
  };

  const handleExecutePhotoPick = async (photoType: 'BEFORE' | 'AFTER' | 'STANDARD') => {
    setPhotoTypeModalVisible(false);
    if (!task || !pendingPickerSource) return;

    try {
      setCapturingPhoto(true);
      let photo: TaskPhotoRow | null = null;
      if (pendingPickerSource === 'camera') {
        photo = await PhotoService.capturePhoto(task.id, photoType);
      } else {
        photo = await PhotoService.pickPhoto(task.id, photoType);
      }

      if (photo) {
        setPhotos((prev) => [photo, ...prev]);
      }
    } catch (err: any) {
      Alert.alert('Zdjęcie', err?.message || 'Nie udało się dołączyć zdjęcia');
    } finally {
      setCapturingPhoto(false);
      setPendingPickerSource(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const s = status.toUpperCase();
    switch (s) {
      case 'APPROVED':
      case 'CLOSED':
        return { label: 'ZATWIERDZONE', bg: 'rgba(16, 185, 129, 0.15)', text: '#10B981', border: '#10B981' };
      case 'DONE_WAITING_APPROVAL':
        return { label: 'DO ODBIORU', bg: 'rgba(139, 92, 246, 0.2)', text: '#A855F7', border: '#A855F7' };
      case 'IN_PROGRESS':
        return { label: 'W TRAKCIE', bg: 'rgba(245, 158, 11, 0.15)', text: '#F59E0B', border: '#F59E0B' };
      case 'REJECTED':
        return { label: 'ODRZUCONE', bg: 'rgba(239, 68, 68, 0.15)', text: '#EF4444', border: '#EF4444' };
      default:
        return { label: 'OTWARTE', bg: 'rgba(2, 132, 199, 0.15)', text: '#38BDF8', border: '#0284C7' };
    }
  };

  const filteredPhotos = useMemo(() => {
    if (selectedPhotoFilter === 'ALL') return photos;
    return photos.filter((p) => (p.photo_type || 'STANDARD').toUpperCase() === selectedPhotoFilter);
  }, [photos, selectedPhotoFilter]);

  const normalizedStatus = (task?.status || 'OPEN').toUpperCase();

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
          {/* Breadcrumbs & Navigation to Plan */}
          <TouchableOpacity
            style={styles.breadcrumbCard}
            onPress={() => router.push(`/plans/${task.plan_id}` as any)}
          >
            <View style={styles.breadcrumbRow}>
              <Text style={styles.breadcrumbText}>
                🏢 {task.building_name || 'Budynek'} › 📍 {task.floor_name || 'Kondygnacja'} › 📐 {task.plan_name || 'Rzut'}
              </Text>
              <Text style={styles.planLinkBadge}>Pokaż na rzucie ↗</Text>
            </View>
          </TouchableOpacity>

          {/* Main Card */}
          <View style={styles.card}>
            <View style={styles.titleRow}>
              <Text style={styles.taskTitle}>{task.title}</Text>
              <View
                style={[
                  styles.statusPill,
                  {
                    backgroundColor: getStatusBadge(task.status).bg,
                    borderColor: getStatusBadge(task.status).border,
                  },
                ]}
              >
                <Text style={[styles.statusPillText, { color: getStatusBadge(task.status).text }]}>
                  {getStatusBadge(task.status).label}
                </Text>
              </View>
            </View>

            {task.description ? (
              <Text style={styles.taskDesc}>{task.description}</Text>
            ) : null}

            {/* Rejection notice if rejected */}
            {task.rejection_reason ? (
              <View style={styles.rejectionBox}>
                <Text style={styles.rejectionTitle}>⚠️ UWAGI DO POPRAWY (ODRZUCONO):</Text>
                <Text style={styles.rejectionContent}>{task.rejection_reason}</Text>
              </View>
            ) : null}

            <View style={styles.metaGrid}>
              <View style={styles.metaCol}>
                <Text style={styles.metaLabel}>PRZYPISANY MONTER</Text>
                <Text style={styles.metaValue}>{task.assigned_user_name || 'Nieprzypisany'}</Text>
              </View>
              <View style={styles.metaCol}>
                <Text style={styles.metaLabel}>TERMIN (DUE DATE)</Text>
                <Text style={styles.metaValue}>
                  {task.due_date ? new Date(task.due_date).toLocaleDateString() : 'Brak terminu'}
                </Text>
              </View>
            </View>

            <View style={[styles.metaGrid, { borderTopWidth: 0, paddingTop: 6 }]}>
              <View style={styles.metaCol}>
                <Text style={styles.metaLabel}>PRIORYTET</Text>
                <Text style={[styles.metaValue, task.priority === 'urgent' ? { color: '#EF4444' } : {}]}>
                  {task.priority?.toUpperCase() || 'NORMALNY'}
                </Text>
              </View>
              <View style={styles.metaCol}>
                <Text style={styles.metaLabel}>WERSJA OFFLINE</Text>
                <Text style={styles.metaValue}>v{task.version} (SQLite)</Text>
              </View>
            </View>
          </View>

          {/* Supervisor / Worker Workflow Actions */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionHeading}>CYKL REALIZACJI I ZATWIERDZENIE (QA)</Text>

            {/* Quick Action Buttons */}
            <View style={styles.workflowActionGrid}>
              {normalizedStatus === 'OPEN' && (
                <TouchableOpacity
                  style={[styles.workflowBtn, { backgroundColor: '#D97706' }]}
                  onPress={() => updateStatus('IN_PROGRESS')}
                >
                  <Text style={styles.workflowBtnText}>⚙️ Rozpocznij realizację</Text>
                </TouchableOpacity>
              )}

              {(normalizedStatus === 'OPEN' || normalizedStatus === 'IN_PROGRESS' || normalizedStatus === 'REJECTED') && (
                <TouchableOpacity
                  style={[styles.workflowBtn, { backgroundColor: '#7C3AED' }]}
                  onPress={() => updateStatus('DONE_WAITING_APPROVAL')}
                >
                  <Text style={styles.workflowBtnText}>⏳ Zgłoś do odbioru (Kierownik)</Text>
                </TouchableOpacity>
              )}

              {normalizedStatus === 'DONE_WAITING_APPROVAL' && (
                <View style={styles.approvalActionRow}>
                  <TouchableOpacity
                    style={[styles.approvalBtn, { backgroundColor: '#059669' }]}
                    onPress={() => updateStatus('APPROVED')}
                  >
                    <Text style={styles.workflowBtnText}>✓ Zatwierdź odbiór</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.approvalBtn, { backgroundColor: '#DC2626' }]}
                    onPress={() => setRejectModalVisible(true)}
                  >
                    <Text style={styles.workflowBtnText}>✕ Odrzuć z uwagami</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Manual Status Selector */}
            <Text style={[styles.metaLabel, { marginTop: 14, marginBottom: 8 }]}>PRZEŁĄCZ STATUS RĘCZNIE:</Text>
            <View style={styles.statusButtonsRow}>
              {(['OPEN', 'IN_PROGRESS', 'DONE_WAITING_APPROVAL', 'APPROVED', 'REJECTED'] as const).map((st) => {
                const badge = getStatusBadge(st);
                const isActive = normalizedStatus === st;
                return (
                  <TouchableOpacity
                    key={st}
                    style={[
                      styles.statusToggleBtn,
                      isActive && { backgroundColor: badge.bg, borderColor: badge.border },
                    ]}
                    onPress={() => updateStatus(st)}
                  >
                    <Text
                      style={[
                        styles.statusToggleText,
                        isActive ? { color: badge.text, fontWeight: '800' } : { color: '#64748B' },
                      ]}
                    >
                      {badge.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Photos Section with BEFORE/AFTER Filter */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionHeading}>DOKUMENTACJA ZDJĘCIOWA ({photos.length})</Text>
              <View style={styles.photoActionsRow}>
                <TouchableOpacity
                  style={styles.photoActionBtn}
                  onPress={() => initiatePhotoCapture('camera')}
                  disabled={capturingPhoto}
                >
                  <Text style={styles.photoActionBtnText}>📸 Aparat</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.photoActionBtn}
                  onPress={() => initiatePhotoCapture('gallery')}
                  disabled={capturingPhoto}
                >
                  <Text style={styles.photoActionBtnText}>🖼️ Galeria</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Photo Filter Tabs */}
            <View style={styles.photoFilterRow}>
              {(['ALL', 'BEFORE', 'AFTER', 'STANDARD'] as const).map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[styles.photoFilterChip, selectedPhotoFilter === f && styles.photoFilterChipActive]}
                  onPress={() => setSelectedPhotoFilter(f)}
                >
                  <Text style={[styles.photoFilterChipText, selectedPhotoFilter === f && styles.photoFilterChipTextActive]}>
                    {f === 'ALL' ? 'Wszystkie' : f === 'BEFORE' ? 'Przed (BEFORE)' : f === 'AFTER' ? 'Po (AFTER)' : 'Montaż'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {filteredPhotos.length === 0 ? (
              <Text style={styles.emptySectionText}>
                {selectedPhotoFilter === 'ALL'
                  ? 'Brak dodanych zdjęć do tego zadania.'
                  : `Brak zdjęć w kategorii ${selectedPhotoFilter}.`}
              </Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photosScroll}>
                {filteredPhotos.map((p) => {
                  const imageSource = PhotoService.resolvePhotoUrl(p);
                  const phaseLabel = (p.photo_type || 'STANDARD').toUpperCase();
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={styles.photoWrapper}
                      activeOpacity={0.8}
                      onPress={() => imageSource && setPreviewPhotoUri(imageSource)}
                    >
                      <Image
                        source={{ uri: imageSource }}
                        style={styles.photoThumb}
                        contentFit="cover"
                        transition={200}
                      />
                      <View
                        style={[
                          styles.photoPhaseTag,
                          phaseLabel === 'BEFORE'
                            ? { backgroundColor: '#F59E0B' }
                            : phaseLabel === 'AFTER'
                            ? { backgroundColor: '#10B981' }
                            : { backgroundColor: '#0284C7' },
                        ]}
                      >
                        <Text style={styles.photoPhaseTagText}>{phaseLabel}</Text>
                      </View>
                      <View style={styles.photoStatusTag}>
                        <Text style={styles.photoStatusText}>
                          {p.upload_status === 'uploaded' ? '🟢 Wgrane' : '🟡 Offline'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>

          {/* Comments Section */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionHeading}>DZIENNIK ZDARZEŃ I NOTATKI ({comments.length})</Text>

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
                placeholder="Napisz komentarz / notatkę wykonawczą..."
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

      {/* Photo Type Selection Modal */}
      <Modal visible={photoTypeModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Wybierz Fazę Zdjęcia</Text>
            <Text style={styles.modalSubtitle}>Określ kontekst dodawanego zdjęcia:</Text>

            <TouchableOpacity
              style={[styles.phaseSelectBtn, { borderColor: '#F59E0B' }]}
              onPress={() => handleExecutePhotoPick('BEFORE')}
            >
              <Text style={[styles.phaseSelectText, { color: '#F59E0B' }]}>📸 STAN PRZED MONTAŻEM (BEFORE)</Text>
              <Text style={styles.phaseSelectDesc}>Inwentaryzacja stanu zastanego / trasy</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.phaseSelectBtn, { borderColor: '#0284C7' }]}
              onPress={() => handleExecutePhotoPick('STANDARD')}
            >
              <Text style={[styles.phaseSelectText, { color: '#38BDF8' }]}>🛠️ DOKUMENTACJA MONTAŻU (STANDARD)</Text>
              <Text style={styles.phaseSelectDesc}>Bieżące postępy prac instalacyjnych</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.phaseSelectBtn, { borderColor: '#10B981' }]}
              onPress={() => handleExecutePhotoPick('AFTER')}
            >
              <Text style={[styles.phaseSelectText, { color: '#10B981' }]}>✓ STAN PO MONTAŻU (AFTER - QA)</Text>
              <Text style={styles.phaseSelectDesc}>Gotowy element zgłaszany do odbioru</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => setPhotoTypeModalVisible(false)}
            >
              <Text style={styles.modalCancelText}>Anuluj</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Rejection Reason Modal */}
      <Modal visible={rejectModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={[styles.modalTitle, { color: '#EF4444' }]}>Odrzucenie Zadania (QA)</Text>
            <Text style={styles.modalSubtitle}>Wpisz konkretne uwagi dla montera:</Text>

            <TextInput
              style={styles.rejectionInput}
              multiline
              numberOfLines={4}
              placeholder="Np. Niewłaściwy promień gięcia kabla E30, brak etykiety..."
              placeholderTextColor="#64748B"
              value={rejectionReasonInput}
              onChangeText={setRejectionReasonInput}
            />

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setRejectModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Anuluj</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalConfirmBtn, { backgroundColor: '#DC2626' }]}
                onPress={handleConfirmReject}
              >
                <Text style={styles.modalConfirmText}>Odrzuć z uwagami</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Fullscreen Photo Preview Modal */}
      <Modal visible={!!previewPhotoUri} transparent animationType="fade">
        <View style={styles.photoPreviewOverlay}>
          <TouchableOpacity
            style={styles.photoPreviewCloseBtn}
            onPress={() => setPreviewPhotoUri(null)}
          >
            <Text style={styles.photoPreviewCloseText}>✕ Zamknij</Text>
          </TouchableOpacity>
          {previewPhotoUri && (
            <Image
              source={{ uri: previewPhotoUri }}
              style={styles.photoPreviewImage}
              contentFit="contain"
            />
          )}
        </View>
      </Modal>
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyTitle: {
    fontSize: 16,
    color: '#94A3B8',
    marginBottom: 16,
  },
  backBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#0284C7',
    borderRadius: 8,
  },
  backBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  breadcrumbCard: {
    backgroundColor: '#0B0F19',
    padding: 12,
    borderRadius: 8,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  breadcrumbRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breadcrumbText: {
    fontSize: 12,
    color: '#94A3B8',
    flex: 1,
  },
  planLinkBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#38BDF8',
    marginLeft: 8,
  },
  card: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 14,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  taskTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F8FAFC',
    flex: 1,
    marginRight: 10,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  taskDesc: {
    fontSize: 14,
    color: '#94A3B8',
    lineHeight: 20,
    marginBottom: 14,
  },
  rejectionBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#EF4444',
    marginBottom: 14,
  },
  rejectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#EF4444',
    marginBottom: 4,
  },
  rejectionContent: {
    fontSize: 13,
    color: '#FCA5A5',
    lineHeight: 18,
  },
  metaGrid: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingTop: 12,
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
  sectionCard: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 14,
  },
  sectionHeading: {
    fontSize: 12,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  workflowActionGrid: {
    marginBottom: 6,
  },
  workflowBtn: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  workflowBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  approvalActionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  approvalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  statusButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  statusToggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  statusToggleText: {
    fontSize: 10,
    fontWeight: '700',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  photoActionsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  photoActionBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  photoActionBtnText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '700',
  },
  photoFilterRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  photoFilterChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  photoFilterChipActive: {
    backgroundColor: '#0284C7',
    borderColor: '#38BDF8',
  },
  photoFilterChipText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94A3B8',
  },
  photoFilterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  emptySectionText: {
    color: '#64748B',
    fontSize: 12,
    fontStyle: 'italic',
  },
  photosScroll: {
    flexDirection: 'row',
  },
  photoWrapper: {
    marginRight: 10,
    position: 'relative',
    borderRadius: 8,
    overflow: 'hidden',
  },
  photoThumb: {
    width: 110,
    height: 110,
    borderRadius: 8,
    backgroundColor: '#1E293B',
  },
  photoPhaseTag: {
    position: 'absolute',
    top: 4,
    left: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  photoPhaseTagText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '900',
  },
  photoStatusTag: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  photoStatusText: {
    color: '#F8FAFC',
    fontSize: 8,
    fontWeight: '700',
  },
  commentsList: {
    marginBottom: 12,
  },
  commentItem: {
    backgroundColor: '#1E293B',
    padding: 10,
    borderRadius: 8,
    marginBottom: 6,
  },
  commentText: {
    color: '#F8FAFC',
    fontSize: 13,
    marginBottom: 4,
  },
  commentMeta: {
    color: '#64748B',
    fontSize: 10,
  },
  addCommentRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  commentInput: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#F8FAFC',
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#334155',
  },
  commentSendBtn: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  commentSendBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalBox: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 16,
  },
  phaseSelectBtn: {
    backgroundColor: '#1E293B',
    borderWidth: 1.5,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  phaseSelectText: {
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 2,
  },
  phaseSelectDesc: {
    fontSize: 10,
    color: '#94A3B8',
  },
  modalCancelBtn: {
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  modalCancelText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
  rejectionInput: {
    backgroundColor: '#1E293B',
    borderRadius: 8,
    padding: 12,
    color: '#F8FAFC',
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#EF4444',
    textAlignVertical: 'top',
    height: 100,
    marginBottom: 16,
  },
  modalActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    alignItems: 'center',
  },
  modalConfirmBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  modalConfirmText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  photoPreviewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  photoPreviewCloseBtn: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  photoPreviewCloseText: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
  },
  photoPreviewImage: {
    width: '100%',
    height: '80%',
  },
});

