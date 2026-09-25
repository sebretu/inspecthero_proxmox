import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDatabase } from '../../src/db/database';

import { authSupabase } from '../../src/auth/authClient';
import { ScrollView, RefreshControl } from 'react-native';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://inspecthero.pl';

interface PlanItem {
  id: string;
  name: string;
  project_id?: string;
  project_name?: string;
  building_name?: string;
  floor_name?: string;
  task_count?: number;
  bma_count?: number;
}

interface ProjectOption {
  id: string;
  name: string;
}

export default function PlansListScreen() {
  const router = useRouter();
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const syncPlansFromApi = async (db: any) => {
    try {
      const { data: { session } } = await authSupabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      // 1. Fetch live projects
      const pRes = await fetch(`${API_BASE_URL}/api/projects`, { headers });
      let projs: ProjectOption[] = [];
      if (pRes.ok) {
        const pJson = await pRes.json();
        const rawProjs = Array.isArray(pJson) ? pJson : (pJson?.data || []);
        projs = rawProjs.map((p: any) => ({ id: p.id, name: p.name }));
        setProjects(projs);
      }

      // 2. Fetch plans for projects
      const now = new Date().toISOString();
      for (const pr of projs.slice(0, 10)) {
        const planRes = await fetch(`${API_BASE_URL}/api/plans?projectId=${encodeURIComponent(pr.id)}`, { headers });
        if (planRes.ok) {
          const planJson = await planRes.json();
          const plansList = Array.isArray(planJson) ? planJson : (planJson?.data || []);
          for (const pl of plansList) {
            const planName = pl.name || pl.pdf_path?.split('/')?.pop() || 'Plan architektoniczny';
            await db.runAsync(
              `INSERT INTO plans (id, project_id, floor_id, name, width, height, created_at, updated_at, version)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
               ON CONFLICT(id) DO UPDATE SET name = excluded.name, project_id = excluded.project_id, updated_at = excluded.updated_at;`,
              [pl.id, pr.id, pl.floor_id || null, planName, pl.image_width || 1920, pl.image_height || 1080, pl.created_at || now, pl.updated_at || now]
            );
          }
        }
      }
    } catch (apiErr) {
      console.warn('[PlansList] Live API sync skipped or failed:', apiErr);
    }
  };

  const loadPlans = useCallback(async () => {
    try {
      const db = await getDatabase();
      await syncPlansFromApi(db);

      const rows = await db.getAllAsync<PlanItem>(`
        SELECT 
          p.id, 
          p.name, 
          p.project_id,
          COALESCE(pr.name, 'Projekt ogólny') as project_name,
          COALESCE(b.name, '') as building_name,
          COALESCE(f.name, '') as floor_name,
          (SELECT COUNT(*) FROM tasks t WHERE t.plan_id = p.id AND t.deleted_at IS NULL) as task_count,
          (SELECT COUNT(*) FROM bma_devices bd WHERE bd.plan_id = p.id AND bd.deleted_at IS NULL) as bma_count
        FROM plans p
        LEFT JOIN projects pr ON p.project_id = pr.id
        LEFT JOIN floors f ON p.floor_id = f.id
        LEFT JOIN buildings b ON f.building_id = b.id
        WHERE p.deleted_at IS NULL AND p.id != 'pln-sample-001'
        ORDER BY pr.name ASC, p.name ASC;
      `);

      setPlans(rows);

      // Extract unique projects from local DB if not yet set
      const dbProjs = await db.getAllAsync<ProjectOption>(
        "SELECT id, name FROM projects WHERE deleted_at IS NULL AND id != 'proj-sample-001' ORDER BY name ASC;"
      );
      if (dbProjs.length > 0) {
        setProjects(dbProjs);
      }
    } catch (err) {
      console.error('[PlansList] Load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  const onRefresh = () => {
    setRefreshing(true);
    loadPlans();
  };

  const filteredPlans = plans.filter((p) => {
    const q = search.toLowerCase();
    const matchesProject = selectedProjectId === 'all' || p.project_id === selectedProjectId;
    const matchesSearch =
      p.name.toLowerCase().includes(q) ||
      (p.project_name && p.project_name.toLowerCase().includes(q)) ||
      (p.floor_name && p.floor_name.toLowerCase().includes(q));
    return matchesProject && matchesSearch;
  });

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{
          title: 'Przeglądarka Planów (Leaflet)',
          headerShown: true,
          headerBackTitle: 'Wróć',
          headerStyle: { backgroundColor: '#0B0F19' },
          headerTintColor: '#38BDF8',
          headerTitleStyle: { color: '#F8FAFC', fontWeight: '700' },
        }}
      />

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Szukaj rzutu, projektu lub kondygnacji..."
          placeholderTextColor="#64748B"
          value={search}
          onChangeText={setSearch}
        />

        {/* Project Selector Horizontal Scroll */}
        {projects.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.projectFilterRow}>
            <TouchableOpacity
              style={[styles.filterChip, selectedProjectId === 'all' && styles.filterChipActive]}
              onPress={() => setSelectedProjectId('all')}
            >
              <Text style={[styles.filterChipText, selectedProjectId === 'all' && styles.filterChipTextActive]}>
                Wszystkie ({plans.length})
              </Text>
            </TouchableOpacity>
            {projects.map((pr) => {
              const count = plans.filter((p) => p.project_id === pr.id).length;
              return (
                <TouchableOpacity
                  key={pr.id}
                  style={[styles.filterChip, selectedProjectId === pr.id && styles.filterChipActive]}
                  onPress={() => setSelectedProjectId(pr.id)}
                >
                  <Text style={[styles.filterChipText, selectedProjectId === pr.id && styles.filterChipTextActive]}>
                    🏢 {pr.name} ({count})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#38BDF8" />
          <Text style={styles.loadingText}>Ładowanie rzutów kondygnacji...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredPlans}
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
              <Text style={styles.emptyTitle}>Brak rzutów</Text>
              <Text style={styles.emptySubtitle}>Nie znaleziono planów pasujących do kryteriów wyszukiwania.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.8}
              onPress={() => router.push({ pathname: '/plans/[id]', params: { id: item.id } } as any)}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.icon}>📐</Text>
                <View style={styles.titleCol}>
                  <Text style={styles.planName}>{item.name}</Text>
                  <Text style={styles.projectName}>
                    🏢 {item.project_name} {item.floor_name ? `• ${item.floor_name}` : ''}
                  </Text>
                </View>
              </View>

              <View style={styles.badgeRow}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>📌 {item.task_count || 0} zadań</Text>
                </View>
                <View style={styles.badgeBma}>
                  <Text style={styles.badgeBmaText}>🚨 {item.bma_count || 0} czujek BMA</Text>
                </View>
                <View style={styles.arrowBadge}>
                  <Text style={styles.arrowText}>Otwórz plan 2D →</Text>
                </View>
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
  searchContainer: {
    padding: 16,
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
  projectFilterRow: {
    marginTop: 12,
    flexDirection: 'row',
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#1E293B',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  filterChipActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    borderColor: '#38BDF8',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },
  filterChipTextActive: {
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
    alignItems: 'center',
    marginBottom: 12,
  },
  icon: {
    fontSize: 28,
    marginRight: 12,
  },
  titleCol: {
    flex: 1,
  },
  planName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 2,
  },
  projectName: {
    fontSize: 12,
    color: '#94A3B8',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  badge: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  badgeText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '600',
  },
  badgeBma: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  badgeBmaText: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: '600',
  },
  arrowBadge: {
    marginLeft: 'auto',
  },
  arrowText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
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
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
  },
});
