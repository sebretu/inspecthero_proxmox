import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDatabase } from '../src/db/database';

export default function HomeScreen() {
  const router = useRouter();
  const [projectCount, setProjectCount] = useState<number>(0);
  const [taskCount, setTaskCount] = useState<number>(0);
  const [pendingMutations, setPendingMutations] = useState<number>(0);
  const [isReady, setIsReady] = useState(false);

  const loadStats = useCallback(async () => {
    try {
      const db = await getDatabase();
      const pCount = await db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM projects WHERE deleted_at IS NULL;'
      );
      const tCount = await db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM tasks WHERE deleted_at IS NULL;'
      );
      const mCount = await db.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) as count FROM mutations WHERE status = 'PENDING';"
      );

      setProjectCount(pCount?.count ?? 0);
      setTaskCount(tCount?.count ?? 0);
      setPendingMutations(mCount?.count ?? 0);
      setIsReady(true);
    } catch (err) {
      console.error('[HomeScreen] SQLite init error:', err);
      setIsReady(true);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoBadgeText}>⚡</Text>
          </View>
          <View>
            <Text style={styles.title}>et4u</Text>
            <Text style={styles.subtitle}>Offline-First Mobile Field Client</Text>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>Status Replikacji</Text>
          <View style={styles.onlineBadge}>
            <Text style={styles.onlineBadgeText}>🟢 Aktywna (WAL)</Text>
          </View>
        </View>

        <Text style={styles.cardDescription}>
          Lokalny silnik bazodanowy przechowuje strukturę obiektów, kondygnacji i zadań z pełną obsługą trybu bez zasięgu.
        </Text>

        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{isReady ? projectCount : '-'}</Text>
            <Text style={styles.statLabel}>Projekty</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{isReady ? taskCount : '-'}</Text>
            <Text style={styles.statLabel}>Zadania</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statValue, pendingMutations > 0 && styles.pendingStat]}>
              {isReady ? pendingMutations : '-'}
            </Text>
            <Text style={styles.statLabel}>Kolejka Sync</Text>
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.primaryButton}
          activeOpacity={0.8}
          onPress={() => router.push('/projects' as any)}
        >
          <Text style={styles.primaryButtonText}>Przejdź do projektów →</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#030712',
    padding: 20,
    justifyContent: 'space-between',
  },
  header: {
    marginTop: 20,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoBadge: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  logoBadgeText: {
    fontSize: 22,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#94A3B8',
    marginTop: 2,
  },
  card: {
    backgroundColor: '#0F172A',
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  onlineBadge: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  onlineBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#22C55E',
  },
  cardDescription: {
    fontSize: 13,
    color: '#94A3B8',
    lineHeight: 19,
    marginBottom: 18,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#0B0F19',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  statBox: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#38BDF8',
  },
  pendingStat: {
    color: '#F59E0B',
  },
  statLabel: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  footer: {
    marginBottom: 10,
  },
  primaryButton: {
    backgroundColor: '#0284C7',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
