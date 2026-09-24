import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { SyncEngine, SyncEngineState } from '../sync/SyncEngine';

export function SyncBar() {
  const [syncState, setSyncState] = useState<SyncEngineState>(SyncEngine.getState());

  useEffect(() => {
    return SyncEngine.subscribe((state) => {
      setSyncState(state);
    });
  }, []);

  const handleManualSync = async () => {
    try {
      await SyncEngine.syncAll();
    } catch {
      // Handled via SyncEngine state listener
    }
  };

  const isSyncing = syncState.status === 'SYNCING';

  return (
    <View style={styles.container}>
      <View style={styles.infoCol}>
        <View style={styles.statusRow}>
          <Text style={styles.statusDot}>
            {syncState.status === 'SYNCED' ? '🟢' : syncState.status === 'SYNCING' ? '🟡' : syncState.status === 'ERROR' ? '🔴' : '⚪'}
          </Text>
          <Text style={styles.statusTitle}>
            {syncState.status === 'SYNCING'
              ? 'Synchronizacja z chmurą...'
              : syncState.status === 'SYNCED'
              ? 'Zsynchronizowano'
              : syncState.status === 'ERROR'
              ? 'Błąd połączenia'
              : 'Tryb Offline'}
          </Text>
        </View>
        <Text style={styles.metaText}>
          {syncState.pendingCount > 0
            ? `Oczekujące mutacje: ${syncState.pendingCount}`
            : syncState.lastSyncedAt
            ? `Ostatni sync: ${new Date(syncState.lastSyncedAt).toLocaleTimeString()}`
            : 'Gotowy do pracy bez zasięgu'}
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
          <Text style={styles.syncButtonText}>Sync 🔄</Text>
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
