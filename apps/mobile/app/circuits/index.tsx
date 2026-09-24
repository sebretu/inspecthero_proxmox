import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDatabase } from '../../src/db/database';

interface StromkreisRow {
  id: string;
  plan_id: string;
  circuit_name: string;
  fuse_type: string | null;
  version: number;
}

interface BmaDeviceRow {
  id: string;
  plan_id: string;
  device_number: string;
  device_type: string;
  status: string | null;
  version: number;
}

export default function CircuitsScreen() {
  const [activeTab, setActiveTab] = useState<'circuits' | 'bma'>('circuits');
  const [circuits, setCircuits] = useState<StromkreisRow[]>([]);
  const [devices, setDevices] = useState<BmaDeviceRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const db = await getDatabase();

      const circuitRows = await db.getAllAsync<StromkreisRow>(
        'SELECT * FROM stromkreise WHERE deleted_at IS NULL ORDER BY circuit_name ASC;'
      );
      setCircuits(circuitRows);

      const bmaRows = await db.getAllAsync<BmaDeviceRow>(
        'SELECT * FROM bma_devices WHERE deleted_at IS NULL ORDER BY device_number ASC;'
      );
      setDevices(bmaRows);
    } catch (err) {
      console.error('[CircuitsScreen] Error loading circuits & BMA:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{
          title: 'Rozdzielnice & BMA',
          headerShown: true,
          headerBackTitle: 'Wstecz',
          headerStyle: { backgroundColor: '#0B0F19' },
          headerTintColor: '#38BDF8',
          headerTitleStyle: { color: '#F8FAFC', fontWeight: '700' },
        }}
      />

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'circuits' && styles.tabActive]}
          onPress={() => setActiveTab('circuits')}
        >
          <Text style={[styles.tabText, activeTab === 'circuits' && styles.tabTextActive]}>
            ⚡ Obwody ({circuits.length})
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
        </View>
      ) : activeTab === 'circuits' ? (
        <FlatList
          data={circuits}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyTitle}>Brak obwodów</Text>
              <Text style={styles.emptySubtitle}>Brak zdefiniowanych obwodów w rozdzielnicach.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{item.circuit_name}</Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>ROZDZIELNICA RG</Text>
                </View>
              </View>
              <Text style={styles.cardDesc}>Zabezpieczenie: {item.fuse_type || 'B16A'}</Text>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Stan: <Text style={styles.metaValue}>🟢 Sprawny</Text></Text>
                <Text style={styles.metaLabel}>Wersja: <Text style={styles.metaValue}>v{item.version}</Text></Text>
              </View>
            </View>
          )}
        />
      ) : (
        <FlatList
          data={devices}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyTitle}>Brak urządzeń BMA</Text>
              <Text style={styles.emptySubtitle}>Brak czujek sygnalizacji pożarowej.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{item.device_number}</Text>
                <View style={[styles.badge, { borderColor: '#22C55E' }]}>
                  <Text style={[styles.badgeText, { color: '#22C55E' }]}>{item.status || 'OK'}</Text>
                </View>
              </View>
              <Text style={styles.cardDesc}>{item.device_type}</Text>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Pętla: <Text style={styles.metaValue}>Pętla 1 (Kond. +1)</Text></Text>
                <Text style={styles.metaLabel}>Wersja: <Text style={styles.metaValue}>v{item.version}</Text></Text>
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
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#0B0F19',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
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
    fontSize: 13,
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
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
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
