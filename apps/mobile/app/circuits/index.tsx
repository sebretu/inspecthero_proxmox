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
  breaker_curve?: string;
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

export default function CircuitsScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [circuits, setCircuits] = useState<StromkreisRow[]>([]);
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
                  const fuseStr = c.breaker_current ? `${c.breaker_curve || 'B'}${c.breaker_current}A` : (c.fuse_type || 'B16');
                  await db.runAsync(
                    `INSERT INTO stromkreise (id, plan_id, circuit_name, fuse_type, pos_x, pos_y, version)
                     VALUES (?, ?, ?, ?, ?, ?, 1)
                     ON CONFLICT(id) DO UPDATE SET circuit_name = excluded.circuit_name, fuse_type = excluded.fuse_type;`,
                    [c.id, pl.id, c.circuit_code || c.short_label || c.full_name || 'Obwód', fuseStr, c.x_norm ? Math.round(c.x_norm * 1920) : 100, c.y_norm ? Math.round(c.y_norm * 1080) : 100]
                  ).catch(() => {});
                }
              }
            }
          }
        }
      }

      // Fetch active plans list that actually contain Stromkreise
      const planRows = (await db.getAllAsync(`
        SELECT p.id, p.name, p.project_id, COALESCE(pr.name, '') as project_name 
        FROM plans p 
        LEFT JOIN projects pr ON p.project_id = pr.id 
        WHERE p.deleted_at IS NULL 
          AND p.id != 'pln-sample-001'
          AND EXISTS (SELECT 1 FROM stromkreise s WHERE s.plan_id = p.id AND s.deleted_at IS NULL)
        ORDER BY pr.name ASC, p.name ASC;
      `)) as PlanOption[];
      setPlans(planRows);
    } catch (e) {
      console.warn('[Circuits] Sync error:', e);
    }
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const db = await getDatabase();
      await syncCircuitsFromApi(db);

      let query = `
        SELECT s.id, s.plan_id, s.circuit_name, s.fuse_type, s.pos_x, s.pos_y, s.version,
               COALESCE(p.name, 'Plan') as plan_name,
               COALESCE(pr.name, '') as project_name
        FROM stromkreise s
        LEFT JOIN plans p ON s.plan_id = p.id
        LEFT JOIN projects pr ON p.project_id = pr.id
        WHERE s.deleted_at IS NULL
      `;
      const params: any[] = [];

      if (selectedPlanId !== 'all') {
        query += ` AND s.plan_id = ?`;
        params.push(selectedPlanId);
      }

      query += ` ORDER BY s.circuit_name ASC;`;

      const rows = (await db.getAllAsync(query, params)) as StromkreisRow[];
      setCircuits(rows || []);
    } catch (err) {
      console.error('[Circuits] Load error:', err);
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

  const filteredCircuits = circuits.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.circuit_name.toLowerCase().includes(q) ||
      (c.fuse_type && c.fuse_type.toLowerCase().includes(q)) ||
      (c.project_name && c.project_name.toLowerCase().includes(q)) ||
      (c.plan_name && c.plan_name.toLowerCase().includes(q))
    );
  });

  const renderCircuitItem = ({ item }: { item: StromkreisRow }) => {
    const isCEE = item.circuit_name.toUpperCase().includes('CEE') || (item.fuse_type && item.fuse_type.includes('32A'));
    const isLight = item.circuit_name.toUpperCase().includes('L') || item.circuit_name.toUpperCase().includes('BELEUCHTUNG');
    const badgeColor = isCEE ? '#EF4444' : isLight ? '#EAB308' : '#3B82F6';
    const icon = isCEE ? '⚡' : isLight ? '💡' : '🔌';

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
            <View style={[styles.iconBadge, { backgroundColor: `${badgeColor}20`, borderColor: badgeColor }]}>
              <Text style={styles.iconText}>{icon}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{item.circuit_name}</Text>
              <Text style={styles.planSubtitle}>
                {item.project_name ? `${item.project_name} • ` : ''}{item.plan_name || 'Kein Plan zugewiesen'}
              </Text>
            </View>
          </View>
          <View style={[styles.fuseBadge, { borderColor: badgeColor }]}>
            <Text style={[styles.fuseText, { color: badgeColor }]}>{item.fuse_type || 'B16'}</Text>
          </View>
        </View>

        <View style={styles.cardFooter}>
          <Text style={styles.positionText}>
            Plan-Position: X={item.pos_x || 0}, Y={item.pos_y || 0}
          </Text>
          <Text style={styles.actionLink}>Auf 2D-Plan anzeigen →</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{
          title: t('circuits', '⚡ Stromkreise & Absicherung'),
          headerShown: true,
          headerBackTitle: 'Zurück',
          headerStyle: { backgroundColor: '#0B0F19' },
          headerTintColor: '#38BDF8',
          headerTitleStyle: { color: '#F8FAFC', fontWeight: '800' },
        }}
      />

      {/* Plan Filter Bar */}
      <View style={styles.filterSection}>
        <Text style={styles.filterHeading}>NACH PLAN FILTERN:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
          <TouchableOpacity
            style={[styles.chip, selectedPlanId === 'all' && styles.chipActive]}
            onPress={() => setSelectedPlanId('all')}
          >
            <Text style={[styles.chipText, selectedPlanId === 'all' && styles.chipTextActive]}>
              Alle ({circuits.length})
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
          placeholder="Stromkreis suchen (z.B. 1Q1, B16, UV)..."
          placeholderTextColor="#64748B"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Main List */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#38BDF8" />
          <Text style={styles.loadingText}>Stromkreise werden geladen...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredCircuits}
          keyExtractor={(item) => item.id}
          renderItem={renderCircuitItem}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#38BDF8" />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyEmoji}>⚡</Text>
              <Text style={styles.emptyTitle}>Keine Stromkreise gefunden</Text>
              <Text style={styles.emptySub}>
                Wählen Sie einen anderen Plan oder fügen Sie Stromkreise direkt im Plan ein.
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
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    borderColor: '#38BDF8',
  },
  chipText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
  },
  chipTextActive: {
    color: '#38BDF8',
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
  fuseBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    backgroundColor: '#1E293B',
  },
  fuseText: {
    fontSize: 11,
    fontWeight: '800',
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
    color: '#38BDF8',
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
