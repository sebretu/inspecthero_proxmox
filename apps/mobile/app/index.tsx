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
  const { user, isAuthenticated, isAdmin, isMod, hasVdeAccess, signOut } = useAuth();
  const { t } = useLanguage();

  const [projectCount, setProjectCount] = useState<number>(0);
  const [taskCount, setTaskCount] = useState<number>(0);
  const [pendingMutations, setPendingMutations] = useState<number>(0);
  const [recentTasks, setRecentTasks] = useState<Array<{
    id: string;
    title: string;
    status: string;
    priority: string | null;
    plan_name?: string;
    created_at: string;
  }>>([]);
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

      const tasksRows = await db.getAllAsync<{
        id: string;
        title: string;
        status: string;
        priority: string | null;
        plan_name: string | null;
        created_at: string;
      }>(`
        SELECT 
          t.id, t.title, t.status, t.priority, t.created_at, p.name as plan_name
        FROM tasks t
        LEFT JOIN plans p ON t.plan_id = p.id
        WHERE t.deleted_at IS NULL
        ORDER BY t.created_at DESC
        LIMIT 4;
      `);

      setProjectCount(pCount?.count ?? 0);
      setTaskCount(tCount?.count ?? 0);
      setPendingMutations(mCount?.count ?? 0);
      setRecentTasks(
        (tasksRows || []).map((r) => ({
          id: r.id,
          title: r.title,
          status: r.status,
          priority: r.priority,
          plan_name: r.plan_name || 'Rzut obiektu',
          created_at: r.created_at,
        }))
      );
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
              <Text style={styles.subtitle}>{t('client_subtitle', 'Offline-First Mobiler Baustellen-Client')}</Text>
            </View>
          </View>

          {isAuthenticated ? (
            <TouchableOpacity style={styles.userBadge} onPress={signOut}>
              <Text style={styles.userEmail} numberOfLines={1}>
                👤 {user?.email}
              </Text>
              <Text style={styles.logoutText}>{t('logout', 'Abmelden')}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.loginBadge}
              onPress={() => router.push('/(auth)/login' as any)}
            >
              <Text style={styles.loginBadgeText}>{t('login_cloud', '🔑 In Cloud anmelden')}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Sync Status Bar */}
        <SyncBar />

        {/* Main Stats Card */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>{t('local_db', 'Lokale Datenbank')}</Text>
            <View style={styles.onlineBadge}>
              <Text style={styles.onlineBadgeText}>{t('sqlite_status', '🟢 SQLite (WAL)')}</Text>
            </View>
          </View>

          <Text style={styles.cardDescription}>
            {t('db_desc', 'Alle Bauobjekte, Geschosspläne und Montageaufgaben sind offline voll funktionsfähig.')}
          </Text>

          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{isReady ? projectCount : '-'}</Text>
              <Text style={styles.statLabel}>{t('projects_stat', 'Projekte')}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{isReady ? taskCount : '-'}</Text>
              <Text style={styles.statLabel}>{t('tasks_stat', 'Aufgaben')}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statValue, pendingMutations > 0 && styles.pendingStat]}>
                {isReady ? pendingMutations : '-'}
              </Text>
              <Text style={styles.statLabel}>{t('sync_queue_stat', 'Sync-Warteschlange')}</Text>
            </View>
          </View>
        </View>

        {/* Recent Active Tasks Feed */}
        {recentTasks.length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>📌 Ostatnie Zadania Montażowe</Text>
              <TouchableOpacity onPress={() => router.push('/tasks/create' as any)}>
                <Text style={styles.viewAllText}>+ Dodaj</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.recentTasksList}>
              {recentTasks.map((tItem) => {
                const st = (tItem.status || 'OPEN').toUpperCase();
                let badgeBg = 'rgba(2, 132, 199, 0.15)';
                let badgeColor = '#38BDF8';
                if (st === 'IN_PROGRESS') { badgeBg = 'rgba(245, 158, 11, 0.15)'; badgeColor = '#F59E0B'; }
                else if (st === 'DONE_WAITING_APPROVAL') { badgeBg = 'rgba(139, 92, 246, 0.2)'; badgeColor = '#A855F7'; }
                else if (st === 'APPROVED' || st === 'CLOSED') { badgeBg = 'rgba(16, 185, 129, 0.15)'; badgeColor = '#10B981'; }
                else if (st === 'REJECTED') { badgeBg = 'rgba(239, 68, 68, 0.15)'; badgeColor = '#EF4444'; }

                return (
                  <TouchableOpacity
                    key={tItem.id}
                    style={styles.recentTaskRow}
                    activeOpacity={0.7}
                    onPress={() => router.push(`/tasks/${tItem.id}` as any)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.recentTaskTitle} numberOfLines={1}>{tItem.title}</Text>
                      <Text style={styles.recentTaskPlan}>📐 {tItem.plan_name}</Text>
                    </View>
                    <View style={[styles.recentTaskBadge, { backgroundColor: badgeBg }]}>
                      <Text style={[styles.recentTaskBadgeText, { color: badgeColor }]}>{st}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Quick Actions */}
        <View style={styles.actionsSection}>
          <View style={styles.primaryActionRow}>
            <TouchableOpacity
              style={[styles.primaryButton, { flex: 1 }]}
              activeOpacity={0.8}
              onPress={() => router.push('/plans' as any)}
            >
              <Text style={styles.primaryButtonText}>{t('browse_plans_btn', '📐 Pläne (Leaflet) →')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.projectsButton, { flex: 1 }]}
              activeOpacity={0.8}
              onPress={() => router.push('/projects' as any)}
            >
              <Text style={styles.projectsButtonText}>
                {t('browse_projects_btn', '🏢 Projekte ({count}) →').replace('{count}', projectCount.toString())}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Module Row 1: Kable & Stromkreise (Elektro) */}
          <View style={styles.modulesRow}>
            <TouchableOpacity
              style={styles.moduleBtn}
              activeOpacity={0.8}
              onPress={() => router.push('/cables' as any)}
            >
              <Text style={styles.moduleIcon}>🔌</Text>
              <Text style={styles.moduleTitle}>{t('cables', 'KABEL')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.moduleBtn}
              activeOpacity={0.8}
              onPress={() => router.push('/circuits' as any)}
            >
              <Text style={styles.moduleIcon}>⚡</Text>
              <Text style={styles.moduleTitle}>{t('circuits', 'STROMKREISE')}</Text>
            </TouchableOpacity>
          </View>

          {/* Module Row 2: BMA Automatik (Separate!) & Mängelanzeige */}
          <View style={styles.modulesRow}>
            <TouchableOpacity
              style={[styles.moduleBtn, { borderColor: '#EF4444' }]}
              activeOpacity={0.8}
              onPress={() => router.push('/bma' as any)}
            >
              <Text style={styles.moduleIcon}>🚨</Text>
              <Text style={[styles.moduleTitle, { color: '#EF4444' }]}>{t('bma_automatik', 'BMA AUTOMATIK')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.moduleBtn}
              activeOpacity={0.8}
              onPress={() => router.push('/maengelanzeige' as any)}
            >
              <Text style={styles.moduleIcon}>📝</Text>
              <Text style={styles.moduleTitle}>{t('maengelanzeige', 'Mängelanzeige')}</Text>
            </TouchableOpacity>
          </View>

          {/* Module Row 3: Materialien & E-Check (Only if hasVdeAccess or Admin) */}
          <View style={styles.modulesRow}>
            <TouchableOpacity
              style={styles.moduleBtn}
              activeOpacity={0.8}
              onPress={() => router.push('/orders' as any)}
            >
              <Text style={styles.moduleIcon}>📦</Text>
              <Text style={styles.moduleTitle}>{t('materials_catalog', 'Materialien')}</Text>
            </TouchableOpacity>

            {hasVdeAccess || isAdmin ? (
              <TouchableOpacity
                style={[styles.moduleBtn, { borderColor: '#38BDF8' }]}
                activeOpacity={0.8}
                onPress={() => router.push('/echeck' as any)}
              >
                <Text style={styles.moduleIcon}>⚡</Text>
                <Text style={[styles.moduleTitle, { color: '#38BDF8' }]}>{t('echeck', 'E-Check (VDE)')}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.moduleBtn}
                activeOpacity={0.8}
                onPress={() => router.push('/tasks/create' as any)}
              >
                <Text style={styles.moduleIcon}>❓</Text>
                <Text style={styles.moduleTitle}>{t('questions', 'Pytania / Info')}</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Module Row 4: Attendance for Moderators/Admins */}
          {(isMod || isAdmin) && (
            <View style={styles.modulesRow}>
              <TouchableOpacity
                style={[styles.moduleBtn, { borderColor: '#8B5CF6' }]}
                activeOpacity={0.8}
                onPress={() => router.push('/attendance' as any)}
              >
                <Text style={styles.moduleIcon}>👥</Text>
                <Text style={[styles.moduleTitle, { color: '#8B5CF6' }]}>{t('employees', 'Pracownicy / Czas')}</Text>
              </TouchableOpacity>

              {isAdmin ? (
                <TouchableOpacity
                  style={[styles.moduleBtn, { borderColor: '#10B981' }]}
                  activeOpacity={0.8}
                  onPress={() => router.push('/plans' as any)}
                >
                  <Text style={styles.moduleIcon}>📏</Text>
                  <Text style={[styles.moduleTitle, { color: '#10B981' }]}>{t('aufmass', 'Aufmaß (Admin)')}</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.moduleBtn}
                  activeOpacity={0.8}
                  onPress={() => router.push('/tasks/create' as any)}
                >
                  <Text style={styles.moduleIcon}>❓</Text>
                  <Text style={styles.moduleTitle}>{t('questions', 'Pytania')}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <TouchableOpacity
            style={styles.secondaryButton}
            activeOpacity={0.8}
            onPress={() => router.push('/tasks/create' as any)}
          >
            <Text style={styles.secondaryButtonText}>{t('add_task_offline', '+ Nowe Zadanie Montażowe')}</Text>
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
  viewAllText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
  },
  recentTasksList: {
    marginTop: 8,
    gap: 8,
  },
  recentTaskRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0B0F19',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  recentTaskTitle: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  recentTaskPlan: {
    color: '#64748B',
    fontSize: 11,
  },
  recentTaskBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginLeft: 8,
  },
  recentTaskBadgeText: {
    fontSize: 9,
    fontWeight: '800',
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
