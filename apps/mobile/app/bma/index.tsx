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
  TextInput,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDatabase } from '../../src/db/database';
import { authSupabase } from '../../src/auth/authClient';
import { useLanguage } from '../../src/i18n/LanguageContext';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://inspecthero.pl';

interface BmaDeviceRow {
  id: string;
  plan_id: string;
  project_id?: string;
  device_number: string;
  device_type: string;
  status: string | null;
  pos_x?: number;
  pos_y?: number;
  plan_name?: string;
  project_name?: string;
  version: number;
}

interface PlanOption {
  id: string;
  name: string;
  project_id?: string;
  project_name?: string;
}

export default function BmaScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [devices, setDevices] = useState<BmaDeviceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const syncBmaFromApi = async (db: any) => {
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

        for (const p of apiProjects) {
          const planRes = await fetch(`${API_BASE_URL}/api/plans?projectId=${encodeURIComponent(p.id)}&current=true`, { headers });
          if (planRes.ok) {
            const planJson = await planRes.json();
            const plansList = Array.isArray(planJson) ? planJson : (planJson?.data || []);
            for (const pl of plansList) {
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
      const planRows = (await db.getAllAsync(`
        SELECT p.id, p.name, p.project_id, COALESCE(pr.name, '') as project_name 
        FROM plans p 
        LEFT JOIN projects pr ON p.project_id = pr.id 
        WHERE p.deleted_at IS NULL AND p.id != 'pln-sample-001'
        ORDER BY pr.name ASC, p.name ASC;
      `)) as PlanOption[];
      setPlans(planRows);
    } catch (e) {
      console.warn('[BMA] Sync error:', e);
    }
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const db = await getDatabase();
      await syncBmaFromApi(db);

      let query = `
        SELECT b.id, b.plan_id, b.device_number, b.device_type, b.status, b.pos_x, b.pos_y, b.version,
               COALESCE(p.name, 'Plan') as plan_name,
               COALESCE(pr.name, '') as project_name
        FROM bma_devices b
        LEFT JOIN plans p ON b.plan_id = p.id
        LEFT JOIN projects pr ON p.project_id = pr.id
        WHERE b.deleted_at IS NULL
      `;
      const params: any[] = [];

      if (selectedPlanId !== 'all') {
        query += ` AND b.plan_id = ?`;
        params.push(selectedPlanId);
      }

      query += ` ORDER BY b.device_number ASC;`;

      const rows = (await db.getAllAsync(query, params)) as BmaDeviceRow[];
      setDevices(rows || []);
    } catch (err) {
      console.error('[BMA] Load error:', err);
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

  const filteredDevices = devices.filter((d) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      d.device_number.toLowerCase().includes(q) ||
      d.device_type.toLowerCase().includes(q) ||
      (d.project_name && d.project_name.toLowerCase().includes(q)) ||
      (d.plan_name && d.plan_name.toLowerCase().includes(q))
    );
  });

  const renderBmaItem = ({ item }: { item: BmaDeviceRow }) => {
    const isSirene = item.device_type.toLowerCase().includes('siren');
    const isHand = item.device_type.toLowerCase().includes('hand') || item.device_type.toLowerCase().includes('rop');
    const isKoppler = item.device_type.toLowerCase().includes('koppl');
    const badgeEmoji = isSirene ? '📢' : isHand ? '🛑' : isKoppler ? '🔲' : '🚨';

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => {
          if (item.plan_id) {
            router.push({
              pathname: '/plans/[id]',
              params: { id: item.plan_id },
            } as any);
          }
        }}
      >
        <View style={styles.cardHeader}>
          <View style={styles.titleRow}>
            <View style={styles.iconBadge}>
              <Text style={styles.iconText}>{badgeEmoji}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Czujka: {item.device_number}</Text>
              <Text style={styles.planSubtitle}>
                {item.project_name ? `${item.project_name} • ` : ''}{item.plan_name || 'Brak przypisanego planu'}
              </Text>
            </View>
          </View>
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>{item.device_type}</Text>
          </View>
        </View>

        <View style={styles.cardFooter}>
          <Text style={styles.positionText}>
            Pozycja na rzucie: X={item.pos_x || 0}, Y={item.pos_y || 0}
          </Text>
          <Text style={styles.actionLink}>Pokaż na planie BMA →</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{
          title: t('bma_automatik', '🚨 BMA Automatyka & Czujki'),
          headerShown: true,
          headerBackTitle: 'Wróć',
          headerStyle: { backgroundColor: '#0B0F19' },
          headerTintColor: '#38BDF8',
          headerTitleStyle: { color: '#F8FAFC', fontWeight: '800' },
        }}
      />

      {/* Plan Filter Bar */}
      <View style={styles.filterSection}>
        <Text style={styles.filterHeading}>FILTRUJ WG PLANU:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
          <TouchableOpacity
            style={[styles.chip, selectedPlanId === 'all' && styles.chipActive]}
            onPress={() => setSelectedPlanId('all')}
          >
            <Text style={[styles.chipText, selectedPlanId === 'all' && styles.chipTextActive]}>
              Wszystkie ({devices.length})
            </Text>
          </TouchableOpacity>
          {plans.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={[styles.chip, selectedPlanId === p.id && styles.chipActive]}
              onPress={() => setSelectedPlanId(p.id)}
            >
              <Text style={[styles.chipText, selectedPlanId === p.id && styles.chipTextActive]}>
                {p.project_name ? `[${p.project_name}] ` : ''}{p.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Search Bar */}
        <TextInput
          style={styles.searchInput}
          placeholder="Szukaj czujki BMA (np. 1/12, D-Melder, ROP)..."
          placeholderTextColor="#64748B"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Main List */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#38BDF8" />
          <Text style={styles.loadingText}>Ładowanie urządzeń BMA...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredDevices}
          keyExtractor={(item) => item.id}
          renderItem={renderBmaItem}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#38BDF8" />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyEmoji}>🚨</Text>
              <Text style={styles.emptyTitle}>Brak czujek pożarowych BMA</Text>
              <Text style={styles.emptySub}>
                Wybierz inny plan lub wstaw czujki na rzucie PDF w przeglądarce planów.
              </Text>
            </View>
          }
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
  filterSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#0B0F19',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  filterHeading: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  chipScroll: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  chip: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  chipActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderColor: '#EF4444',
  },
  chipText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
  },
  chipTextActive: {
    color: '#EF4444',
  },
  searchInput: {
    backgroundColor: '#1E293B',
    color: '#F8FAFC',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#334155',
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  card: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  iconText: {
    fontSize: 18,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  planSubtitle: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    backgroundColor: '#1E293B',
    borderColor: '#EF4444',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#EF4444',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingTop: 8,
    marginTop: 4,
  },
  positionText: {
    fontSize: 11,
    color: '#64748B',
  },
  actionLink: {
    fontSize: 12,
    fontWeight: '700',
    color: '#EF4444',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#94A3B8',
    marginTop: 12,
    fontSize: 14,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyEmoji: {
    fontSize: 44,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    maxWidth: 260,
  },
});
