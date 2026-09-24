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

interface PlanItem {
  id: string;
  name: string;
  project_name?: string;
  building_name?: string;
  floor_name?: string;
  task_count?: number;
  bma_count?: number;
}

export default function PlansListScreen() {
  const router = useRouter();
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const loadPlans = useCallback(async () => {
    try {
      setLoading(true);
      const db = await getDatabase();
      
      const rows = await db.getAllAsync<PlanItem>(`
        SELECT 
          p.id, 
          p.name, 
          COALESCE(pr.name, 'Projekt ogólny') as project_name,
          COALESCE(b.name, '') as building_name,
          COALESCE(f.name, '') as floor_name,
          (SELECT COUNT(*) FROM tasks t WHERE t.plan_id = p.id AND t.deleted_at IS NULL) as task_count,
          (SELECT COUNT(*) FROM bma_devices bd WHERE bd.plan_id = p.id AND bd.deleted_at IS NULL) as bma_count
        FROM plans p
        LEFT JOIN projects pr ON p.project_id = pr.id
        LEFT JOIN floors f ON p.floor_id = f.id
        LEFT JOIN buildings b ON f.building_id = b.id
        WHERE p.deleted_at IS NULL
        ORDER BY pr.name ASC, p.name ASC;
      `);

      if (rows.length === 0) {
        // Fallback sample if empty
        setPlans([
          {
            id: 'e6a8e578-831e-4509-9b9a-41eeea3d6f4c',
            name: '00_EG_Uebersicht.pdf (Parter)',
            project_name: 'SEGRO Park Berlin City',
            floor_name: 'Parter (EG)',
            task_count: 5,
            bma_count: 12,
          },
          {
            id: 'a52140bb-5899-4c5c-9c3f-4e0e227fcda3',
            name: '9030_GR_BMA_Gesamt-A0.pdf',
            project_name: 'SEGRO Park Berlin City',
            floor_name: 'Pętla BMA Ogólna',
            task_count: 2,
            bma_count: 34,
          },
          {
            id: 'ee006f85-0ec7-4ca3-b8f4-41d3d6e5a409',
            name: '01_1OG_Bueros.pdf (1. Piętro)',
            project_name: 'SEGRO Park Berlin City',
            floor_name: '1. Piętro Biura',
            task_count: 8,
            bma_count: 18,
          },
        ]);
      } else {
        setPlans(rows);
      }
    } catch (err) {
      console.error('[PlansList] Load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  const filteredPlans = plans.filter((p) => {
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      (p.project_name && p.project_name.toLowerCase().includes(q)) ||
      (p.floor_name && p.floor_name.toLowerCase().includes(q))
    );
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
