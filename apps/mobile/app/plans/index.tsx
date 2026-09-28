import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  RefreshControl,
  Alert,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDatabase } from '../../src/db/database';
import { authSupabase } from '../../src/auth/authClient';
import { TileCacheService, ProjectCacheProgress } from '../../src/features/tiles/TileCacheService';

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
  const [downloadingProjectId, setDownloadingProjectId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<ProjectCacheProgress | null>(null);

  const refreshCacheStats = async () => {
    try {
      const bytes = await TileCacheService.getTotalCacheSize();
      setTotalCacheBytes(bytes);
    } catch {}
  };

  const syncPlansAndProjectsFromApi = async (db: any) => {
    try {
      const { data: { session } } = await authSupabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      // 1. Fetch user's active company projects (matching web)
      const pRes = await fetch(`${API_BASE_URL}/api/projects`, { headers });
      if (!pRes.ok) return;

      const pJson = await pRes.json();
      const apiProjects = Array.isArray(pJson) ? pJson : (pJson?.data || []);
      if (apiProjects.length === 0) return;

      const now = new Date().toISOString();

      for (const p of apiProjects) {
        const compName = p.companies?.name || null;
        await db.runAsync(
          `INSERT INTO projects (id, name, company_name, address, status, created_at, updated_at, version)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1)
           ON CONFLICT(id) DO UPDATE SET name = excluded.name, company_name = excluded.company_name, address = excluded.address, updated_at = excluded.updated_at;`,
          [p.id, p.name, compName, p.address || null, p.status || 'ACTIVE', p.created_at || now, p.updated_at || now]
        );

        // 2. Fetch buildings for this project
        const bRes = await fetch(`${API_BASE_URL}/api/buildings?projectId=${encodeURIComponent(p.id)}`, { headers });
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

        // 3. Fetch floors for this project
        const fRes = await fetch(`${API_BASE_URL}/api/floors?projectId=${encodeURIComponent(p.id)}`, { headers });
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

        // 4. Fetch all plans for this project
        const planRes = await fetch(`${API_BASE_URL}/api/plans?projectId=${encodeURIComponent(p.id)}`, { headers });
        if (planRes.ok) {
          const planJson = await planRes.json();
          const plansList = Array.isArray(planJson) ? planJson : (planJson?.data || []);
          for (const pl of plansList) {
            const planName = pl.name || pl.floors?.name || pl.pdf_path?.split('/')?.pop() || 'Plan architektoniczny';
            await db.runAsync(
              `INSERT INTO plans (id, project_id, floor_id, name, width, height, created_at, updated_at, version)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
               ON CONFLICT(id) DO UPDATE SET name = excluded.name, project_id = excluded.project_id, floor_id = excluded.floor_id, updated_at = excluded.updated_at;`,
              [pl.id, p.id, pl.floor_id || null, planName, pl.image_width || 1920, pl.image_height || 1080, pl.created_at || now, pl.updated_at || now]
            );
          }
        }
      }
    } catch (apiErr) {
      console.warn('[PlansList] Live sync error:', apiErr);
    }
  };

  const loadData = useCallback(async () => {
    try {
      const db = await getDatabase();
      await syncPlansAndProjectsFromApi(db);

      // Query projects, buildings and plans
      const projs = await db.getAllAsync<{ id: string; name: string; company_name?: string; address?: string }>(
        "SELECT id, name, company_name, address FROM projects WHERE deleted_at IS NULL ORDER BY name ASC;"
      );

      const allBuildings = await db.getAllAsync<{ id: string; project_id: string; name: string }>(
        "SELECT id, project_id, name FROM buildings WHERE deleted_at IS NULL ORDER BY name ASC;"
      );

      const allPlans = await db.getAllAsync<PlanItem>(`
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
      `);

      // Check cache status for each plan
      const cachedSet = new Set<string>();
      if (allPlans) {
        for (const pl of allPlans) {
          const isCached = await TileCacheService.isPlanCachedLocally(pl.id);
          if (isCached) cachedSet.add(pl.id);
        }
      }
      setCachedPlanIds(cachedSet);

      const matchedPlanIds = new Set<string>();
      const groups: ProjectGroup[] = projs.map((pr) => {
        const prPlans = (allPlans || []).filter((pl) => pl.project_id === pr.id);
        prPlans.forEach((p) => {
          matchedPlanIds.add(p.id);
          p.isCached = cachedSet.has(p.id);
        });
        const prBuildings = (allBuildings || []).filter((b) => b.project_id === pr.id);

        const buildingMap: Record<string, BuildingGroup> = {};
        for (const b of prBuildings) {
          buildingMap[b.id] = { id: b.id, name: b.name, plans: [] };
        }

        for (const pl of prPlans) {
          const bId = pl.building_id || 'unassigned';
          if (!buildingMap[bId]) {
            buildingMap[bId] = { id: bId, name: pl.building_name || 'Główny budynek', plans: [] };
          }
          buildingMap[bId].plans.push(pl);
        }

        const buildingsList = Object.values(buildingMap).filter((bg) => bg.plans.length > 0 || prBuildings.some((b) => b.id === bg.id));
        const allPrPlansCached = prPlans.length > 0 && prPlans.every((pl) => cachedSet.has(pl.id));

        return {
          id: pr.id,
          name: pr.name,
          company_name: pr.company_name,
          address: pr.address,
          buildings: buildingsList,
          totalPlansCount: prPlans.length,
          isFullyCached: allPrPlansCached,
        };
      });

      // Catch any standalone plans
      const orphanPlans = (allPlans || []).filter((pl) => !matchedPlanIds.has(pl.id));
      if (orphanPlans.length > 0) {
        orphanPlans.forEach((p) => {
          p.isCached = cachedSet.has(p.id);
        });
        groups.push({
          id: 'unassigned-project',
          name: 'Pozostałe / Rzuty architektoniczne',
          buildings: [
            {
              id: 'unassigned-building',
              name: 'Wszystkie rzuty',
              plans: orphanPlans,
            },
          ],
          totalPlansCount: orphanPlans.length,
          isFullyCached: orphanPlans.every((pl) => cachedSet.has(pl.id)),
        });
      }

      setProjectGroups(groups);
      await refreshCacheStats();
    } catch (err) {
      console.error('[PlansList] Load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleDownloadProjectOffline = async (group: ProjectGroup) => {
    if (downloadingProjectId) return;
    try {
      setDownloadingProjectId(group.id);
      setDownloadProgress({
        totalPlans: group.totalPlansCount,
        completedPlans: 0,
        currentPlanName: group.name,
        planProgress: { total: 100, completed: 0, currentZoom: 1 },
      });

      const res = await TileCacheService.prefetchProjectPlans(group.id, (prog) => {
        setDownloadProgress({ ...prog });
      });

      if (res.success) {
        Alert.alert('✅ Pomyślnie pobrano', `Projekt "${group.name}" jest dostępny offline bez dostępu do Internetu.`);
      } else {
        Alert.alert('Uwaga', 'Część kafelków mogła nie zostać pobrana. Sprawdź połączenie.');
      }

      await loadData();
    } catch (e: any) {
      Alert.alert('Błąd pobierania', e?.message || 'Nie udało się pobrać planów do trybu offline.');
    } finally {
      setDownloadingProjectId(null);
      setDownloadProgress(null);
    }
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

  // Filter groups based on search
  const q = search.toLowerCase().trim();
  const filteredGroups = projectGroups
    .map((g) => {
      const matchesProjectName = g.name.toLowerCase().includes(q) || (g.company_name && g.company_name.toLowerCase().includes(q));
      const filteredBuildings = g.buildings
        .map((b) => {
          const matchesBuildingName = b.name.toLowerCase().includes(q);
          const matchingPlans = b.plans.filter(
            (p) =>
              matchesProjectName ||
              matchesBuildingName ||
              p.name.toLowerCase().includes(q) ||
              (p.floor_name && p.floor_name.toLowerCase().includes(q))
          );
          return {
            ...b,
            plans: q ? matchingPlans : b.plans,
            hasMatch: matchesBuildingName || matchingPlans.length > 0,
          };
        })
        .filter((b) => (q ? b.hasMatch : true));

      return {
        ...g,
        buildings: filteredBuildings,
        hasMatch: matchesProjectName || filteredBuildings.length > 0,
      };
    })
    .filter((g) => (q ? g.hasMatch : true));

  const totalPlansCount = projectGroups.reduce((acc, g) => acc + g.totalPlansCount, 0);

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{
          title: 'Baupläne (et4u)',
          headerShown: true,
          headerBackTitle: 'Zurück',
          headerStyle: { backgroundColor: '#0B0F19' },
          headerTintColor: '#38BDF8',
          headerTitleStyle: { color: '#F8FAFC', fontWeight: '700' },
        }}
      />

      {/* Top Offline Storage & Search Header */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Projekt, Gebäude oder Plan suchen..."
          placeholderTextColor="#64748B"
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
        />

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

        {/* Real-time Project Download Progress Bar */}
        {downloadingProjectId && downloadProgress && (
          <View style={styles.downloadProgressBanner}>
            <View style={styles.downloadProgressHeader}>
              <ActivityIndicator size="small" color="#38BDF8" />
              <Text style={styles.downloadProgressTitle}>
                Pobieranie: Plan {downloadProgress.completedPlans + 1}/{downloadProgress.totalPlans}
              </Text>
            </View>
            <Text style={styles.downloadProgressPlanName} numberOfLines={1}>
              {downloadProgress.currentPlanName}
            </Text>
            <View style={styles.progressBarBackground}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: `${Math.round(
                      ((downloadProgress.completedPlans + (downloadProgress.planProgress.completed / (downloadProgress.planProgress.total || 1))) /
                        (downloadProgress.totalPlans || 1)) *
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
            const isDownloadingThis = downloadingProjectId === group.id;

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
                      disabled={isDownloadingThis}
                      onPress={() => handleDownloadProjectOffline(group)}
                    >
                      {isDownloadingThis ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={styles.projectOfflineBtnText}>
                          {group.isFullyCached ? '🔄 Aktualisieren' : '⬇️ Offline'}
                        </Text>
                      )}
                    </TouchableOpacity>

                    <Text style={styles.chevron}>{isExpanded ? '▲' : '▼'}</Text>
                  </View>
                </TouchableOpacity>

                {/* Project Accordion Body (Buildings & Plans) */}
                {isExpanded && (
                  <View style={styles.accordionBody}>
                    {group.buildings.length === 0 ? (
                      <View style={styles.emptyPlansBox}>
                        <Text style={styles.emptyPlansText}>Brak zdefiniowanych budynków i planów dla tego projektu.</Text>
                      </View>
                    ) : (
                      group.buildings.map((bldg) => {
                        const isBldgExpanded = expandedBuildingIds.has(bldg.id) || q.length > 0;
                        return (
                          <View key={bldg.id} style={styles.buildingContainer}>
                            {/* Building Header */}
                            <TouchableOpacity
                              style={styles.buildingHeader}
                              activeOpacity={0.7}
                              onPress={() => toggleBuildingExpand(bldg.id)}
                            >
                              <View style={styles.buildingHeaderLeft}>
                                <Text style={styles.buildingIcon}>🏢</Text>
                                <Text style={styles.buildingTitle}>{bldg.name}</Text>
                              </View>
                              <View style={styles.buildingHeaderRight}>
                                <Text style={styles.buildingCountBadge}>{bldg.plans.length} rzutów</Text>
                                <Text style={styles.chevronSmall}>{isBldgExpanded ? '▲' : '▼'}</Text>
                              </View>
                            </TouchableOpacity>

                            {/* Plans under Building */}
                            {isBldgExpanded && (
                              <View style={styles.buildingPlansList}>
                                {bldg.plans.length === 0 ? (
                                  <Text style={styles.emptyBuildingPlans}>Brak aktywnych planów w tym budynku.</Text>
                                ) : (
                                  bldg.plans.map((plan) => (
                                    <TouchableOpacity
                                      key={plan.id}
                                      style={styles.planItemCard}
                                      activeOpacity={0.8}
                                      onPress={() => router.push({ pathname: '/plans/[id]', params: { id: plan.id } } as any)}
                                    >
                                      <View style={styles.planMainRow}>
                                        <Text style={styles.planIcon}>📐</Text>
                                        <View style={{ flex: 1 }}>
                                          <View style={styles.planTitleRow}>
                                            <Text style={styles.planTitle}>{plan.name}</Text>
                                            {cachedPlanIds.has(plan.id) && (
                                              <View style={styles.planCachedTag}>
                                                <Text style={styles.planCachedTagText}>💾 Offline</Text>
                                              </View>
                                            )}
                                          </View>
                                          {plan.floor_name ? (
                                            <Text style={styles.floorTitle}>Kondygnacja: {plan.floor_name}</Text>
                                          ) : null}
                                        </View>
                                        <Text style={styles.arrowIcon}>➔</Text>
                                      </View>

                                      <View style={styles.badgeRow}>
                                        <View style={styles.badgeTask}>
                                          <Text style={styles.badgeTaskText}>📌 {plan.task_count || 0} zadań</Text>
                                        </View>
                                        <View style={styles.badgeBma}>
                                          <Text style={styles.badgeBmaText}>🚨 {plan.bma_count || 0} BMA</Text>
                                        </View>
                                        {plan.circuit_count ? (
                                          <View style={styles.badgeCircuit}>
                                            <Text style={styles.badgeCircuitText}>⚡ {plan.circuit_count} obwodów</Text>
                                          </View>
                                        ) : null}
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
  container: {
    flex: 1,
    backgroundColor: '#030712',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: '#0B0F19',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  searchInput: {
    backgroundColor: '#030712',
    color: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  storageStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingVertical: 4,
    paddingHorizontal: 6,
    backgroundColor: '#0F172A',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  storageLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  storageText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  storageHighlight: {
    color: '#38BDF8',
    fontWeight: '700',
  },
  clearCacheBtn: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    backgroundColor: '#334155',
    borderRadius: 4,
  },
  clearCacheBtnText: {
    color: '#F1F5F9',
    fontSize: 11,
    fontWeight: '700',
  },
  summaryInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  summaryInfoText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  expandToggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  expandBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  expandBtnText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '700',
  },
  downloadProgressBanner: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#0F172A',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#0284C7',
  },
  downloadProgressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  downloadProgressTitle: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
  },
  downloadProgressPlanName: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
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
    borderRadius: 3,
  },
  list: {
    padding: 16,
    gap: 12,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    color: '#94A3B8',
    fontSize: 14,
  },
  emptyTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptySubtitle: {
    color: '#64748B',
    fontSize: 13,
    textAlign: 'center',
  },
  projectCard: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
    overflow: 'hidden',
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    backgroundColor: '#0F172A',
  },
  accordionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  projectIcon: {
    fontSize: 22,
  },
  projectName: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
  },
  companyBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  companyBadgeText: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: '800',
  },
  projectAddressText: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 1,
  },
  projectSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  projectSubtext: {
    color: '#64748B',
    fontSize: 12,
  },
  cachedBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#10B981',
  },
  cachedBadgeText: {
    color: '#34D399',
    fontSize: 10,
    fontWeight: '700',
  },
  accordionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  projectOfflineBtn: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  projectOfflineBtnCached: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  projectOfflineBtnActive: {
    backgroundColor: '#0369A1',
    minWidth: 50,
    alignItems: 'center',
  },
  projectOfflineBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  chevron: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '800',
  },
  accordionBody: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: '#0B0F19',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    gap: 10,
    paddingTop: 10,
  },
  emptyPlansBox: {
    padding: 12,
    alignItems: 'center',
  },
  emptyPlansText: {
    color: '#64748B',
    fontSize: 13,
  },
  buildingContainer: {
    backgroundColor: '#0F172A',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
    overflow: 'hidden',
  },
  buildingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#131D31',
  },
  buildingHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  buildingIcon: {
    fontSize: 15,
  },
  buildingTitle: {
    color: '#F1F5F9',
    fontSize: 13,
    fontWeight: '600',
  },
  buildingHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  buildingCountBadge: {
    color: '#94A3B8',
    fontSize: 11,
  },
  chevronSmall: {
    color: '#64748B',
    fontSize: 11,
  },
  buildingPlansList: {
    padding: 8,
    gap: 8,
    backgroundColor: '#0F172A',
  },
  emptyBuildingPlans: {
    color: '#64748B',
    fontSize: 12,
    padding: 8,
  },
  planItemCard: {
    backgroundColor: '#1E293B',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  planMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  planIcon: {
    fontSize: 18,
  },
  planTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  planTitle: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  planCachedTag: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  planCachedTagText: {
    color: '#38BDF8',
    fontSize: 9,
    fontWeight: '700',
  },
  floorTitle: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  arrowIcon: {
    color: '#38BDF8',
    fontSize: 14,
    fontWeight: '800',
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  badgeTask: {
    backgroundColor: 'rgba(2, 132, 199, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#0284C7',
  },
  badgeTaskText: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: '700',
  },
  badgeBma: {
    backgroundColor: 'rgba(220, 38, 38, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#DC2626',
  },
  badgeBmaText: {
    color: '#F87171',
    fontSize: 10,
    fontWeight: '700',
  },
  badgeCircuit: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#8B5CF6',
  },
  badgeCircuitText: {
    color: '#C084FC',
    fontSize: 10,
    fontWeight: '700',
  },
});
