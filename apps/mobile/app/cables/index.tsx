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
  RefreshControl,
} from 'react-native';
import { useRouter, Stack, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDatabase } from '../../src/db/database';
import { authSupabase } from '../../src/auth/authClient';

interface TrommelRow {
  id: string;
  name: string;
  cable_type: string;
  initial_length: number;
  remaining_length: number;
}

interface CableRow {
  id: string;
  plan_id: string;
  trommel_id?: string;
  cable_number: string;
  cable_type: string;
  length: number;
  status: 'planned' | 'drawn' | 'measured' | 'connected';
  version: number;
}

interface PlanOption {
  id: string;
  name: string;
}

export default function CablesScreen() {
  const router = useRouter();
  const { projectId } = useLocalSearchParams<{ projectId?: string }>();
  const [activeTab, setActiveTab] = useState<'cables' | 'trommels'>('cables');
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('all');
  const [trommels, setTrommels] = useState<TrommelRow[]>([]);
  const [cables, setCables] = useState<CableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const syncCablesFromApi = async (db: any) => {
    try {
      const { data: { session } } = await authSupabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const planRows = (await db.getAllAsync(
        "SELECT id, name FROM plans WHERE deleted_at IS NULL AND id != 'pln-sample-001' ORDER BY name ASC;"
      )) as PlanOption[];
      setPlans(planRows);
      if (planRows.length > 0 && selectedPlanId === 'all') {
        setSelectedPlanId(planRows[0].id);
      }
    } catch (e) {
      console.warn('[Cables] Sync error:', e);
    }
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const db = await getDatabase();
      await syncCablesFromApi(db);

      const trommelRows = await db.getAllAsync<TrommelRow>(
        'SELECT * FROM trommels WHERE deleted_at IS NULL ORDER BY name ASC;'
      );
      setTrommels(trommelRows);

      const cableFilter = selectedPlanId !== 'all' ? `AND plan_id = '${selectedPlanId}'` : '';
      const cableRows = await db.getAllAsync<CableRow>(
        `SELECT * FROM cables WHERE deleted_at IS NULL ${cableFilter} ORDER BY cable_number ASC;`
      );
      setCables(cableRows);
    } catch (err) {
      console.error('[CablesScreen] Error loading cables & trommels:', err);
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

  const toggleCableStatus = async (cable: CableRow) => {
    const nextStatus: CableRow['status'] =
      cable.status === 'planned'
        ? 'drawn'
        : cable.status === 'drawn'
        ? 'measured'
        : cable.status === 'measured'
        ? 'connected'
        : 'planned';

    try {
      const db = await getDatabase();
      const nextVersion = cable.version + 1;
      const now = new Date().toISOString();

      await db.runAsync(
        'UPDATE cables SET status = ?, version = ?, updated_at = ? WHERE id = ?;',
        [nextStatus, nextVersion, now, cable.id]
      );

      await db.runAsync(`
        INSERT INTO mutations (
          mutation_id, entity_type, entity_id, operation, base_version, payload, status, attempts, created_at, updated_at
        ) VALUES (?, 'cables', ?, 'UPDATE', ?, ?, 'PENDING', 0, ?, ?);
      `, [
        `mut-${Date.now()}-${cable.id}`,
        cable.id,
        cable.version,
        JSON.stringify({ status: nextStatus, updated_at: now }),
        now,
        now,
      ]);

      setCables((prev) =>
        prev.map((c) => (c.id === cable.id ? { ...c, status: nextStatus, version: nextVersion } : c))
      );
    } catch (err: any) {
      Alert.alert('Błąd', err?.message || 'Nie udało się zaktualizować statusu kabla');
    }
  };

  const getCableBadge = (status: CableRow['status']) => {
    switch (status) {
      case 'connected':
        return { label: 'PODŁĄCZONY', bg: 'rgba(34, 197, 94, 0.15)', text: '#22C55E' };
      case 'measured':
        return { label: 'ZMIERZONY', bg: 'rgba(56, 189, 248, 0.15)', text: '#38BDF8' };
      case 'drawn':
        return { label: 'WCIĄGNIĘTY', bg: 'rgba(234, 179, 8, 0.15)', text: '#EAB308' };
      default:
        return { label: 'PLANOWANY', bg: 'rgba(148, 163, 184, 0.15)', text: '#94A3B8' };
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{
          title: 'Kable & Bębny',
          headerShown: true,
          headerBackTitle: 'Wstecz',
          headerStyle: { backgroundColor: '#0B0F19' },
          headerTintColor: '#38BDF8',
          headerTitleStyle: { color: '#F8FAFC', fontWeight: '700' },
        }}
      />

      {/* Top Map Action Banner */}
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
                  📐 {pl.name}
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
            <Text style={styles.mapBannerTitle}>Otwórz interaktywną mapę tras kablowych 2D</Text>
            <Text style={styles.mapBannerSubtitle}>
              Przeglądaj trasy kablowe, punkty wejścia/wyjścia i bębny na rzucie PDF
            </Text>
          </View>
          <Text style={styles.mapBannerArrow}>➔</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'cables' && styles.tabActive]}
          onPress={() => setActiveTab('cables')}
        >
          <Text style={[styles.tabText, activeTab === 'cables' && styles.tabTextActive]}>
            🔌 Kable ({cables.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'trommels' && styles.tabActive]}
          onPress={() => setActiveTab('trommels')}
        >
          <Text style={[styles.tabText, activeTab === 'trommels' && styles.tabTextActive]}>
            🎯 Bębny / Trommle ({trommels.length})
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#38BDF8" />
          <Text style={styles.loadingText}>Ładowanie kabli i bębnów...</Text>
        </View>
      ) : activeTab === 'cables' ? (
        <FlatList
          data={cables}
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
              <Text style={styles.emptyTitle}>Brak kabli</Text>
              <Text style={styles.emptySubtitle}>Brak zarejestrowanych tras kablowych dla tego planu.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const badge = getCableBadge(item.status);
            return (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{item.cable_number}</Text>
                  <TouchableOpacity
                    style={[styles.statusBadge, { backgroundColor: badge.bg }]}
                    onPress={() => toggleCableStatus(item)}
                  >
                    <Text style={[styles.statusText, { color: badge.text }]}>{badge.label}</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.cardDesc}>{item.cable_type}</Text>
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>Długość: <Text style={styles.metaValue}>{item.length} m</Text></Text>
                  <TouchableOpacity onPress={() => openPlanMap(item.plan_id)}>
                    <Text style={styles.viewOnMapText}>Pokaż na mapie ➔</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      ) : (
        <FlatList
          data={trommels}
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
              <Text style={styles.emptyTitle}>Brak bębnów</Text>
              <Text style={styles.emptySubtitle}>Brak zarejestrowanych bębnów kablowych w magazynie.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const percentRemaining = Math.round((item.remaining_length / item.initial_length) * 100);
            return (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                <Text style={styles.cardDesc}>{item.cable_type}</Text>

                <View style={styles.progressSection}>
                  <View style={styles.progressHeader}>
                    <Text style={styles.progressLabel}>Pozostało na bębnie</Text>
                    <Text style={styles.progressValue}>
                      {item.remaining_length} / {item.initial_length} m ({percentRemaining}%)
                    </Text>
                  </View>
                  <View style={styles.progressBarTrack}>
                    <View
                      style={[
                        styles.progressBarFill,
                        { width: `${Math.min(100, Math.max(0, percentRemaining))}%` },
                      ]}
                    />
                  </View>
                </View>
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
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
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
  progressSection: {
    marginTop: 6,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: 11,
    color: '#64748B',
  },
  progressValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#38BDF8',
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: '#1E293B',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#38BDF8',
    borderRadius: 4,
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
