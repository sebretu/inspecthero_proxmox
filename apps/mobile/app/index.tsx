import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDatabase } from '../src/db/database';
import { useAuth } from '../src/auth/useAuth';
import { SyncBar } from '../src/components/SyncBar';

import { HeaderNav } from '../src/components/HeaderNav';
import { useLanguage } from '../src/i18n/LanguageContext';

export default function HomeScreen() {
  const router = useRouter();
  const { user, isAuthenticated, signOut } = useAuth();
  const { t } = useLanguage();

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
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar style="light" />
      <HeaderNav />

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header */}
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

          {isAuthenticated ? (
            <TouchableOpacity style={styles.userBadge} onPress={signOut}>
              <Text style={styles.userEmail} numberOfLines={1}>
                👤 {user?.email}
              </Text>
              <Text style={styles.logoutText}>Wyloguj</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.loginBadge}
              onPress={() => router.push('/(auth)/login' as any)}
            >
              <Text style={styles.loginBadgeText}>🔑 Zaloguj do chmury</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Sync Status Bar */}
        <SyncBar />

        {/* Main Stats Card */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Lokalna Baza Danych</Text>
            <View style={styles.onlineBadge}>
              <Text style={styles.onlineBadgeText}>🟢 SQLite (WAL)</Text>
            </View>
          </View>

          <Text style={styles.cardDescription}>
            Wszystkie obiekty, rzuty kondygnacji i zadania montażowe są w pełni dostępne i edytowalne bez dostępu do Internetu.
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

        {/* Quick Actions */}
        <View style={styles.actionsSection}>
          <View style={styles.primaryActionRow}>
            <TouchableOpacity
              style={[styles.primaryButton, { flex: 1 }]}
              activeOpacity={0.8}
              onPress={() => router.push('/plans' as any)}
            >
              <Text style={styles.primaryButtonText}>📐 Przeglądaj Plany (Leaflet) →</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.projectsButton, { flex: 1 }]}
              activeOpacity={0.8}
              onPress={() => router.push('/projects' as any)}
            >
              <Text style={styles.projectsButtonText}>🏢 Projekty ({projectCount}) →</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.modulesRow}>
            <TouchableOpacity
              style={styles.moduleBtn}
              activeOpacity={0.8}
              onPress={() => router.push('/cables' as any)}
            >
              <Text style={styles.moduleIcon}>🔌</Text>
              <Text style={styles.moduleTitle}>Kable i Bębny</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.moduleBtn}
              activeOpacity={0.8}
              onPress={() => router.push('/circuits' as any)}
            >
              <Text style={styles.moduleIcon}>⚡</Text>
              <Text style={styles.moduleTitle}>Obwody & BMA</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.modulesRow}>
            <TouchableOpacity
              style={styles.moduleBtn}
              activeOpacity={0.8}
              onPress={() => router.push('/attendance' as any)}
            >
              <Text style={styles.moduleIcon}>⏱️</Text>
              <Text style={styles.moduleTitle}>Godziny & Urlopy</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.moduleBtn}
              activeOpacity={0.8}
              onPress={() => router.push('/orders' as any)}
            >
              <Text style={styles.moduleIcon}>📦</Text>
              <Text style={styles.moduleTitle}>Materiały (Katalog)</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.secondaryButton}
            activeOpacity={0.8}
            onPress={() => router.push('/tasks/create' as any)}
          >
            <Text style={styles.secondaryButtonText}>+ Dodaj nowe zadanie offline</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#030712',
  },
  scroll: {
    padding: 20,
    justifyContent: 'space-between',
    minHeight: '100%',
  },
  header: {
    marginTop: 10,
    marginBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  logoBadgeText: {
    fontSize: 22,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 12,
    color: '#94A3B8',
  },
  userBadge: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
    alignItems: 'flex-end',
    maxWidth: 150,
  },
  userEmail: {
    fontSize: 11,
    color: '#F8FAFC',
    fontWeight: '600',
  },
  logoutText: {
    fontSize: 10,
    color: '#EF4444',
    marginTop: 2,
  },
  loginBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  loginBadgeText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
  },
  card: {
    backgroundColor: '#0F172A',
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 20,
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
  actionsSection: {
    gap: 12,
    marginBottom: 10,
  },
  primaryActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryButton: {
    backgroundColor: '#0284C7',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  projectsButton: {
    backgroundColor: '#0F172A',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  projectsButtonText: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  modulesRow: {
    flexDirection: 'row',
    gap: 12,
  },
  moduleBtn: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  moduleIcon: {
    fontSize: 22,
    marginBottom: 6,
  },
  moduleTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  secondaryButton: {
    backgroundColor: '#1E293B',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  secondaryButtonText: {
    color: '#38BDF8',
    fontSize: 14,
    fontWeight: '700',
  },
});
