import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDatabase } from '../../src/db/database';
import { authSupabase } from '../../src/auth/authClient';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://inspecthero.pl';

interface PlanWithCircuits {
  id: string;
  name: string;
  project_id: string;
  project_name: string;
  company_name?: string;
  floor_name?: string;
  circuit_count: number;
}

interface ProjectGroupWithCircuits {
  id: string;
  name: string;
  company_name?: string;
  plans: PlanWithCircuits[];
  totalCircuits: number;
}

export default function CircuitsScreen() {
  const router = useRouter();
  const [projectGroups, setProjectGroups] = useState<ProjectGroupWithCircuits[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const syncCircuitsFromApi = async (db: any) => {
    try {
      const { data: { session } } = await authSupabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      // 1. Fetch user's projects
      const pRes = await fetch(`${API_BASE_URL}/api/projects`, { headers });
      if (pRes.ok) {
        const pJson = await pRes.json();
        const apiProjects = Array.isArray(pJson) ? pJson : (pJson?.data || []);
        const now = new Date().toISOString();

        for (const p of apiProjects) {
          const compName = p.companies?.name || null;
          await db.runAsync(
            `INSERT INTO projects (id, name, company_name, address, status, created_at, updated_at, version)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1)
             ON CONFLICT(id) DO UPDATE SET name = excluded.name, company_name = excluded.company_name, address = excluded.address, updated_at = excluded.updated_at;`,
            [p.id, p.name, compName, p.address || null, p.status || 'ACTIVE', p.created_at || now, p.updated_at || now]
          );

          // 2. Fetch plans for this project
          const planRes = await fetch(`${API_BASE_URL}/api/plans?projectId=${encodeURIComponent(p.id)}&current=true`, { headers });
          if (planRes.ok) {
            const planJson = await planRes.json();
            const plansList = Array.isArray(planJson) ? planJson : (planJson?.data || []);
            for (const pl of plansList) {
              const planName = pl.name || pl.floors?.name || pl.pdf_path?.split('/')?.pop() || 'Plan architektoniczny';
              await db.runAsync(
                `INSERT INTO plans (id, project_id, floor_id, name, width, height, created_at, updated_at, version)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
                 ON CONFLICT(id) DO UPDATE SET name = excluded.name, project_id = excluded.project_id, updated_at = excluded.updated_at;`,
                [pl.id, p.id, pl.floor_id || null, planName, pl.image_width || 1920, pl.image_height || 1080, pl.created_at || now, pl.updated_at || now]
              );

              // 3. Fetch live stromkreise for this plan
              const cRes = await fetch(`${API_BASE_URL}/api/stromkreise?projectId=${p.id}&planId=${pl.id}`, { headers });
              if (cRes.ok) {
                const cJson = await cRes.json();
                const circs = Array.isArray(cJson) ? cJson : (cJson?.data || []);
                for (const c of circs) {
                  const fuseStr = c.breaker_current ? `${c.breaker_curve || 'B'}${c.breaker_current}A` : (c.fuse_type || 'B16');
                  const code = c.circuit_code || c.short_label || c.circuit_name || '1';
                  await db.runAsync(
                    `INSERT INTO stromkreise (id, plan_id, circuit_name, circuit_code, short_label, full_name, type, fuse_type, x_norm, y_norm, status, metadata, version)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                     ON CONFLICT(id) DO UPDATE SET 
                       circuit_name = excluded.circuit_name, 
                       circuit_code = excluded.circuit_code, 
                       short_label = excluded.short_label, 
                       full_name = excluded.full_name, 
                       type = excluded.type, 
                       fuse_type = excluded.fuse_type, 
                       x_norm = excluded.x_norm, 
                       y_norm = excluded.y_norm,
                       status = excluded.status,
                       metadata = excluded.metadata;`,
                    [
                      c.id,
                      pl.id,
                      code,
                      code,
                      c.short_label || code,
                      c.full_name || null,
                      c.type || 'socket',
                      fuseStr,
                      c.x_norm ?? 0.1,
                      c.y_norm ?? 0.1,
                      c.status || 'open',
                      JSON.stringify(c.metadata || {}),
                    ]
                  ).catch(() => {});
                }
              }
            }
          }
        }
      }
    } catch (apiErr) {
      console.warn('[CircuitsScreen] Live sync error:', apiErr);
    }
  };

  const loadData = useCallback(async () => {
    try {
      const db = await getDatabase();
      await syncCircuitsFromApi(db);

      // Query ONLY plans that actually have Stromkreise
      const planRows = (await db.getAllAsync<PlanWithCircuits>(`
        SELECT 
          p.id, 
          p.name, 
          p.project_id, 
          COALESCE(pr.name, 'Projekt') as project_name,
          pr.company_name,
          COALESCE(f.name, '') as floor_name,
          COUNT(s.id) as circuit_count
        FROM plans p 
        INNER JOIN stromkreise s ON s.plan_id = p.id AND s.deleted_at IS NULL
        LEFT JOIN projects pr ON p.project_id = pr.id 
        LEFT JOIN floors f ON p.floor_id = f.id
        WHERE p.deleted_at IS NULL 
        GROUP BY p.id, p.name, p.project_id, pr.name, pr.company_name, f.name
        HAVING COUNT(s.id) > 0
        ORDER BY pr.name ASC, p.name ASC;
      `)) || [];

      // Group plans by project
      const groupMap: Record<string, ProjectGroupWithCircuits> = {};
      for (const pl of planRows) {
        const pId = pl.project_id || 'unassigned';
        if (!groupMap[pId]) {
          groupMap[pId] = {
            id: pId,
            name: pl.project_name,
            company_name: pl.company_name,
            plans: [],
            totalCircuits: 0,
          };
        }
        groupMap[pId].plans.push(pl);
        groupMap[pId].totalCircuits += pl.circuit_count;
      }

      setProjectGroups(Object.values(groupMap));
    } catch (err) {
      console.error('[CircuitsScreen] Load error:', err);
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

  const q = searchQuery.toLowerCase().trim();
  const filteredGroups = projectGroups
    .map((g) => {
      const matchProj = g.name.toLowerCase().includes(q) || (g.company_name && g.company_name.toLowerCase().includes(q));
      const matchingPlans = g.plans.filter(
        (p) => matchProj || p.name.toLowerCase().includes(q) || (p.floor_name && p.floor_name.toLowerCase().includes(q))
      );
      return {
        ...g,
        plans: q ? matchingPlans : g.plans,
        hasMatch: matchProj || matchingPlans.length > 0,
      };
    })
    .filter((g) => (q ? g.hasMatch : true));

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{
          title: 'Stromkreise (Pläne & Markery)',
          headerShown: true,
          headerBackTitle: 'Zurück',
          headerStyle: { backgroundColor: '#0B0F19' },
          headerTintColor: '#38BDF8',
          headerTitleStyle: { color: '#F8FAFC', fontWeight: '800' },
        }}
      />

      {/* Search Header */}
      <View style={styles.searchHeader}>
        <TextInput
          style={styles.searchInput}
          placeholder="Projekt oder Plan mit Stromkreisen suchen..."
          placeholderTextColor="#64748B"
          value={searchQuery}
          onChangeText={setSearchQuery}
          clearButtonMode="while-editing"
        />
        <Text style={styles.hintText}>
          ⚡ Wybierz rzut, aby otworzyć interaktywną mapę z obwodami i zgłaszaniem wykonania.
        </Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#38BDF8" />
          <Text style={styles.loadingText}>Stromkreise-Pläne werden geladen...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredGroups}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#38BDF8" />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyTitle}>Brak planów ze Stromkreise</Text>
              <Text style={styles.emptySubtitle}>
                Nie znaleziono aktywnych rzutów ze wstawionymi obwodami elektrycznymi.
              </Text>
            </View>
          }
          renderItem={({ item: group }) => (
            <View style={styles.projectCard}>
              <View style={styles.projectHeader}>
                <View style={styles.projectTitleRow}>
                  <Text style={styles.projectIcon}>🏢</Text>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <Text style={styles.projectName}>{group.name}</Text>
                      {group.company_name && (
                        <View style={styles.companyBadge}>
                          <Text style={styles.companyBadgeText}>{group.company_name}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.projectSubtext}>
                      {group.plans.length} {group.plans.length === 1 ? 'Plan' : 'Pläne'} • {group.totalCircuits} Stromkreise-Marker
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.plansContainer}>
                {group.plans.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={styles.planCard}
                    activeOpacity={0.7}
                    onPress={() => router.push({ pathname: '/plans/[id]', params: { id: p.id } } as any)}
                  >
                    <View style={styles.planLeft}>
                      <Text style={styles.planIcon}>📐</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.planName}>{p.name}</Text>
                        {p.floor_name ? <Text style={styles.floorName}>Kondygnacja: {p.floor_name}</Text> : null}
                      </View>
                    </View>

                    <View style={styles.planRight}>
                      <View style={styles.circuitCountBadge}>
                        <Text style={styles.circuitCountText}>⚡ {p.circuit_count} Kreise</Text>
                      </View>
                      <Text style={styles.arrowIcon}>➔</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
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
  searchHeader: {
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
  hintText: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 8,
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
  projectHeader: {
    padding: 14,
    backgroundColor: '#131D31',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  projectTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  projectIcon: {
    fontSize: 22,
  },
  projectName: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '800',
  },
  companyBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  companyBadgeText: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: '800',
  },
  projectSubtext: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 3,
  },
  plansContainer: {
    padding: 10,
    gap: 8,
  },
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E293B',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  planLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  planIcon: {
    fontSize: 18,
  },
  planName: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
  },
  floorName: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  planRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  circuitCountBadge: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#8B5CF6',
  },
  circuitCountText: {
    color: '#C084FC',
    fontSize: 11,
    fontWeight: '800',
  },
  arrowIcon: {
    color: '#38BDF8',
    fontSize: 15,
    fontWeight: '800',
  },
});
