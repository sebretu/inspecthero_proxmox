import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SyncEngine, SyncEngineState } from '../sync/SyncEngine';
import { authSupabase } from '../auth/authClient';

import { useLanguage } from '../i18n/LanguageContext';

export function SyncBar() {
  const router = useRouter();
  const { t } = useLanguage();
  const [syncState, setSyncState] = useState<SyncEngineState>(SyncEngine.getState());

  useEffect(() => {
    return SyncEngine.subscribe((state) => {
      setSyncState(state);
    });
  }, []);

  const handleManualSync = async () => {
    try {
      const { data: { session } } = await authSupabase.auth.getSession();
      if (!session) {
        Alert.alert(
          t('login_cloud', 'In Cloud anmelden'),
          t('db_desc', 'Um Daten aus der Cloud zu synchronisieren, melden Sie sich bitte an.'),
          [
            { text: 'Abbrechen', style: 'cancel' },
            {
              text: t('login_cloud', 'Anmelden →'),
              onPress: () => router.push('/(auth)/login' as any),
            },
          ]
        );
        return;
      }

      const res = await SyncEngine.syncAll();
      Alert.alert(
        t('synced', 'Synchronisiert'),
        `Pushed: ${res.pushed}, Pulled: ${res.pulled}`
      );
    } catch (err: any) {
      Alert.alert(t('conn_error', 'Verbindungsfehler'), err?.message || 'Error');
    }
  };

  const isSyncing = syncState.status === 'SYNCING';

  return (
    <View style={styles.container}>
      <View style={styles.infoCol}>
        <View style={styles.statusRow}>
          <Text style={styles.statusDot}>
            {syncState.status === 'SYNCED'
              ? '🟢'
              : syncState.status === 'SYNCING'
              ? '🟡'
              : syncState.status === 'ERROR'
              ? '🔴'
              : '⚪'}
          </Text>
          <Text style={styles.statusTitle}>
            {syncState.status === 'SYNCING'
              ? t('syncing', 'Synchronisiere mit Cloud...')
              : syncState.status === 'SYNCED'
              ? t('synced', 'Mit Cloud synchronisiert')
              : syncState.status === 'ERROR'
              ? t('conn_error', 'Verbindungsfehler')
              : t('ready_offline', 'Bereit für Offline-Arbeit')}
          </Text>
        </View>
        <Text style={styles.metaText}>
          {syncState.pendingCount > 0
            ? `${t('pending_mutations', 'Ausstehende Änderungen')}: ${syncState.pendingCount}`
            : syncState.lastSyncedAt
            ? `${t('last_sync', 'Letzter Sync')}: ${new Date(syncState.lastSyncedAt).toLocaleTimeString()}`
            : t('click_sync', 'Klicken Sie auf Sync 🔄 zum Laden')}
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.syncButton, isSyncing && styles.syncButtonDisabled]}
        onPress={handleManualSync}
        disabled={isSyncing}
        activeOpacity={0.7}
      >
        {isSyncing ? (
          <ActivityIndicator size="small" color="#38BDF8" />
        ) : (
          <Text style={styles.syncButtonText}>{t('sync_now', 'Sync 🔄')}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0F172A',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 16,
  },
  infoCol: {
    flex: 1,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  statusDot: {
    fontSize: 10,
    marginRight: 6,
  },
  statusTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  metaText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  syncButton: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  syncButtonDisabled: {
    borderColor: '#334155',
  },
  syncButtonText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
  },
});
