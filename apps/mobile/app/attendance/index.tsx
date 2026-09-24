import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDatabase } from '../../src/db/database';

interface AttendanceRow {
  id: string;
  user_id: string;
  project_id?: string;
  clock_in: string;
  clock_out?: string;
  notes?: string;
  version: number;
}

export default function AttendanceScreen() {
  const [logs, setLogs] = useState<AttendanceRow[]>([]);
  const [activeShift, setActiveShift] = useState<AttendanceRow | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAttendance = useCallback(async () => {
    try {
      setLoading(true);
      const db = await getDatabase();
      const rows = await db.getAllAsync<AttendanceRow>(
        'SELECT * FROM attendance WHERE deleted_at IS NULL ORDER BY clock_in DESC;'
      );
      setLogs(rows);

      // Find open shift without clock_out
      const open = rows.find((r) => !r.clock_out);
      setActiveShift(open || null);
    } catch (err) {
      console.error('[AttendanceScreen] Error loading attendance:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAttendance();
  }, [loadAttendance]);

  const handleClockIn = async () => {
    try {
      const db = await getDatabase();
      const attendanceId = `att-${Date.now()}`;
      const now = new Date().toISOString();

      await db.runAsync(`
        INSERT INTO attendance (id, user_id, project_id, clock_in, version, created_at, updated_at)
        VALUES (?, 'offline_user', 'proj-sample-001', ?, 1, ?, ?);
      `, [attendanceId, now, now, now]);

      await db.runAsync(`
        INSERT INTO mutations (
          mutation_id, entity_type, entity_id, operation, base_version, payload, status, attempts, created_at, updated_at
        ) VALUES (?, 'attendance', ?, 'INSERT', 0, ?, 'PENDING', 0, ?, ?);
      `, [
        `mut-${Date.now()}-${attendanceId}`,
        attendanceId,
        JSON.stringify({
          clock_in: now,
          project_id: 'proj-sample-001',
          created_at: now,
        }),
        now,
        now,
      ]);

      const newRow: AttendanceRow = {
        id: attendanceId,
        user_id: 'offline_user',
        project_id: 'proj-sample-001',
        clock_in: now,
        version: 1,
      };

      setActiveShift(newRow);
      setLogs((prev) => [newRow, ...prev]);
      Alert.alert('Rozpoczęto pracę', 'Czas pracy został zarejestrowany lokalnie w trybie offline.');
    } catch (err: any) {
      Alert.alert('Błąd', err?.message || 'Nie udało się zarejestrować wejścia');
    }
  };

  const handleClockOut = async () => {
    if (!activeShift) return;

    try {
      const db = await getDatabase();
      const now = new Date().toISOString();
      const nextVersion = activeShift.version + 1;

      await db.runAsync(
        'UPDATE attendance SET clock_out = ?, version = ?, updated_at = ? WHERE id = ?;',
        [now, nextVersion, now, activeShift.id]
      );

      await db.runAsync(`
        INSERT INTO mutations (
          mutation_id, entity_type, entity_id, operation, base_version, payload, status, attempts, created_at, updated_at
        ) VALUES (?, 'attendance', ?, 'UPDATE', ?, ?, 'PENDING', 0, ?, ?);
      `, [
        `mut-${Date.now()}-${activeShift.id}`,
        activeShift.id,
        activeShift.version,
        JSON.stringify({ clock_out: now, updated_at: now }),
        now,
        now,
      ]);

      setActiveShift(null);
      setLogs((prev) =>
        prev.map((r) => (r.id === activeShift.id ? { ...r, clock_out: now, version: nextVersion } : r))
      );
      Alert.alert('Zakończono pracę', 'Koniec zmiany został zapisany w bazie SQLite.');
    } catch (err: any) {
      Alert.alert('Błąd', err?.message || 'Nie udało się zarejestrować wyjścia');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{
          title: 'Obecność & RCP',
          headerShown: true,
          headerBackTitle: 'Wstecz',
          headerStyle: { backgroundColor: '#0B0F19' },
          headerTintColor: '#38BDF8',
          headerTitleStyle: { color: '#F8FAFC', fontWeight: '700' },
        }}
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#38BDF8" />
        </View>
      ) : (
        <View style={styles.content}>
          {/* Main Clock-in/Clock-out Action Box */}
          <View style={styles.actionCard}>
            <Text style={styles.cardHeaderTitle}>
              {activeShift ? '🟢 Jesteś na budowie' : '⚪ Gotowy do rozpoczęcia zmiany'}
            </Text>
            <Text style={styles.cardHeaderSubtitle}>
              {activeShift
                ? `Rozpoczęto: ${new Date(activeShift.clock_in).toLocaleTimeString()}`
                : 'Zarejestruj wejście na teren obiektu (działa bez zasięgu)'}
            </Text>

            {activeShift ? (
              <TouchableOpacity
                style={[styles.clockBtn, styles.clockOutBtn]}
                activeOpacity={0.8}
                onPress={handleClockOut}
              >
                <Text style={styles.clockBtnIcon}>⏹️</Text>
                <Text style={styles.clockBtnText}>ZAKOŃCZ PRACĘ (WYJŚCIE)</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.clockBtn, styles.clockInBtn]}
                activeOpacity={0.8}
                onPress={handleClockIn}
              >
                <Text style={styles.clockBtnIcon}>▶️</Text>
                <Text style={styles.clockBtnText}>ROZPOCZNIJ PRACĘ (WEJŚCIE)</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* History Section */}
          <View style={styles.historyHeader}>
            <Text style={styles.historyTitle}>Historia obecności ({logs.length})</Text>
          </View>

          <FlatList
            data={logs}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <View style={styles.center}>
                <Text style={styles.emptyTitle}>Brak wpisów</Text>
                <Text style={styles.emptySubtitle}>Nie zarejestrowano jeszcze żadnych zmian roboczych.</Text>
              </View>
            }
            renderItem={({ item }) => {
              const inDate = new Date(item.clock_in);
              const outDate = item.clock_out ? new Date(item.clock_out) : null;
              const durationHours = outDate
                ? ((outDate.getTime() - inDate.getTime()) / (1000 * 60 * 60)).toFixed(1)
                : null;

              return (
                <View style={styles.logCard}>
                  <View style={styles.logMain}>
                    <Text style={styles.logDate}>{inDate.toLocaleDateString()}</Text>
                    <Text style={styles.logTimes}>
                      {inDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ➔{' '}
                      {outDate ? outDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'w trakcie'}
                    </Text>
                  </View>

                  <View style={styles.logMeta}>
                    {durationHours ? (
                      <Text style={styles.durationText}>{durationHours} godz.</Text>
                    ) : (
                      <View style={styles.activeTag}>
                        <Text style={styles.activeTagText}>AKTYWNA</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            }}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#030712',
  },
  content: {
    flex: 1,
  },
  actionCard: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 20,
    margin: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
    alignItems: 'center',
  },
  cardHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 4,
  },
  cardHeaderSubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    marginBottom: 20,
    textAlign: 'center',
  },
  clockBtn: {
    width: '100%',
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  clockInBtn: {
    backgroundColor: '#0284C7',
  },
  clockOutBtn: {
    backgroundColor: '#DC2626',
  },
  clockBtnIcon: {
    fontSize: 18,
  },
  clockBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  historyHeader: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  historyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  list: {
    padding: 16,
    paddingTop: 0,
  },
  logCard: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  logMain: {
    flex: 1,
  },
  logDate: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 2,
  },
  logTimes: {
    fontSize: 13,
    color: '#94A3B8',
  },
  logMeta: {
    alignItems: 'flex-end',
  },
  durationText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#38BDF8',
  },
  activeTag: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#22C55E',
  },
  activeTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#22C55E',
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
