import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Alert,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDatabase } from '../../src/db/database';
import { authSupabase } from '../../src/auth/authClient';
import { TileCacheService } from '../../src/features/tiles/TileCacheService';
import { TileDownloadManager, DownloadManagerState } from '../../src/features/tiles/TileDownloadManager';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://inspecthero.pl';

interface PlanItem {
  id: string;
  name: string;
  project_id: string;
  building_id?: string;
  building_name?: string;
  floor_name?: string;
  task_count?: number;
  bma_count?: number;
  circuit_count?: number;
  isCached?: boolean;
}

interface BuildingGroup {
  id: string;
  name: string;
  plans: PlanItem[];
}

interface ProjectGroup {
  id: string;
  name: string;
  company_name?: string;
  address?: string;
  buildings: BuildingGroup[];
  totalPlansCount: number;
  isFullyCached?: boolean;
}

export default function PlansListScreen() {
  const router = useRouter();
  const [projectGroups, setProjectGroups] = useState<ProjectGroup[]>([]);
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(new Set());
  const [expandedBuildingIds, setExpandedBuildingIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cachedPlanIds, setCachedPlanIds] = useState<Set<string>>(new Set());
  const [totalCacheBytes, setTotalCacheBytes] = useState<number>(0);
  const [downloadState, setDownloadState] = useState<DownloadManagerState>(TileDownloadManager.getState());

  useEffect(() => {
    const unsub = TileDownloadManager.subscribe((st) => {
      setDownloadState(st);
      if (!st.isDownloading) {
        refreshCacheStats();
      }
    });
    return unsub;
  }, []);

  const refreshCacheStats = async () => {
    try {
      const bytes = await TileCacheService.getTotalCacheSize();
      setTotalCacheBytes(bytes);
    } catch {}
  };

  const queryLocalPlans = async (db: any) => {
    const projs = ((await db.getAllAsync(
      "SELECT id, name, company_name, address FROM projects WHERE deleted_at IS NULL ORDER BY name ASC;"
    )) as { id: string; name: string; company_name?: string; address?: string }[]) || [];

    const allBuildings = ((await db.getAllAsync(
      "SELECT id, project_id, name FROM buildings WHERE deleted_at IS NULL ORDER BY name ASC;"
    )) as { id: string; project_id: string; name: string }[]) || [];

    const allPlans = ((await db.getAllAsync(`
      SELECT 
        p.id, 
        p.name, 
        p.project_id,
        b.id as building_id,
        COALESCE(b.name, 'Główny budynek') as building_name,
        COALESCE(f.name, '') as floor_name,
        (SELECT COUNT(*) FROM tasks t WHERE t.plan_id = p.id AND t.deleted_at IS NULL) as task_count,
        (SELECT COUNT(*) FROM bma_devices bd WHERE bd.plan_id = p.id AND bd.deleted_at IS NULL) as bma_count,
        (SELECT COUNT(*) FROM stromkreise s WHERE s.plan_id = p.id AND s.deleted_at IS NULL) as circuit_count
      FROM plans p
      LEFT JOIN floors f ON p.floor_id = f.id
      LEFT JOIN buildings b ON f.building_id = b.id
      WHERE p.deleted_at IS NULL
      ORDER BY p.name ASC;
    `)) as PlanItem[]) || [];

    const cachedSet = await TileCacheService.getCachedPlanIds();
    setCachedPlanIds(cachedSet);

    const groups: ProjectGroup[] = (projs || []).map((pr: any) => {
      const prPlans = (allPlans || []).filter((pl: any) => pl.project_id === pr.id);
      prPlans.forEach((p: any) => {
        p.isCached = cachedSet.has(p.id);
      });
      const prBuildings = (allBuildings || []).filter((b: any) => b.project_id === pr.id);

      const buildingMap: Record<string, BuildingGroup> = {};
      for (const b of prBuildings) {
        buildingMap[b.id] = { id: b.id, name: b.name, plans: [] };
      }

      const unassignedPlans: PlanItem[] = [];
      for (const pl of prPlans) {
        if (pl.building_id && buildingMap[pl.building_id]) {
          buildingMap[pl.building_id].plans.push(pl);
        } else {
          unassignedPlans.push(pl);
        }
      }

      const bGroups: BuildingGroup[] = Object.values(buildingMap).filter((b) => b.plans.length > 0);
      if (unassignedPlans.length > 0) {
        bGroups.unshift({
          id: `unassigned-${pr.id}`,
          name: 'Plany kondygnacji',
          plans: unassignedPlans,
        });
      }

      const totalPlans = prPlans.length;
      const isFullyCached = totalPlans > 0 && prPlans.every((p: any) => p.isCached);

      return {
        id: pr.id,
        name: pr.name,
        company_name: pr.company_name,
        address: pr.address,
        buildings: bGroups,
        totalPlansCount: totalPlans,
        isFullyCached,
      };
    });

    // Filter out empty test projects or projects without any plans
    const validGroups = groups.filter((g) => g.totalPlansCount > 0);
    setProjectGroups(validGroups);
  };

  const syncPlansAndProjectsFromApiBackground = async (db: any) => {
    try {
      const { data: { session } } = await authSupabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const pRes = await fetch(`${API_BASE_URL}/api/projects`, { headers });
      if (!pRes.ok) return;

      const pJson = await pRes.json();
      const apiProjects = Array.isArray(pJson) ? pJson : (pJson?.data || []);
      if (apiProjects.length === 0) return;

      const now = new Date().toISOString();

      await Promise.all(
        apiProjects.map(async (p: any) => {
          const compName = p.companies?.name || null;
          await db.runAsync(
            `INSERT INTO projects (id, name, company_name, address, status, created_at, updated_at, version)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1)
             ON CONFLICT(id) DO UPDATE SET name = excluded.name, company_name = excluded.company_name, address = excluded.address, updated_at = excluded.updated_at;`,
            [p.id, p.name, compName, p.address || null, p.status || 'ACTIVE', p.created_at || now, p.updated_at || now]
          );

          const [bRes, fRes, planRes] = await Promise.all([
            fetch(`${API_BASE_URL}/api/buildings?projectId=${encodeURIComponent(p.id)}`, { headers }),
            fetch(`${API_BASE_URL}/api/floors?projectId=${encodeURIComponent(p.id)}`, { headers }),
            fetch(`${API_BASE_URL}/api/plans?projectId=${encodeURIComponent(p.id)}`, { headers }),
          ]);

          if (bRes.ok) {
            const bJson = await bRes.json();
            const bList = Array.isArray(bJson) ? bJson : (bJson?.data || []);
            for (const b of bList) {
              await db.runAsync(
                `INSERT INTO buildings (id, project_id, name, created_at, updated_at, version)
                 VALUES (?, ?, ?, ?, ?, 1)
                 ON CONFLICT(id) DO UPDATE SET name = excluded.name, project_id = excluded.project_id, updated_at = excluded.updated_at;`,
                [b.id, p.id, b.name, b.created_at || now, b.updated_at || now]
              );
            }
          }

          if (fRes.ok) {
            const fJson = await fRes.json();
            const fList = Array.isArray(fJson) ? fJson : (fJson?.data || []);
            for (const f of fList) {
              await db.runAsync(
                `INSERT INTO floors (id, building_id, name, level_number, created_at, updated_at, version)
                 VALUES (?, ?, ?, ?, ?, ?, 1)
                 ON CONFLICT(id) DO UPDATE SET name = excluded.name, building_id = excluded.building_id, updated_at = excluded.updated_at;`,
                [f.id, f.building_id, f.name, f.level || 0, f.created_at || now, f.updated_at || now]
              );
            }
          }

          if (planRes.ok) {
            const planJson = await planRes.json();
            const plansList = Array.isArray(planJson) ? planJson : (planJson?.data || []);
            for (const pl of plansList) {
              const bName = pl.floors?.buildings?.name || '';
              const fName = pl.floors?.name || '';
              const rawName = pl.name || 'Plan';
              const planName = [bName, fName, (rawName && rawName !== fName) ? rawName : ''].filter(Boolean).join(' · ') || rawName || 'Plan architektoniczny';
              await db.runAsync(
                `INSERT INTO plans (id, project_id, floor_id, name, width, height, created_at, updated_at, version)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
                 ON CONFLICT(id) DO UPDATE SET name = excluded.name, project_id = excluded.project_id, floor_id = excluded.floor_id, updated_at = excluded.updated_at;`,
                [pl.id, p.id, pl.floor_id || null, planName, pl.image_width || 1920, pl.image_height || 1080, pl.created_at || now, pl.updated_at || now]
              );
            }
          }
        })
      );

      await queryLocalPlans(db);
      await refreshCacheStats();
    } catch (apiErr) {
      console.warn('[PlansList] Live sync error:', apiErr);
    }
  };

  const loadData = useCallback(async () => {
    try {
      const db = await getDatabase();
      // 1. Instant load from SQLite (0ms UI render)
      await queryLocalPlans(db);
      setLoading(false);
      setRefreshing(false);

      // 2. Non-blocking background cache calculation & sync
      refreshCacheStats();
      syncPlansAndProjectsFromApiBackground(db);
    } catch (err) {
      console.error('[PlansList] Load error:', err);
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    getDatabase().then((db) => {
      syncPlansAndProjectsFromApiBackground(db).finally(() => setRefreshing(false));
    });
  };

  const handleDownloadProjectOffline = async (group: ProjectGroup) => {
    if (downloadState.isDownloading) {
      Alert.alert('Pobieranie w toku', 'Trwa już pobieranie planów w tle. Możesz opuścić tę zakładkę.');
      return;
    }
    TileDownloadManager.startProjectDownload(group.id, group.name);
  };

  const handleDownloadSinglePlan = async (plan: PlanItem) => {
    if (downloadState.isDownloading) {
      Alert.alert('Pobieranie w toku', 'Trwa już pobieranie planów w tle.');
      return;
    }
    TileDownloadManager.startPlanDownload(plan.id, plan.name);
  };

  const handleClearAllCache = async () => {
    Alert.alert(
      'Wyczyść pamięć podręczną',
      `Czy chcesz usunąć wszystkie pobrane kafelki planów (${TileCacheService.formatBytes(totalCacheBytes)}) z pamięci telefonu?`,
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Wyczyść',
          style: 'destructive',
          onPress: async () => {
            await TileCacheService.clearAllTileCache();
            await loadData();
            Alert.alert('Pamięć wyczyszczona', 'Pamięć podręczna planów została zwolniona.');
          },
        },
      ]
    );
  };

  const toggleProjectExpand = (projectId: string) => {
    setExpandedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  const toggleBuildingExpand = (buildingId: string) => {
    setExpandedBuildingIds((prev) => {
      const next = new Set(prev);
      if (next.has(buildingId)) next.delete(buildingId);
      else next.add(buildingId);
      return next;
    });
  };

  const q = search.trim().toLowerCase();
  const filteredGroups = useMemo(() => {
    if (!q) return projectGroups;
    return projectGroups
      .map((g) => {
        const matchesProject = g.name.toLowerCase().includes(q) || (g.company_name && g.company_name.toLowerCase().includes(q));
        const filteredBuildings = g.buildings
          .map((b) => {
            const matchesBuilding = b.name.toLowerCase().includes(q);
            const matchingPlans = b.plans.filter(
              (p) => p.name.toLowerCase().includes(q) || (p.floor_name && p.floor_name.toLowerCase().includes(q))
            );
            if (matchesBuilding || matchingPlans.length > 0) {
              return {
                ...b,
                plans: matchesBuilding ? b.plans : matchingPlans,
              };
            }
            return null;
          })
          .filter(Boolean) as BuildingGroup[];

        if (matchesProject || filteredBuildings.length > 0) {
          return {
            ...g,
            buildings: matchesProject ? g.buildings : filteredBuildings,
          };
        }
        return null;
      })
      .filter(Boolean) as ProjectGroup[];
  }, [projectGroups, q]);

  const totalPlansCount = useMemo(() => {
    return projectGroups.reduce((acc, g) => acc + g.totalPlansCount, 0);
  }, [projectGroups]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{
          title: 'Baupläne (Leaflet)',
          headerShown: true,
          headerBackTitle: 'Wstecz',
          headerStyle: { backgroundColor: '#0B0F19' },
          headerTintColor: '#38BDF8',
          headerTitleStyle: { color: '#F8FAFC', fontWeight: '800' },
        }}
      />

      {/* Header controls & stats */}
      <View style={styles.headerControls}>
        <View style={styles.searchSection}>
          <TextInput
            style={styles.searchInput}
            placeholder="Pläne oder Geschosse durchsuchen..."
            placeholderTextColor="#64748B"
            value={search}
            onChangeText={setSearch}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')} style={styles.clearSearchBtn}>
              <Text style={styles.clearSearchText}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Storage status & Controls */}
        <View style={styles.storageStatusRow}>
          <View style={styles.storageLeft}>
            <Text style={styles.storageText}>
              💾 Offline-Cache: <Text style={styles.storageHighlight}>{TileCacheService.formatBytes(totalCacheBytes)}</Text>
            </Text>
          </View>
          {totalCacheBytes > 0 && (
            <TouchableOpacity style={styles.clearCacheBtn} onPress={handleClearAllCache}>
              <Text style={styles.clearCacheBtnText}>🗑️ Leeren</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.summaryInfoRow}>
          <Text style={styles.summaryInfoText}>
            🏢 {projectGroups.length} Projekte • 📐 {totalPlansCount} Pläne
          </Text>
          <View style={styles.expandToggleRow}>
            <TouchableOpacity
              style={styles.expandBtn}
              onPress={() => {
                setExpandedProjectIds(new Set(projectGroups.map((g) => g.id)));
                const bSet = new Set<string>();
                projectGroups.forEach((g) => g.buildings.forEach((b) => bSet.add(b.id)));
                setExpandedBuildingIds(bSet);
              }}
            >
              <Text style={styles.expandBtnText}>⊞ Alle auf</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.expandBtn}
              onPress={() => {
                setExpandedProjectIds(new Set());
                setExpandedBuildingIds(new Set());
              }}
            >
              <Text style={styles.expandBtnText}>⊟ Alle zu</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Real-time Project Download Progress Bar (Persistent across navigation) */}
        {downloadState.isDownloading && (
          <View style={styles.downloadProgressBanner}>
            <View style={styles.downloadProgressHeader}>
              <ActivityIndicator size="small" color="#38BDF8" />
              <Text style={styles.downloadProgressTitle}>
                Pobieranie w tle: Plan {downloadState.completedItems + 1}/{downloadState.totalItems}
              </Text>
            </View>
            <Text style={styles.downloadProgressPlanName} numberOfLines={1}>
              {downloadState.currentPlanName}
            </Text>
            <View style={styles.progressBarBackground}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: `${Math.round(
                      ((downloadState.completedItems +
                        ((downloadState.planProgress?.completed || 0) /
                          (downloadState.planProgress?.total || 1))) /
                        (downloadState.totalItems || 1)) *
                        100
                    )}%`,
                  },
                ]}
              />
            </View>
          </View>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#38BDF8" />
          <Text style={styles.loadingText}>Pläne werden synchronisiert...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredGroups}
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
              <Text style={styles.emptyTitle}>Brak projektów lub planów</Text>
              <Text style={styles.emptySubtitle}>
                Nie znaleziono aktywnych rzutów pasujących do wyszukiwania.
              </Text>
            </View>
          }
          renderItem={({ item: group }) => {
            const isExpanded = expandedProjectIds.has(group.id) || q.length > 0;
            const isDownloadingThis = downloadState.isDownloading && downloadState.targetId === group.id;

            return (
              <View style={styles.projectCard}>
                {/* Project Accordion Header */}
                <TouchableOpacity
                  style={styles.accordionHeader}
                  activeOpacity={0.7}
                  onPress={() => toggleProjectExpand(group.id)}
                >
                  <View style={styles.accordionLeft}>
                    <Text style={styles.projectIcon}>📁</Text>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Text style={styles.projectName}>{group.name}</Text>
                        {group.company_name && (
                          <View style={styles.companyBadge}>
                            <Text style={styles.companyBadgeText}>{group.company_name}</Text>
                          </View>
                        )}
                      </View>
                      {group.address ? (
                        <Text style={styles.projectAddressText}>📍 {group.address}</Text>
                      ) : null}
                      <View style={styles.projectSubRow}>
                        <Text style={styles.projectSubtext}>
                          {group.buildings.length} {group.buildings.length === 1 ? 'budynek' : 'budynków'} • {group.totalPlansCount} rzutów
                        </Text>
                        {group.isFullyCached && (
                          <View style={styles.cachedBadge}>
                            <Text style={styles.cachedBadgeText}>✅ Offline bereit</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>

                  <View style={styles.accordionRight}>
                    {/* Quick Download Entire Project Offline Button */}
                    <TouchableOpacity
                      style={[
                        styles.projectOfflineBtn,
                        group.isFullyCached && styles.projectOfflineBtnCached,
                        isDownloadingThis && styles.projectOfflineBtnActive,
                      ]}
                      onPress={() => handleDownloadProjectOffline(group)}
                      disabled={isDownloadingThis}
                    >
                      {isDownloadingThis ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={styles.projectOfflineBtnText}>
                          {group.isFullyCached ? '💾 Aktualny' : '⬇️ Offline'}
                        </Text>
                      )}
                    </TouchableOpacity>

                    <Text style={styles.accordionArrow}>{isExpanded ? '▲' : '▼'}</Text>
                  </View>
                </TouchableOpacity>

                {/* Buildings & Plans Container */}
                {isExpanded && (
                  <View style={styles.projectBody}>
                    {group.buildings.map((building) => {
                      const isBuildingExpanded = expandedBuildingIds.has(building.id) || q.length > 0;
                      return (
                        <View key={building.id} style={styles.buildingSection}>
                          <TouchableOpacity
                            style={styles.buildingHeader}
                            onPress={() => toggleBuildingExpand(building.id)}
                          >
                            <Text style={styles.buildingIcon}>🏢</Text>
                            <Text style={styles.buildingName}>{building.name}</Text>
                            <Text style={styles.buildingCount}>({building.plans.length})</Text>
                            <Text style={styles.buildingArrow}>{isBuildingExpanded ? '−' : '+'}</Text>
                          </TouchableOpacity>

                          {isBuildingExpanded && (
                            <View style={styles.plansGrid}>
                              {building.plans.map((plan) => (
                                <TouchableOpacity
                                  key={plan.id}
                                  style={styles.planCard}
                                  activeOpacity={0.7}
                                  onPress={() => {
                                    router.push({ pathname: '/plans/[id]', params: { id: plan.id } } as any);
                                  }}
                                >
                                  <View style={styles.planCardLeft}>
                                    <Text style={styles.planIcon}>📐</Text>
                                    <View style={{ flex: 1 }}>
                                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <Text style={styles.planName}>{plan.name}</Text>
                                        {plan.isCached && (
                                          <Text style={styles.cachedPlanBadge}>💾</Text>
                                        )}
                                      </View>
                                      {plan.floor_name ? (
                                        <Text style={styles.floorName}>Kondygnacja: {plan.floor_name}</Text>
                                      ) : null}
                                    </View>
                                  </View>

                                  <View style={styles.planCardRight}>
                                    {plan.circuit_count ? (
                                      <View style={styles.circuitBadge}>
                                        <Text style={styles.circuitBadgeText}>⚡ {plan.circuit_count}</Text>
                                      </View>
                                    ) : null}
                                    {plan.bma_count ? (
                                      <View style={styles.bmaBadge}>
                                        <Text style={styles.bmaBadgeText}>🚨 {plan.bma_count}</Text>
                                      </View>
                                    ) : null}
                                    <TouchableOpacity
                                      style={[
                                        styles.singlePlanOfflineBtn,
                                        plan.isCached && styles.singlePlanOfflineBtnCached,
                                      ]}
                                      onPress={(e) => {
                                        e.stopPropagation();
                                        handleDownloadSinglePlan(plan);
                                      }}
                                    >
                                      <Text style={styles.singlePlanOfflineBtnText}>
                                        {plan.isCached ? '💾' : '⬇️'}
                                      </Text>
                                    </TouchableOpacity>
                                    <Text style={styles.arrowIcon}>➔</Text>
                                  </View>
                                </TouchableOpacity>
                              ))}
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  headerControls: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  searchSection: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#F8FAFC',
    fontSize: 13,
  },
  clearSearchBtn: {
    position: 'absolute',
    right: 10,
    padding: 4,
  },
  clearSearchText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: 'bold',
  },
  storageStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  storageLeft: { flex: 1 },
  storageText: { color: '#94A3B8', fontSize: 11, fontWeight: '600' },
  storageHighlight: { color: '#38BDF8', fontWeight: '800' },
  clearCacheBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: '#EF4444',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  clearCacheBtnText: { color: '#EF4444', fontSize: 10, fontWeight: '800' },
  summaryInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  summaryInfoText: { color: '#64748B', fontSize: 11, fontWeight: '600' },
  expandToggleRow: { flexDirection: 'row', gap: 6 },
  expandBtn: {
    backgroundColor: '#1E293B',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#334155',
  },
  expandBtnText: { color: '#94A3B8', fontSize: 10, fontWeight: '700' },
  downloadProgressBanner: {
    marginTop: 8,
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderWidth: 1,
    borderColor: '#38BDF8',
    borderRadius: 8,
    padding: 10,
  },
  downloadProgressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  downloadProgressTitle: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '800',
  },
  downloadProgressPlanName: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
    marginBottom: 6,
  },
  progressBarBackground: {
    height: 6,
    backgroundColor: '#1E293B',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#38BDF8',
  },
  list: { padding: 14, paddingBottom: 40 },
  projectCard: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    overflow: 'hidden',
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
  },
  accordionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  projectIcon: { fontSize: 24, marginRight: 10 },
  projectName: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '800',
  },
  companyBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  companyBadgeText: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: '900',
  },
  projectAddressText: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  projectSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  projectSubtext: {
    color: '#64748B',
    fontSize: 11,
  },
  cachedBadge: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  cachedBadgeText: {
    color: '#22C55E',
    fontSize: 9,
    fontWeight: '800',
  },
  accordionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  projectOfflineBtn: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderWidth: 1,
    borderColor: '#38BDF8',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  projectOfflineBtnCached: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderColor: '#22C55E',
  },
  projectOfflineBtnActive: {
    backgroundColor: '#0284C7',
  },
  projectOfflineBtnText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '800',
  },
  accordionArrow: {
    color: '#64748B',
    fontSize: 12,
  },
  projectBody: {
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    padding: 10,
  },
  buildingSection: {
    marginBottom: 8,
  },
  buildingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#162238',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  buildingIcon: { fontSize: 16, marginRight: 8 },
  buildingName: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '800',
    flex: 1,
  },
  buildingCount: { color: '#64748B', fontSize: 11, marginRight: 8 },
  buildingArrow: { color: '#38BDF8', fontSize: 14, fontWeight: 'bold' },
  plansGrid: {
    paddingTop: 8,
    paddingLeft: 8,
  },
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E293B',
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  planCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  planIcon: { fontSize: 18, marginRight: 8 },
  planName: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700',
  },
  cachedPlanBadge: { fontSize: 12 },
  floorName: {
    color: '#64748B',
    fontSize: 10,
    marginTop: 2,
  },
  planCardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  circuitBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  circuitBadgeText: { color: '#38BDF8', fontSize: 10, fontWeight: '800' },
  bmaBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  bmaBadgeText: { color: '#EF4444', fontSize: 10, fontWeight: '800' },
  singlePlanOfflineBtn: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: '#1E293B',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  singlePlanOfflineBtnCached: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderColor: '#22C55E',
  },
  singlePlanOfflineBtnText: {
    fontSize: 11,
  },
  arrowIcon: { color: '#38BDF8', fontSize: 12, fontWeight: '900' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  loadingText: { color: '#94A3B8', fontSize: 13, marginTop: 12 },
  emptyTitle: { color: '#F8FAFC', fontSize: 16, fontWeight: '800', marginBottom: 4 },
  emptySubtitle: { color: '#64748B', fontSize: 12, textAlign: 'center' },
});
