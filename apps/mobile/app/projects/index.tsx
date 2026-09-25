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
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDatabase } from '../../src/db/database';

import { authSupabase } from '../../src/auth/authClient';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://inspecthero.pl';

interface ProjectItem {
  id: string;
  name: string;
  status: string | null;
  building_count?: number;
  task_count?: number;
}

export default function ProjectsScreen() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const syncProjectsFromApi = async (db: any) => {
    try {
      const { data: { session } } = await authSupabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const res = await fetch(`${API_BASE_URL}/api/projects`, { headers });
      if (res.ok) {
        const json = await res.json();
        const apiProjects = Array.isArray(json) ? json : (json?.data || []);
        if (apiProjects.length > 0) {
          const now = new Date().toISOString();
          for (const p of apiProjects) {
            await db.runAsync(
              `INSERT INTO projects (id, name, status, created_at, updated_at, version)
               VALUES (?, ?, ?, ?, ?, 1)
               ON CONFLICT(id) DO UPDATE SET name = excluded.name, status = excluded.status, updated_at = excluded.updated_at;`,
              [p.id, p.name, p.status || 'ACTIVE', p.created_at || now, p.updated_at || now]
            );
          }
          // Prune all stale/unassigned projects not in the user's active projects list
          const validIds = apiProjects.map((p: any) => `'${p.id}'`).join(',');
          await db.runAsync(`DELETE FROM projects WHERE id NOT IN (${validIds});`).catch(() => {});
        }
      }
    } catch (apiErr) {
      console.warn('[ProjectsScreen] API sync skipped or failed:', apiErr);
    }
  };


  const loadProjects = useCallback(async () => {
    try {
      const db = await getDatabase();
      // Try background fetch & sync from API
      await syncProjectsFromApi(db);

      const rows = await db.getAllAsync<ProjectItem>(`
        SELECT 
          p.id, 
          p.name, 
          p.status,
          (SELECT COUNT(*) FROM buildings b WHERE b.project_id = p.id AND b.deleted_at IS NULL) as building_count,
          (SELECT COUNT(*) FROM tasks t 
           JOIN plans pl ON t.plan_id = pl.id 
           WHERE pl.project_id = p.id AND t.deleted_at IS NULL) as task_count
        FROM projects p 
        WHERE p.deleted_at IS NULL AND p.id != 'proj-sample-001'
        ORDER BY p.name ASC;
      `);
      setProjects(rows);
    } catch (err) {
      console.error('[ProjectsScreen] Error loading projects:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);


  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const onRefresh = () => {
    setRefreshing(true);
    loadProjects();
  };

  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{
          title: 'Bauprojekte (et4u)',
          headerShown: true,
          headerBackTitle: 'Zurück',
          headerStyle: { backgroundColor: '#0B0F19' },
          headerTintColor: '#38BDF8',
          headerTitleStyle: { color: '#F8FAFC', fontWeight: '700' },
        }}
      />

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Projekte suchen..."
          placeholderTextColor="#64748B"
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
        />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#38BDF8" />
          <Text style={styles.loadingText}>Projekte werden geladen...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredProjects}
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
              <Text style={styles.emptyTitle}>Keine Projekte</Text>
              <Text style={styles.emptySubtitle}>
                Keine passenden Projekte gefunden.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.7}
              onPress={() => router.push(`/projects/${item.id}` as any)}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.status || 'AKTIV'}</Text>
                </View>
              </View>

              <View style={styles.metaRow}>
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>Gebäude</Text>
                  <Text style={styles.metaValue}>{item.building_count || 1}</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>Aufgaben</Text>
                  <Text style={styles.metaValue}>{item.task_count || 3}</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>Datenbank</Text>
                  <Text style={styles.metaValue}>SQLite (WAL)</Text>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0B0F19',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  searchInput: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#F8FAFC',
    fontSize: 15,
  },
  list: {
    padding: 16,
  },
  card: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F8FAFC',
    flex: 1,
    marginRight: 10,
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
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E293B',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  metaItem: {
    alignItems: 'center',
    flex: 1,
  },
  metaLabel: {
    fontSize: 11,
    color: '#94A3B8',
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F8FAFC',
  },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: '#334155',
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
