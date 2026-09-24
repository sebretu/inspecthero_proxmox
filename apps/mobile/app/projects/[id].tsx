import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getDatabase } from '../../src/db/database';

interface Building {
  id: string;
  name: string;
  code?: string;
}

interface Floor {
  id: string;
  building_id: string;
  name: string;
  level_number: number;
}

interface TaskItem {
  id: string;
  title: string;
  description: string | null;
  status: 'open' | 'in_progress' | 'closed';
  priority: string | null;
  version: number;
}

export default function ProjectDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [projectName, setProjectName] = useState('Projekt');
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [selectedFloorId, setSelectedFloorId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const db = await getDatabase();

      // 1. Get Project
      const proj = await db.getFirstAsync<{ name: string }>(
        'SELECT name FROM projects WHERE id = ?;',
        [id]
      );
      if (proj) setProjectName(proj.name);

      // 2. Get Buildings
      const bldgs = await db.getAllAsync<Building>(
        'SELECT id, name, code FROM buildings WHERE project_id = ? AND deleted_at IS NULL ORDER BY name ASC;',
        [id]
      );
      setBuildings(bldgs);

      const activeBldgId = bldgs[0]?.id || null;
      setSelectedBuildingId(activeBldgId);

      // 3. Get Floors
      if (activeBldgId) {
        const flrs = await db.getAllAsync<Floor>(
          'SELECT id, building_id, name, level_number FROM floors WHERE building_id = ? AND deleted_at IS NULL ORDER BY level_number ASC;',
          [activeBldgId]
        );
        setFloors(flrs);
        const activeFloorId = flrs[0]?.id || null;
        setSelectedFloorId(activeFloorId);

        // 4. Get Tasks
        await loadTasksForFloor(db, activeFloorId);
      }
    } catch (err) {
      console.error('[ProjectDetailScreen] Load error:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadTasksForFloor = async (db: SQLiteDatabase, floorId: string | null) => {
    let taskList: TaskItem[] = [];
    if (floorId) {
      taskList = await db.getAllAsync<TaskItem>(`
        SELECT t.id, t.title, t.description, t.status, t.priority, t.version
        FROM tasks t
        JOIN plans p ON t.plan_id = p.id
        WHERE p.floor_id = ? AND t.deleted_at IS NULL
        ORDER BY t.created_at DESC;
      `, [floorId]);
    }

    if (taskList.length === 0) {
      // Fallback to any tasks for this project
      taskList = await db.getAllAsync<TaskItem>(`
        SELECT t.id, t.title, t.description, t.status, t.priority, t.version
        FROM tasks t
        JOIN plans p ON t.plan_id = p.id
        WHERE p.project_id = ? AND t.deleted_at IS NULL
        ORDER BY t.created_at DESC;
      `, [id]);
    }
    setTasks(taskList);
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleTaskStatus = async (task: TaskItem) => {
    const nextStatus = task.status === 'open' ? 'in_progress' : task.status === 'in_progress' ? 'closed' : 'open';
    try {
      const db = await getDatabase();
      const nextVersion = task.version + 1;
      const now = new Date().toISOString();

      // Update local SQLite record
      await db.runAsync(
        'UPDATE tasks SET status = ?, version = ?, updated_at = ? WHERE id = ?;',
        [nextStatus, nextVersion, now, task.id]
      );

      // Record offline mutation for sync engine
      await db.runAsync(`
        INSERT INTO mutations (
          mutation_id, entity_type, entity_id, operation, base_version, payload, status, attempts, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?);
      `, [
        `mut-${Date.now()}-${task.id}`,
        'task',
        task.id,
        'UPDATE',
        task.version,
        JSON.stringify({ status: nextStatus, updated_at: now }),
        'PENDING',
        now,
        now,
      ]);

      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus, version: nextVersion } : t))
      );
    } catch (err: any) {
      Alert.alert('Błąd aktualizacji', err?.message || 'Nie udało się zapisać zmiany w SQLite');
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
          title: projectName,
          headerShown: true,
          headerBackTitle: 'Projekty',
          headerStyle: { backgroundColor: '#0B0F19' },
          headerTintColor: '#38BDF8',
          headerTitleStyle: { color: '#F8FAFC', fontWeight: '700' },
        }}
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#38BDF8" />
          <Text style={styles.loadingText}>Ładowanie danych projektu...</Text>
        </View>
      ) : (
        <View style={styles.content}>
          {/* Building Switcher */}
          {buildings.length > 0 && (
            <View style={styles.switcherSection}>
              <Text style={styles.sectionLabel}>BUDYNEK</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
                {buildings.map((b) => (
                  <TouchableOpacity
                    key={b.id}
                    style={[styles.pill, selectedBuildingId === b.id && styles.pillActive]}
                    onPress={() => setSelectedBuildingId(b.id)}
                  >
                    <Text style={[styles.pillText, selectedBuildingId === b.id && styles.pillTextActive]}>
                      {b.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Floor Switcher */}
          {floors.length > 0 && (
            <View style={styles.switcherSection}>
              <Text style={styles.sectionLabel}>PIĘTRO / KONDYGNACJA</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
                {floors.map((f) => (
                  <TouchableOpacity
                    key={f.id}
                    style={[styles.pill, selectedFloorId === f.id && styles.pillActive]}
                    onPress={() => setSelectedFloorId(f.id)}
                  >
                    <Text style={[styles.pillText, selectedFloorId === f.id && styles.pillTextActive]}>
                      {f.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Task List Header */}
          <View style={styles.taskHeader}>
            <View style={styles.taskHeaderTop}>
              <View>
                <Text style={styles.taskHeaderTitle}>Zadania montażowe ({tasks.length})</Text>
                <Text style={styles.taskHeaderSubtitle}>Dotknij zadania, aby otworzyć szczegóły</Text>
              </View>
              <TouchableOpacity
                style={styles.addTaskBtn}
                onPress={() => router.push({ pathname: '/tasks/create', params: { planId: 'pln-sample-001' } } as any)}
              >
                <Text style={styles.addTaskBtnText}>+ Nowe</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Task List */}
          <FlatList
            data={tasks}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <View style={styles.center}>
                <Text style={styles.emptyTitle}>Brak zadań</Text>
                <Text style={styles.emptySubtitle}>Brak przypisanych usterek i zadań na tej kondygnacji.</Text>
              </View>
            }
            renderItem={({ item }) => {
              const badge = getStatusBadge(item.status);
              return (
                <TouchableOpacity
                  style={styles.taskCard}
                  activeOpacity={0.8}
                  onPress={() => router.push(`/tasks/${item.id}` as any)}
                >
                  <View style={styles.taskMain}>
                    <Text style={styles.taskTitle}>{item.title}</Text>
                    {item.description ? (
                      <Text style={styles.taskDesc} numberOfLines={2}>{item.description}</Text>
                    ) : null}
                    <Text style={styles.taskMeta}>Lokalna wersja: v{item.version}</Text>
                  </View>

                  <TouchableOpacity
                    style={[styles.statusButton, { backgroundColor: badge.bg }]}
                    activeOpacity={0.7}
                    onPress={() => toggleTaskStatus(item)}
                  >
                    <Text style={[styles.statusText, { color: badge.text }]}>
                      {badge.label}
                    </Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#030712',
  },
  content: {
    flex: 1,
  },
  switcherSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
    backgroundColor: '#0B0F19',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 1,
    marginBottom: 6,
  },
  horizontalScroll: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  pill: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  pillActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    borderColor: '#38BDF8',
  },
  pillText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
  pillTextActive: {
    color: '#38BDF8',
    fontWeight: '700',
  },
  taskHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#030712',
  },
  taskHeaderTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  taskHeaderTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  taskHeaderSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  addTaskBtn: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  addTaskBtnText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
  },
  list: {
    padding: 16,
    paddingTop: 4,
  },
  taskCard: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  taskMain: {
    flex: 1,
    marginRight: 12,
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 4,
  },
  taskDesc: {
    fontSize: 13,
    color: '#94A3B8',
    marginBottom: 6,
  },
  taskMeta: {
    fontSize: 11,
    color: '#64748B',
  },
  statusButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 95,
  },
  statusText: {
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
  loadingText: {
    color: '#94A3B8',
    marginTop: 12,
    fontSize: 14,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
  },
});
