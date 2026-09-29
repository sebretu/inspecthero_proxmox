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

interface PlanWithBma {
  id: string;
  name: string;
  project_id: string;
  project_name: string;
  company_name?: string;
  floor_name?: string;
  device_count: number;
}

interface ProjectGroupWithBma {
  id: string;
  name: string;
  company_name?: string;
  plans: PlanWithBma[];
  totalDevices: number;
}

export default function BmaScreen() {
  const router = useRouter();
  const [projectGroups, setProjectGroups] = useState<ProjectGroupWithBma[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const queryLocalBmaPlans = async (db: any) => {
    const planRows = ((await db.getAllAsync(`
      SELECT 
        p.id, 
        p.name, 
        p.project_id, 
        COALESCE(pr.name, 'Projekt') as project_name,
        pr.company_name,
        COALESCE(f.name, '') as floor_name,
        (
          COALESCE((SELECT COUNT(s.id) FROM plan_bma_symbols s WHERE s.plan_id = p.id AND s.deleted_at IS NULL), 0) +
          COALESCE((SELECT COUNT(b.id) FROM bma_devices b WHERE b.plan_id = p.id AND b.deleted_at IS NULL), 0)
        ) as device_count
      FROM plans p 
      LEFT JOIN projects pr ON p.project_id = pr.id 
      LEFT JOIN floors f ON p.floor_id = f.id
      WHERE p.deleted_at IS NULL AND p.id != 'pln-sample-001'
      GROUP BY p.id, p.name, p.project_id, pr.name, pr.company_name, f.name
      ORDER BY pr.name ASC, p.name ASC;
    `)) as PlanWithBma[]) || [];

    // Filter to plans that have BMA devices or all plans grouped by project
    const groupMap: Record<string, ProjectGroupWithBma> = {};
    for (const pl of planRows) {
      const pId = pl.project_id || 'unassigned';
      if (!groupMap[pId]) {
        groupMap[pId] = {
          id: pId,
          name: pl.project_name,
          company_name: pl.company_name,
          plans: [],
          totalDevices: 0,
        };
      }
      groupMap[pId].plans.push(pl);
      groupMap[pId].totalDevices += Number(pl.device_count || 0);
    }

    // Sort projects so those with devices appear first, or all projects
    const groups = Object.values(groupMap).filter((g) => g.plans.length > 0);
    setProjectGroups(groups);
  };

  const syncBmaFromApiBackground = async (db: any) => {
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

                // Fetch BMA symbols
                const symRes = await fetch(`${API_BASE_URL}/api/plans/${pl.id}/bma-symbols`, { headers });
                if (symRes.ok) {
                  const symJson = await symRes.json();
                  const symList = symJson.symbols || [];
                  for (const s of symList) {
                    await db.runAsync(
                      `INSERT INTO plan_bma_symbols (id, plan_id, symbol_type, x_norm, y_norm, label, loop_number, address, description, version)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                       ON CONFLICT(id) DO UPDATE SET symbol_type = excluded.symbol_type, x_norm = excluded.x_norm, y_norm = excluded.y_norm, label = excluded.label, description = excluded.description;`,
                      [s.id, pl.id, s.symbol_type, s.x_norm, s.y_norm, s.label || null, s.loop_number || null, s.address || null, s.description || null]
                    ).catch(() => {});
                  }
                }

                // Fetch BMA devices
                const bRes = await fetch(`${API_BASE_URL}/api/bma/devices?projectId=${p.id}&planId=${pl.id}`, { headers });
                if (bRes.ok) {
                  const bJson = await bRes.json();
                  const bmas = Array.isArray(bJson) ? bJson : (bJson?.data || []);
                  for (const b of bmas) {
                    const label = b.device_number || (b.loop_number && b.address ? `${b.loop_number}/${b.address}` : (b.label || 'BMA'));
                    await db.runAsync(
                      `INSERT INTO bma_devices (id, plan_id, device_number, device_type, pos_x, pos_y, status, version)
                       VALUES (?, ?, ?, ?, ?, ?, ?, 1)
                       ON CONFLICT(id) DO UPDATE SET device_number = excluded.device_number, device_type = excluded.device_type, status = excluded.status;`,
                      [b.id || `bma-${Math.random()}`, pl.id, label, b.device_type || 'Melder', b.x_norm ? Math.round(b.x_norm * 1920) : 100, b.y_norm ? Math.round(b.y_norm * 1080) : 100, b.status || 'OK']
                    ).catch(() => {});
                  }
                }
              })
            );
          }
        })
      );

      await queryLocalBmaPlans(db);
    } catch (apiErr) {
      console.warn('[BmaScreen] Background sync error:', apiErr);
    }
  };

  const loadData = useCallback(async () => {
    try {
      const db = await getDatabase();
      await queryLocalBmaPlans(db);
      setLoading(false);
      setRefreshing(false);

      syncBmaFromApiBackground(db);
    } catch (err) {
      console.error('[BmaScreen] Load error:', err);
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
      syncBmaFromApiBackground(db).finally(() => setRefreshing(false));
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
          g.name.toLowerCase().includes(q) ||
          (g.company_name && g.company_name.toLowerCase().includes(q))
      );
      if (matchingPlans.length > 0 || g.name.toLowerCase().includes(q) || (g.company_name && g.company_name.toLowerCase().includes(q))) {
        return {
          ...g,
          plans: matchingPlans.length > 0 ? matchingPlans : g.plans,
        };
      }
      return null;
    })
    .filter(Boolean) as ProjectGroupWithBma[];

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{
          title: 'BMA Automatik (Czujki)',
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
          <Text style={styles.headerTitle}>🚨 PROJEKTY I RZUTY BMA</Text>
          <Text style={styles.headerSubtitle}>
            Wybierz rzut, aby otworzyć mapę i zarządzać czujkami oraz pętlami BMA
          </Text>
        </View>

        {/* Search */}
        <View style={styles.searchSection}>
          <TextInput
            style={styles.searchInput}
            placeholder="Szukaj projektu lub rzutu z BMA..."
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
          <Text style={styles.loadingText}>Ładowanie planów BMA...</Text>
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
              <Text style={styles.emptyTitle}>Brak planów z czujkami BMA</Text>
              <Text style={styles.emptySubtitle}>
                Na żadnym z planów nie wstawiono jeszcze elementów systemu BMA.
              </Text>
            </View>
          }
          renderItem={({ item: group }) => (
            <View style={styles.projectCard}>
              <View style={styles.projectHeader}>
                <Text style={styles.projectIcon}>📁</Text>
                <View style={{ flex: 1 }}>
                  <View style={styles.projectNameRow}>
                    {group.company_name ? (
                      <View style={styles.companyBadge}>
                        <Text style={styles.companyBadgeText}>[{group.company_name}]</Text>
                      </View>
                    ) : null}
                    <Text style={styles.projectName}>{group.name}</Text>
                  </View>
                  <Text style={styles.projectSubtext}>
                    {group.plans.length} {group.plans.length === 1 ? 'rzut' : 'rzuty'} • {group.totalDevices} elementów BMA
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
                      router.push({ pathname: '/plans/[id]', params: { id: pl.id, mode: 'bma' } } as any);
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
                      <View style={[styles.bmaCountBadge, pl.device_count > 0 && styles.bmaCountBadgeActive]}>
                        <Text style={[styles.bmaCountText, pl.device_count > 0 && styles.bmaCountTextActive]}>
                          🚨 {pl.device_count}
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
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 16,
    overflow: 'hidden',
  },
  projectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#1E293B',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  projectIcon: {
    fontSize: 22,
    marginRight: 10,
  },
  projectNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  companyBadge: {
    backgroundColor: '#38BDF820',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#38BDF860',
  },
  companyBadgeText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '800',
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
    fontWeight: '500',
  },
  plansContainer: {
    padding: 10,
    gap: 8,
  },
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0B0F19',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  planCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  planIcon: {
    fontSize: 18,
    marginRight: 10,
  },
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
  bmaCountBadge: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  bmaCountBadgeActive: {
    backgroundColor: '#DC262620',
    borderColor: '#DC262680',
  },
  bmaCountText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '800',
  },
  bmaCountTextActive: {
    color: '#F87171',
  },
  arrowIcon: {
    color: '#38BDF8',
    fontSize: 14,
    fontWeight: '900',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    marginTop: 40,
  },
  loadingText: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 12,
    fontWeight: '600',
  },
  emptyTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
  },
  emptySubtitle: {
    color: '#64748B',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
});
