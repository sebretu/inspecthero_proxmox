import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDatabase } from '../../src/db/database';

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

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const loadTask = useCallback(async () => {
    try {
      setLoading(true);
      const db = await getDatabase();
      const row = await db.getFirstAsync<TaskDetail>(`
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

      setTask(row ?? null);
    } catch (err) {
      console.error('[TaskDetailScreen] Error loading task:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadTask();
  }, [loadTask]);

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
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?);
      `, [
        `mut-${Date.now()}-${task.id}`,
        'tasks',
        task.id,
        'UPDATE',
        task.version,
        JSON.stringify({ status: nextStatus, updated_at: now }),
        'PENDING',
        now,
        now,
      ]);

      setTask((prev) => prev ? { ...prev, status: nextStatus, version: nextVersion, updated_at: now } : null);
    } catch (err: any) {
      Alert.alert('Błąd zapisu', err?.message || 'Nie udało się zaktualizować statusu zadania');
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
            <Text style={styles.sectionHeading}>ZMIEŃ STATUS ZADANIA (TRYB OFFLINE)</Text>
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
  },
  breadcrumbCard: {
    backgroundColor: '#0B0F19',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
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
    marginBottom: 16,
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
    padding: 20,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 1,
    marginBottom: 14,
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
