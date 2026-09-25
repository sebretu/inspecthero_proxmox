import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDatabase } from '../../src/db/database';
import { authSupabase } from '../../src/auth/authClient';

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
}

interface BuildingGroup {
  id: string;
  name: string;
  plans: PlanItem[];
}

interface ProjectGroup {
  id: string;
  name: string;
  buildings: BuildingGroup[];
  totalPlansCount: number;
}

export default function PlansListScreen() {
  const router = useRouter();
  const [projectGroups, setProjectGroups] = useState<ProjectGroup[]>([]);
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(new Set());
  const [expandedBuildingIds, setExpandedBuildingIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
      const validProjectIds: string[] = [];
      const validPlanIds: string[] = [];

      for (const p of apiProjects) {
        validProjectIds.push(p.id);
        await db.runAsync(
          `INSERT INTO projects (id, name, status, created_at, updated_at, version)
           VALUES (?, ?, ?, ?, ?, 1)
           ON CONFLICT(id) DO UPDATE SET name = excluded.name, status = excluded.status, updated_at = excluded.updated_at;`,
          [p.id, p.name, p.status || 'ACTIVE', p.created_at || now, p.updated_at || now]
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
            validPlanIds.push(pl.id);
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
      const projs = await db.getAllAsync<{ id: string; name: string }>(
        "SELECT id, name FROM projects WHERE deleted_at IS NULL ORDER BY name ASC;"
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

      const matchedPlanIds = new Set<string>();
      const groups: ProjectGroup[] = projs.map((pr) => {
        const prPlans = (allPlans || []).filter((pl) => pl.project_id === pr.id);
        prPlans.forEach((p) => matchedPlanIds.add(p.id));
        const prBuildings = (allBuildings || []).filter((b) => b.project_id === pr.id);

        // Group plans by building
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

        return {
          id: pr.id,
          name: pr.name,
          buildings: buildingsList,
          totalPlansCount: prPlans.length,
        };
      });

      // Catch any standalone or unassigned plans
      const orphanPlans = (allPlans || []).filter((pl) => !matchedPlanIds.has(pl.id));
      if (orphanPlans.length > 0) {
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
        });
      }

      setProjectGroups(groups);

      // Projects are COLLAPSED by default as requested by user
      setExpandedProjectIds(new Set());
      setExpandedBuildingIds(new Set());
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
      const matchesProjectName = g.name.toLowerCase().includes(q);
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

      {/* Search Header */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Projekt, Gebäude oder Plan suchen..."
          placeholderTextColor="#64748B"
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
        />
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
                    <View>
                      <Text style={styles.projectName}>{group.name}</Text>
                      <Text style={styles.projectSubtext}>
                        {group.buildings.length} {group.buildings.length === 1 ? 'budynek' : 'budynków'} • {group.totalPlansCount} rzutów
                      </Text>
                    </View>
                  </View>

                  <View style={styles.accordionRight}>
                    <View style={styles.planCountBadge}>
                      <Text style={styles.planCountText}>{group.totalPlansCount}</Text>
                    </View>
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
                                          <Text style={styles.planTitle}>{plan.name}</Text>
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
  summaryInfoRow: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  summaryInfoText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },
  expandToggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  expandBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 10,
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
  list: {
    padding: 14,
    paddingBottom: 40,
  },
  projectCard: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
    overflow: 'hidden',
  },
  accordionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#0F172A',
  },
  accordionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  projectIcon: {
    fontSize: 22,
    marginRight: 10,
  },
  projectName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 2,
  },
  projectSubtext: {
    fontSize: 12,
    color: '#64748B',
  },
  accordionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  planCountBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  planCountText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
  },
  chevron: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '800',
  },
  accordionBody: {
    padding: 10,
    backgroundColor: '#070D1A',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    gap: 8,
  },
  emptyPlansBox: {
    padding: 12,
    alignItems: 'center',
  },
  emptyPlansText: {
    fontSize: 12,
    color: '#64748B',
  },
  planItemCard: {
    backgroundColor: '#0F172A',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  planMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  planIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  planTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  floorTitle: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 1,
  },
  arrowIcon: {
    fontSize: 14,
    color: '#38BDF8',
    fontWeight: '800',
    marginLeft: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  buildingContainer: {
    backgroundColor: '#0B132B',
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
    overflow: 'hidden',
  },
  buildingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#0E1738',
  },
  buildingHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  buildingIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  buildingTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#38BDF8',
  },
  buildingHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  buildingCountBadge: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  },
  chevronSmall: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '800',
  },
  buildingPlansList: {
    padding: 8,
    gap: 8,
    backgroundColor: '#060B1A',
  },
  emptyBuildingPlans: {
    fontSize: 11,
    color: '#64748B',
    padding: 8,
    textAlign: 'center',
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
    color: '#F8FAFC',
    fontWeight: '700',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
  },
});
