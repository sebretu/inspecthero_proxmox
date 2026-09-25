import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDatabase } from '../../src/db/database';
import { authSupabase } from '../../src/auth/authClient';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://inspecthero.pl';

interface Building {
  id: string;
  name: string;
  code?: string;
}

interface PlanItem {
  id: string;
  name: string;
  building_id?: string;
  building_name?: string;
  floor_name?: string;
  task_count?: number;
  circuit_count?: number;
  bma_count?: number;
}

interface BuildingWithPlans {
  id: string;
  name: string;
  plans: PlanItem[];
}

interface TaskItem {
  id: string;
  plan_id?: string;
  plan_name?: string;
  title: string;
  description: string | null;
  status: 'open' | 'in_progress' | 'closed';
  priority: string | null;
  version: number;
}

export default function ProjectDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<'plans' | 'tasks' | 'circuits' | 'cables' | 'maengel'>('plans');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [projectName, setProjectName] = useState('Projekt');
  const [companyName, setCompanyName] = useState<string | null>(null);

  const [buildingGroups, setBuildingGroups] = useState<BuildingWithPlans[]>([]);
  const [expandedBuildingIds, setExpandedBuildingIds] = useState<Set<string>>(new Set());
  const [selectedPlanFilter, setSelectedPlanFilter] = useState<string>('all');
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [circuits, setCircuits] = useState<any[]>([]);

  const syncProjectData = async (db: any) => {
    try {
      const { data: { session } } = await authSupabase.auth.getSession();
      const headers: Record<string, string> = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {};

      const now = new Date().toISOString();

      // 1. Fetch Project Details
      const projRes = await fetch(`${API_BASE_URL}/api/projects`, { headers });
      if (projRes.ok) {
        const pJson = await projRes.json();
        const pList = Array.isArray(pJson) ? pJson : (pJson?.data || []);
        const curProj = pList.find((p: any) => p.id === id);
        if (curProj) {
          setProjectName(curProj.name);
          if (curProj.companies?.name) {
            setCompanyName(curProj.companies.name);
          }
        }
      }

      // 2. Fetch Buildings for this project
      const bRes = await fetch(`${API_BASE_URL}/api/buildings?projectId=${encodeURIComponent(id)}`, { headers });
      if (bRes.ok) {
        const bJson = await bRes.json();
        const bList = Array.isArray(bJson) ? bJson : (bJson?.data || []);
        for (const b of bList) {
          await db.runAsync(
            `INSERT INTO buildings (id, project_id, name, created_at, updated_at, version)
             VALUES (?, ?, ?, ?, ?, 1)
             ON CONFLICT(id) DO UPDATE SET name = excluded.name, project_id = excluded.project_id;`,
            [b.id, id, b.name, now, now]
          );
        }
      }

      // 3. Fetch Floors for this project
      const fRes = await fetch(`${API_BASE_URL}/api/floors?projectId=${encodeURIComponent(id)}`, { headers });
      if (fRes.ok) {
        const fJson = await fRes.json();
        const fList = Array.isArray(fJson) ? fJson : (fJson?.data || []);
        for (const f of fList) {
          await db.runAsync(
            `INSERT INTO floors (id, building_id, name, level_number, created_at, updated_at, version)
             VALUES (?, ?, ?, ?, ?, ?, 1)
             ON CONFLICT(id) DO UPDATE SET name = excluded.name, building_id = excluded.building_id;`,
            [f.id, f.building_id, f.name, f.level || 0, now, now]
          );
        }
      }

      // 4. Fetch Active Plans for this project (current=true)
      const planRes = await fetch(`${API_BASE_URL}/api/plans?projectId=${encodeURIComponent(id)}&current=true`, { headers });
      if (planRes.ok) {
        const planJson = await planRes.json();
        const plansList = Array.isArray(planJson) ? planJson : (planJson?.data || []);
        for (const pl of plansList) {
          const planName = pl.name || pl.floors?.name || pl.pdf_path?.split('/')?.pop() || 'Plan architektoniczny';
          await db.runAsync(
            `INSERT INTO plans (id, project_id, floor_id, name, width, height, created_at, updated_at, version)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
             ON CONFLICT(id) DO UPDATE SET name = excluded.name, project_id = excluded.project_id, floor_id = excluded.floor_id;`,
            [pl.id, id, pl.floor_id || null, planName, pl.image_width || 1920, pl.image_height || 1080, now, now]
          );
        }
      }

      // 5. Fetch Tasks for this project
      const taskRes = await fetch(`${API_BASE_URL}/api/tasks?projectId=${encodeURIComponent(id)}&limit=300`, { headers });
      if (taskRes.ok) {
        const taskJson = await taskRes.json();
        const tList = Array.isArray(taskJson) ? taskJson : (taskJson?.data || []);
        for (const t of tList) {
          await db.runAsync(
            `INSERT INTO tasks (id, plan_id, title, description, status, priority, pos_x, pos_y, version, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
             ON CONFLICT(id) DO UPDATE SET title = excluded.title, description = excluded.description, status = excluded.status;`,
            [t.id, t.plan_id || 'pln-sample-001', t.title || 'Zadanie', t.description || null, t.status || 'open', t.priority || 'normal', t.x_norm ? Math.round(t.x_norm * 1920) : 100, t.y_norm ? Math.round(t.y_norm * 1080) : 100, now, now]
          ).catch(() => {});
        }
      }
    } catch (e) {
      console.warn('[ProjectDetail] Sync error:', e);
    }
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const db = await getDatabase();
      await syncProjectData(db);

      // 1. Get Project name from SQLite
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

      // 3. Get Plans for this Project
      const allPlans = await db.getAllAsync<PlanItem>(`
        SELECT 
          p.id, 
          p.name, 
          b.id as building_id,
          COALESCE(b.name, 'Główny budynek') as building_name,
          COALESCE(f.name, '') as floor_name,
          (SELECT COUNT(*) FROM tasks t WHERE t.plan_id = p.id AND t.deleted_at IS NULL) as task_count,
          (SELECT COUNT(*) FROM bma_devices bd WHERE bd.plan_id = p.id AND bd.deleted_at IS NULL) as bma_count,
          (SELECT COUNT(*) FROM stromkreise s WHERE s.plan_id = p.id AND s.deleted_at IS NULL) as circuit_count
        FROM plans p
        LEFT JOIN floors f ON p.floor_id = f.id
        LEFT JOIN buildings b ON f.building_id = b.id
        WHERE p.project_id = ? AND p.deleted_at IS NULL
        ORDER BY p.name ASC;
      `, [id]);

      // Group plans by building
      const buildingMap: Record<string, BuildingWithPlans> = {};
      for (const b of bldgs) {
        buildingMap[b.id] = { id: b.id, name: b.name, plans: [] };
      }

      for (const pl of allPlans) {
        const bId = pl.building_id || 'unassigned';
        if (!buildingMap[bId]) {
          buildingMap[bId] = { id: bId, name: pl.building_name || 'Budynek', plans: [] };
        }
        buildingMap[bId].plans.push(pl);
      }

      const groups = Object.values(buildingMap).filter((bg) => bg.plans.length > 0 || bldgs.some((b) => b.id === bg.id));
      setBuildingGroups(groups);
      setExpandedBuildingIds(new Set(groups.map((g) => g.id)));

      // 4. Get Tasks
      const taskList = await db.getAllAsync<TaskItem>(`
        SELECT t.id, t.plan_id, p.name as plan_name, t.title, t.description, t.status, t.priority, t.version
        FROM tasks t
        JOIN plans p ON t.plan_id = p.id
        WHERE p.project_id = ? AND t.deleted_at IS NULL
        ORDER BY t.created_at DESC;
      `, [id]);
      setTasks(taskList);

      // 5. Get Stromkreise
      const circuitList = await db.getAllAsync<any>(`
        SELECT s.*, p.name as plan_name
        FROM stromkreise s
        JOIN plans p ON s.plan_id = p.id
        WHERE p.project_id = ? AND s.deleted_at IS NULL
        ORDER BY s.circuit_name ASC;
      `, [id]);
      setCircuits(circuitList);

    } catch (err) {
      console.error('[ProjectDetailScreen] Load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const toggleBuildingExpand = (bldgId: string) => {
    setExpandedBuildingIds((prev) => {
      const next = new Set(prev);
      if (next.has(bldgId)) next.delete(bldgId);
      else next.add(bldgId);
      return next;
    });
  };

  const toggleTaskStatus = async (task: TaskItem) => {
    const nextStatus = task.status === 'open' ? 'in_progress' : task.status === 'in_progress' ? 'closed' : 'open';
    try {
      const db = await getDatabase();
      const nextVersion = task.version + 1;
      const now = new Date().toISOString();

      await db.runAsync(
        'UPDATE tasks SET status = ?, version = ?, updated_at = ? WHERE id = ?;',
        [nextStatus, nextVersion, now, task.id]
      );

      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus, version: nextVersion } : t))
      );
    } catch (err: any) {
      Alert.alert('Błąd', err?.message || 'Nie udało się zapisać zmiany statusu');
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

  const allPlansList: PlanItem[] = buildingGroups.flatMap((bg) => bg.plans);
  const filteredTasks = selectedPlanFilter === 'all'
    ? tasks
    : tasks.filter((t) => t.plan_id === selectedPlanFilter);

  const filteredCircuits = selectedPlanFilter === 'all'
    ? circuits
    : circuits.filter((c) => c.plan_id === selectedPlanFilter);

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{
          title: projectName,
          headerShown: true,
          headerBackTitle: 'Wróć',
          headerStyle: { backgroundColor: '#0B0F19' },
          headerTintColor: '#38BDF8',
          headerTitleStyle: { color: '#F8FAFC', fontWeight: '700' },
        }}
      />

      {/* Project Header Banner */}
      <View style={styles.projectHeaderBanner}>
        <View style={styles.projectHeaderLeft}>
          <Text style={styles.projectTitleText}>📁 {projectName}</Text>
          {companyName ? (
            <View style={styles.companyBadge}>
              <Text style={styles.companyBadgeText}>🏢 {companyName.toUpperCase()}</Text>
            </View>
          ) : null}
        </View>
        <TouchableOpacity
          style={styles.openFirstPlanBtn}
          onPress={() => {
            if (allPlansList[0]) {
              router.push({ pathname: '/plans/[id]', params: { id: allPlansList[0].id } } as any);
            } else {
              router.push('/plans' as any);
            }
          }}
        >
          <Text style={styles.openFirstPlanBtnText}>📐 Otwórz rzut 2D</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'plans' && styles.tabActive]}
          onPress={() => setActiveTab('plans')}
        >
          <Text style={[styles.tabText, activeTab === 'plans' && styles.tabTextActive]}>
            🏢 Budynki ({buildingGroups.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'tasks' && styles.tabActive]}
          onPress={() => setActiveTab('tasks')}
        >
          <Text style={[styles.tabText, activeTab === 'tasks' && styles.tabTextActive]}>
            📌 Zadania ({tasks.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'circuits' && styles.tabActive]}
          onPress={() => setActiveTab('circuits')}
        >
          <Text style={[styles.tabText, activeTab === 'circuits' && styles.tabTextActive]}>
            ⚡ Obwody ({circuits.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'maengel' && styles.tabActive]}
          onPress={() => router.push({ pathname: '/maengelanzeige', params: { projectId: id } } as any)}
        >
          <Text style={styles.tabText}>
            📝 Mängel
          </Text>
        </TouchableOpacity>
      </View>

      {/* Main Content */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#38BDF8" />
          <Text style={styles.loadingText}>Ładowanie danych projektu...</Text>
        </View>
      ) : activeTab === 'plans' ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#38BDF8"
              colors={['#38BDF8']}
            />
          }
        >
          <Text style={styles.sectionHeading}>BUDYNKI I CONDYGNACJE W TYM PROJEKCIE</Text>
          <Text style={styles.sectionSubtitle}>
            Wybierz budynek, a następnie kliknij w plan, aby otworzyć jego mapę 2D i znaczniki.
          </Text>

          {buildingGroups.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>Brak budynków</Text>
              <Text style={styles.emptySubtitle}>Brak przypisanych budynków i planów do tego projektu.</Text>
            </View>
          ) : (
            buildingGroups.map((bldg) => {
              const isExpanded = expandedBuildingIds.has(bldg.id);
              return (
                <View key={bldg.id} style={styles.buildingCard}>
                  {/* Building Header Accordion */}
                  <TouchableOpacity
                    style={styles.buildingHeader}
                    activeOpacity={0.7}
                    onPress={() => toggleBuildingExpand(bldg.id)}
                  >
                    <View style={styles.buildingHeaderLeft}>
                      <Text style={styles.bldgIcon}>🏢</Text>
                      <View>
                        <Text style={styles.bldgName}>{bldg.name}</Text>
                        <Text style={styles.bldgSubtext}>{bldg.plans.length} aktywnych planów</Text>
                      </View>
                    </View>
                    <View style={styles.bldgHeaderRight}>
                      <Text style={styles.chevronText}>{isExpanded ? '▲' : '▼'}</Text>
                    </View>
                  </TouchableOpacity>

                  {/* Plans List under Building */}
                  {isExpanded && (
                    <View style={styles.plansContainer}>
                      {bldg.plans.length === 0 ? (
                        <Text style={styles.emptyPlansText}>Brak wgranych planów w tym budynku.</Text>
                      ) : (
                        bldg.plans.map((pl) => (
                          <TouchableOpacity
                            key={pl.id}
                            style={styles.planCard}
                            activeOpacity={0.8}
                            onPress={() => router.push({ pathname: '/plans/[id]', params: { id: pl.id } } as any)}
                          >
                            <View style={styles.planCardTop}>
                              <Text style={styles.planIcon}>📐</Text>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.planNameText}>{pl.name}</Text>
                                {pl.floor_name ? (
                                  <Text style={styles.planFloorText}>Kondygnacja: {pl.floor_name}</Text>
                                ) : null}
                              </View>
                              <Text style={styles.arrowText}>➔</Text>
                            </View>

                            <View style={styles.planBadgesRow}>
                              <View style={styles.badgeTask}>
                                <Text style={styles.badgeTaskText}>📌 {pl.task_count || 0} zadań</Text>
                              </View>
                              <View style={styles.badgeBma}>
                                <Text style={styles.badgeBmaText}>🚨 {pl.bma_count || 0} BMA</Text>
                              </View>
                              <View style={styles.badgeCircuit}>
                                <Text style={styles.badgeCircuitText}>⚡ {pl.circuit_count || 0} obwodów</Text>
                              </View>
                            </View>
                          </TouchableOpacity>
                        ))
                      )}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      ) : activeTab === 'tasks' ? (
        <View style={{ flex: 1 }}>
          {/* Plan filter horizontal scroll */}
          {allPlansList.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar}>
              <TouchableOpacity
                style={[styles.filterChip, selectedPlanFilter === 'all' && styles.filterChipActive]}
                onPress={() => setSelectedPlanFilter('all')}
              >
                <Text style={[styles.filterChipText, selectedPlanFilter === 'all' && styles.filterChipTextActive]}>
                  Wszystkie plany ({tasks.length})
                </Text>
              </TouchableOpacity>
              {allPlansList.map((pl) => (
                <TouchableOpacity
                  key={pl.id}
                  style={[styles.filterChip, selectedPlanFilter === pl.id && styles.filterChipActive]}
                  onPress={() => setSelectedPlanFilter(pl.id)}
                >
                  <Text style={[styles.filterChipText, selectedPlanFilter === pl.id && styles.filterChipTextActive]}>
                    📐 {pl.name} ({tasks.filter((t) => t.plan_id === pl.id).length})
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <FlatList
            data={filteredTasks}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#38BDF8"
                colors={['#38BDF8']}
              />
            }
            ListEmptyComponent={
              <View style={styles.center}>
                <Text style={styles.emptyTitle}>Brak zadań montażowych</Text>
                <Text style={styles.emptySubtitle}>Nie dodano jeszcze zadań dla tego planu.</Text>
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
                  <View style={styles.taskCardHeader}>
                    <Text style={styles.taskTitle}>{item.title}</Text>
                    <TouchableOpacity
                      style={[styles.statusBadge, { backgroundColor: badge.bg }]}
                      onPress={() => toggleTaskStatus(item)}
                    >
                      <Text style={[styles.statusBadgeText, { color: badge.text }]}>{badge.label}</Text>
                    </TouchableOpacity>
                  </View>
                  {item.plan_name ? (
                    <Text style={styles.taskPlanName}>📐 {item.plan_name}</Text>
                  ) : null}
                  {item.description ? (
                    <Text style={styles.taskDesc} numberOfLines={2}>{item.description}</Text>
                  ) : null}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {/* Circuits tab */}
          <FlatList
            data={filteredCircuits}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#38BDF8"
                colors={['#38BDF8']}
              />
            }
            ListEmptyComponent={
              <View style={styles.center}>
                <Text style={styles.emptyTitle}>Brak obwodów</Text>
                <Text style={styles.emptySubtitle}>Brak obwodów przypisanych do tego projektu.</Text>
              </View>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.circuitCard}
                activeOpacity={0.8}
                onPress={() => {
                  if (item.plan_id) {
                    router.push({ pathname: '/plans/[id]', params: { id: item.plan_id } } as any);
                  }
                }}
              >
                <View style={styles.circuitCardHeader}>
                  <Text style={styles.circuitTitle}>⚡ {item.circuit_code || item.circuit_name}</Text>
                  <View style={styles.circuitBadge}>
                    <Text style={styles.circuitBadgeText}>{item.fuse_type || 'B16'}</Text>
                  </View>
                </View>
                {item.full_name ? <Text style={styles.circuitDesc}>{item.full_name}</Text> : null}
                <Text style={styles.circuitMeta}>📐 {item.plan_name || 'Plan'}</Text>
              </TouchableOpacity>
            )}
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
  projectHeaderBanner: {
    backgroundColor: '#0B0F19',
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  projectHeaderLeft: {
    flex: 1,
  },
  projectTitleText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 4,
  },
  companyBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  companyBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#38BDF8',
  },
  openFirstPlanBtn: {
    backgroundColor: '#38BDF8',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  openFirstPlanBtnText: {
    color: '#030712',
    fontWeight: '800',
    fontSize: 12,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#080E1E',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#38BDF8',
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
  },
  tabText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },
  tabTextActive: {
    color: '#38BDF8',
  },
  scroll: {
    flex: 1,
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: '800',
    color: '#38BDF8',
    letterSpacing: 1,
    marginBottom: 2,
  },
  sectionSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 14,
  },
  buildingCard: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
    overflow: 'hidden',
  },
  buildingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#0F172A',
  },
  buildingHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  bldgIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  bldgName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 2,
  },
  bldgSubtext: {
    fontSize: 11,
    color: '#94A3B8',
  },
  bldgHeaderRight: {
    paddingLeft: 8,
  },
  chevronText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '800',
  },
  plansContainer: {
    padding: 10,
    gap: 8,
    backgroundColor: '#070D1A',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  emptyPlansText: {
    color: '#64748B',
    fontSize: 11,
    padding: 8,
    textAlign: 'center',
  },
  planCard: {
    backgroundColor: '#0F172A',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  planCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  planIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  planNameText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  planFloorText: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 1,
  },
  arrowText: {
    color: '#38BDF8',
    fontSize: 14,
    fontWeight: '800',
    marginLeft: 8,
  },
  planBadgesRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  badgeTask: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
  },
  badgeTaskText: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: '700',
  },
  badgeBma: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
  },
  badgeBmaText: {
    color: '#EF4444',
    fontSize: 10,
    fontWeight: '700',
  },
  badgeCircuit: {
    backgroundColor: 'rgba(168, 85, 247, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
  },
  badgeCircuitText: {
    color: '#C084FC',
    fontSize: 10,
    fontWeight: '700',
  },
  filterBar: {
    backgroundColor: '#0B0F19',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#1E293B',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  filterChipActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    borderColor: '#38BDF8',
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  },
  filterChipTextActive: {
    color: '#38BDF8',
    fontWeight: '700',
  },
  list: {
    padding: 12,
    paddingBottom: 40,
  },
  taskCard: {
    backgroundColor: '#0F172A',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  taskCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  taskTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginLeft: 8,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  taskPlanName: {
    fontSize: 11,
    color: '#38BDF8',
    marginBottom: 4,
  },
  taskDesc: {
    fontSize: 12,
    color: '#94A3B8',
  },
  circuitCard: {
    backgroundColor: '#0F172A',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  circuitCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  circuitTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#A855F7',
  },
  circuitBadge: {
    backgroundColor: 'rgba(168, 85, 247, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  circuitBadgeText: {
    color: '#C084FC',
    fontSize: 10,
    fontWeight: '800',
  },
  circuitDesc: {
    fontSize: 12,
    color: '#F8FAFC',
    marginBottom: 4,
  },
  circuitMeta: {
    fontSize: 11,
    color: '#64748B',
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
    fontSize: 13,
  },
  emptyBox: {
    padding: 24,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
  },
});
