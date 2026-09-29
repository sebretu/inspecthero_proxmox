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

  const queryLocalCircuits = async (db: any) => {
    const planRows = ((await db.getAllAsync(`
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
    `)) as PlanWithCircuits[]) || [];

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
  };

  const syncCircuitsFromApiBackground = async (db: any) => {
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

          const planRes = await fetch(`${API_BASE_URL}/api/plans?projectId=${encodeURIComponent(p.id)}&current=true`, { headers });
          if (planRes.ok) {
            const planJson = await planRes.json();
            const plansList = Array.isArray(planJson) ? planJson : (planJson?.data || []);
            
            await Promise.all(
              plansList.map(async (pl: any) => {
                const bName = pl.floors?.buildings?.name || '';
                const fName = pl.floors?.name || '';
                const rawName = pl.name || 'Plan';
                const planName = [bName, fName, (rawName && rawName !== fName) ? rawName : ''].filter(Boolean).join(' · ') || rawName;

                await db.runAsync(
                  `INSERT INTO plans (id, project_id, floor_id, name, width, height, created_at, updated_at, version)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
                   ON CONFLICT(id) DO UPDATE SET name = excluded.name, project_id = excluded.project_id, updated_at = excluded.updated_at;`,
                  [pl.id, p.id, pl.floor_id || null, planName, pl.image_width || 1920, pl.image_height || 1080, pl.created_at || now, pl.updated_at || now]
                );

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
              })
            );
          }
        })
      );

      // Refresh list after background sync
      await queryLocalCircuits(db);
    } catch (apiErr) {
      console.warn('[CircuitsScreen] Background sync error:', apiErr);
    }
  };

  const loadData = useCallback(async () => {
    try {
      const db = await getDatabase();
      // 1. Instant load from SQLite (0ms UI render)
      await queryLocalCircuits(db);
      setLoading(false);
      setRefreshing(false);

      // 2. Non-blocking background sync
      syncCircuitsFromApiBackground(db);
    } catch (err) {
      console.error('[CircuitsScreen] Load error:', err);
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
      syncCircuitsFromApiBackground(db).finally(() => setRefreshing(false));
    });
  };

  const filteredGroups = projectGroups
    .map((g) => {
      const q = searchQuery.toLowerCase().trim();
      if (!q) return g;
      const matchingPlans = g.plans.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.floor_name && p.floor_name.toLowerCase().includes(q)) ||
          g.name.toLowerCase().includes(q)
      );
      if (matchingPlans.length > 0 || g.name.toLowerCase().includes(q)) {
        return {
          ...g,
          plans: matchingPlans.length > 0 ? matchingPlans : g.plans,
        };
      }
      return null;
    })
    .filter(Boolean) as ProjectGroupWithCircuits[];

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{
          title: 'Stromkreise (Obwody)',
          headerShown: true,
          headerBackTitle: 'Wstecz',
          headerStyle: { backgroundColor: '#0B0F19' },
          headerTintColor: '#38BDF8',
          headerTitleStyle: { color: '#F8FAFC', fontWeight: '800' },
        }}
      />

      {/* Header Info */}
      <View style={styles.headerBar}>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>⚡ RZUTY ZE STROMKREISE</Text>
          <Text style={styles.headerSubtitle}>
            Kliknij w rzut, aby otworzyć mapę obwodów i weryfikować wykonanie
          </Text>
        </View>

        {/* Search */}
        <View style={styles.searchSection}>
          <TextInput
            style={styles.searchInput}
            placeholder="Szukaj projektu lub rzutu z obwodami..."
            placeholderTextColor="#64748B"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearSearchBtn}>
              <Text style={styles.clearSearchText}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#38BDF8" />
          <Text style={styles.loadingText}>Ładowanie planów ze Stromkreise...</Text>
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
              <Text style={styles.emptyTitle}>Brak planów ze Stromkreise</Text>
              <Text style={styles.emptySubtitle}>
                Na żadnym z planów nie wstawiono jeszcze markerów obwodów.
              </Text>
            </View>
          }
          renderItem={({ item: group }) => (
            <View style={styles.projectCard}>
              <View style={styles.projectHeader}>
                <Text style={styles.projectIcon}>📁</Text>
                <View style={{ flex: 1 }}>
                  <View style={styles.projectNameRow}>
                    {group.company_name && (
                      <View style={styles.companyBadge}>
                        <Text style={styles.companyBadgeText}>[{group.company_name}]</Text>
                      </View>
                    )}
                    <Text style={styles.projectName}>{group.name}</Text>
                  </View>
                  <Text style={styles.projectSubtext}>
                    {group.plans.length} {group.plans.length === 1 ? 'rzut' : 'rzuty'} • {group.totalCircuits} obwodów
                  </Text>
                </View>
              </View>

              {/* Plans Grid */}
              <View style={styles.plansContainer}>
                {group.plans.map((pl) => (
                  <TouchableOpacity
                    key={pl.id}
                    style={styles.planCard}
                    activeOpacity={0.7}
                    onPress={() => {
                      router.push({ pathname: '/plans/[id]', params: { id: pl.id, mode: 'circuits' } } as any);
                    }}
                  >
                    <View style={styles.planCardLeft}>
                      <Text style={styles.planIcon}>📐</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.planName}>{pl.name}</Text>
                        {pl.floor_name ? (
                          <Text style={styles.floorName}>Kondygnacja: {pl.floor_name}</Text>
                        ) : null}
                      </View>
                    </View>

                    <View style={styles.planCardRight}>
                      <View style={styles.circuitCountBadge}>
                        <Text style={styles.circuitCountText}>
                          ⚡ {pl.circuit_count}
                        </Text>
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
  container: { flex: 1, backgroundColor: '#030712' },
  headerBar: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  headerInfo: { marginBottom: 10 },
  headerTitle: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  headerSubtitle: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  searchSection: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
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
  list: { padding: 14, paddingBottom: 40 },
  projectCard: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    overflow: 'hidden',
  },
  projectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
  },
  projectIcon: { fontSize: 24, marginRight: 10 },
  projectNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
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
  projectName: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '800',
  },
  projectSubtext: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  plansContainer: {
    padding: 10,
  },
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E293B',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  planCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  planIcon: { fontSize: 20, marginRight: 10 },
  planName: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  floorName: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
  },
  planCardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  circuitCountBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  circuitCountText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '800',
  },
  arrowIcon: {
    color: '#38BDF8',
    fontSize: 14,
    fontWeight: '900',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  loadingText: { color: '#94A3B8', fontSize: 13, marginTop: 12 },
  emptyTitle: { color: '#F8FAFC', fontSize: 16, fontWeight: '800', marginBottom: 4 },
  emptySubtitle: { color: '#64748B', fontSize: 12, textAlign: 'center' },
});
