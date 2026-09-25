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
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDatabase } from '../../src/db/database';
import { authSupabase } from '../../src/auth/authClient';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://inspecthero.pl';

interface StromkreisRow {
  id: string;
  plan_id: string;
  project_id?: string;
  circuit_name: string;
  circuit_code?: string;
  short_label?: string;
  full_name?: string;
  type?: string;
  fuse_type: string | null;
  phase?: number;
  breaker_current?: number;
  pos_x?: number;
  pos_y?: number;
  version: number;
}

interface BmaDeviceRow {
  id: string;
  plan_id: string;
  project_id?: string;
  device_number: string;
  device_type: string;
  status: string | null;
  pos_x?: number;
  pos_y?: number;
  version: number;
}

interface PlanOption {
  id: string;
  name: string;
  project_id?: string;
  project_name?: string;
}

export default function CircuitsScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'circuits' | 'bma'>('circuits');
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('all');
  const [circuits, setCircuits] = useState<StromkreisRow[]>([]);
  const [devices, setDevices] = useState<BmaDeviceRow[]>([]);
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
          await db.runAsync(
            `INSERT INTO projects (id, name, status, created_at, updated_at, version)
             VALUES (?, ?, ?, ?, ?, 1)
             ON CONFLICT(id) DO UPDATE SET name = excluded.name, status = excluded.status, updated_at = excluded.updated_at;`,
            [p.id, p.name, p.status || 'ACTIVE', p.created_at || now, p.updated_at || now]
          );

          // 2. Fetch active/current plans for each project
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
                  const fuseStr = c.breaker_current ? `${c.breaker_curve || 'B'}${c.breaker_current}A` : 'B16';
                  await db.runAsync(
                    `INSERT INTO stromkreise (id, plan_id, circuit_name, fuse_type, pos_x, pos_y, version)
                     VALUES (?, ?, ?, ?, ?, ?, 1)
                     ON CONFLICT(id) DO UPDATE SET circuit_name = excluded.circuit_name, fuse_type = excluded.fuse_type;`,
                    [c.id, pl.id, c.circuit_code || c.short_label || c.full_name || 'Obwód', fuseStr, c.x_norm ? Math.round(c.x_norm * 1920) : 100, c.y_norm ? Math.round(c.y_norm * 1080) : 100]
                  ).catch(() => {});
                }
              }

              // 4. Fetch live BMA devices for this plan
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
            }
          }
        }
      }

      // Fetch active current plans list
      const planRows = await db.getAllAsync<PlanOption>(`
        SELECT p.id, p.name, p.project_id, COALESCE(pr.name, '') as project_name 
        FROM plans p 
        LEFT JOIN projects pr ON p.project_id = pr.id 
        WHERE p.deleted_at IS NULL AND p.id != 'pln-sample-001'
        ORDER BY pr.name ASC, p.name ASC;
      `);
      setPlans(planRows);
      if (planRows.length > 0 && selectedPlanId === 'all') {
        setSelectedPlanId('all');
      }
    } catch (e) {
      console.warn('[Circuits] Sync error:', e);
    }
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const db = await getDatabase();
      await syncCircuitsFromApi(db);

      const circuitFilter = selectedPlanId !== 'all' ? `AND plan_id = '${selectedPlanId}'` : '';
      const bmaFilter = selectedPlanId !== 'all' ? `AND plan_id = '${selectedPlanId}'` : '';

      const circuitRows = await db.getAllAsync<StromkreisRow>(
        `SELECT * FROM stromkreise WHERE deleted_at IS NULL ${circuitFilter} ORDER BY circuit_name ASC;`
      );
      setCircuits(circuitRows);

      const bmaRows = await db.getAllAsync<BmaDeviceRow>(
        `SELECT * FROM bma_devices WHERE deleted_at IS NULL ${bmaFilter} ORDER BY device_number ASC;`
      );
      setDevices(bmaRows);
    } catch (err) {
      console.error('[CircuitsScreen] Error loading circuits & BMA:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedPlanId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const openPlanMap = (planIdToOpen?: string) => {
    const targetId = (planIdToOpen && planIdToOpen !== 'all') ? planIdToOpen : (plans[0]?.id || selectedPlanId);
    if (targetId && targetId !== 'all') {
      router.push({ pathname: '/plans/[id]', params: { id: targetId } } as any);
    } else {
      router.push('/plans' as any);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{
          title: 'Stromkreise & BMA',
          headerShown: true,
          headerBackTitle: 'Wstecz',
          headerStyle: { backgroundColor: '#0B0F19' },
          headerTintColor: '#38BDF8',
          headerTitleStyle: { color: '#F8FAFC', fontWeight: '700' },
        }}
      />

      {/* Plan Selector & Map Banner */}
      <View style={styles.topControlSection}>
        {plans.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.planScroll}>
            <TouchableOpacity
              style={[styles.planChip, selectedPlanId === 'all' && styles.planChipActive]}
              onPress={() => setSelectedPlanId('all')}
            >
              <Text style={[styles.planChipText, selectedPlanId === 'all' && styles.planChipTextActive]}>
                Wszystkie plany
              </Text>
            </TouchableOpacity>
            {plans.map((pl) => (
              <TouchableOpacity
                key={pl.id}
                style={[styles.planChip, selectedPlanId === pl.id && styles.planChipActive]}
                onPress={() => setSelectedPlanId(pl.id)}
              >
                <Text style={[styles.planChipText, selectedPlanId === pl.id && styles.planChipTextActive]}>
                  📐 {pl.project_name ? `${pl.project_name} ▸ ` : ''}{pl.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        <TouchableOpacity
          style={styles.openMapBanner}
          activeOpacity={0.8}
          onPress={() => openPlanMap(selectedPlanId)}
        >
          <Text style={styles.mapBannerIcon}>🗺️</Text>
          <View style={styles.mapBannerTextCol}>
            <Text style={styles.mapBannerTitle}>Otwórz interaktywną mapę planu 2D</Text>
            <Text style={styles.mapBannerSubtitle}>
              Przeglądaj piny obwodów, gniazd, oświetlenia i czujek BMA na rzucie PDF
            </Text>
          </View>
          <Text style={styles.mapBannerArrow}>➔</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'circuits' && styles.tabActive]}
          onPress={() => setActiveTab('circuits')}
        >
          <Text style={[styles.tabText, activeTab === 'circuits' && styles.tabTextActive]}>
            ⚡ Obwody elektryczne ({circuits.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'bma' && styles.tabActive]}
          onPress={() => setActiveTab('bma')}
        >
          <Text style={[styles.tabText, activeTab === 'bma' && styles.tabTextActive]}>
            🚨 Czujki BMA ({devices.length})
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#38BDF8" />
          <Text style={styles.loadingText}>Ładowanie danych instalacji...</Text>
        </View>
      ) : activeTab === 'circuits' ? (
        <FlatList
          data={circuits}
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
              <Text style={styles.emptySubtitle}>
                Brak zdefiniowanych obwodów w rozdzielnicach dla wybranego planu.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.8}
              onPress={() => openPlanMap(item.plan_id)}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{item.circuit_name}</Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>ROZDZIELNICA RG</Text>
                </View>
              </View>
              <Text style={styles.cardDesc}>Zabezpieczenie: {item.fuse_type || 'B16A / RCD 30mA'}</Text>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Stan: <Text style={styles.metaValue}>🟢 Aktywny na planie</Text></Text>
                <Text style={styles.viewOnMapText}>Pokaż na mapie ➔</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      ) : (
        <FlatList
          data={devices}
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
              <Text style={styles.emptyTitle}>Brak urządzeń BMA</Text>
              <Text style={styles.emptySubtitle}>Brak czujek pożarowych dla wybranego planu.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.8}
              onPress={() => openPlanMap(item.plan_id)}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{item.device_number}</Text>
                <View style={[styles.badge, { borderColor: '#22C55E' }]}>
                  <Text style={[styles.badgeText, { color: '#22C55E' }]}>{item.status || 'OK'}</Text>
                </View>
              </View>
              <Text style={styles.cardDesc}>{item.device_type}</Text>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Stan: <Text style={styles.metaValue}>🟢 Sprawny</Text></Text>
                <Text style={styles.viewOnMapText}>Pokaż na mapie ➔</Text>
              </View>
            </TouchableOpacity>
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
  topControlSection: {
    backgroundColor: '#0B0F19',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  planScroll: {
    marginBottom: 10,
  },
  planChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#1E293B',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  planChipActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    borderColor: '#38BDF8',
  },
  planChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },
  planChipTextActive: {
    color: '#38BDF8',
    fontWeight: '700',
  },
  openMapBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  mapBannerIcon: {
    fontSize: 24,
    marginRight: 10,
  },
  mapBannerTextCol: {
    flex: 1,
  },
  mapBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#38BDF8',
    marginBottom: 2,
  },
  mapBannerSubtitle: {
    fontSize: 11,
    color: '#94A3B8',
  },
  mapBannerArrow: {
    fontSize: 16,
    color: '#38BDF8',
    fontWeight: '800',
    marginLeft: 8,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#0B0F19',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#1E293B',
  },
  tabActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },
  tabTextActive: {
    color: '#38BDF8',
    fontWeight: '700',
  },
  list: {
    padding: 16,
  },
  card: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
    flex: 1,
  },
  cardDesc: {
    fontSize: 13,
    color: '#94A3B8',
    marginBottom: 10,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#38BDF8',
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#38BDF8',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingTop: 10,
  },
  metaLabel: {
    fontSize: 12,
    color: '#64748B',
  },
  metaValue: {
    color: '#F8FAFC',
    fontWeight: '600',
  },
  viewOnMapText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#38BDF8',
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
