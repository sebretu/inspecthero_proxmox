import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
  ScrollView,
} from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDatabase } from '../../src/db/database';

interface AttendanceEntry {
  id: string;
  date: string;
  status: 'PRESENT' | 'VACATION' | 'ABSENT';
  start_time?: string;
  end_time?: string;
  break_time?: number;
  total_hours?: number;
  project_name?: string;
  notes?: string;
  version: number;
}

export default function AttendanceScreen() {
  const [entries, setEntries] = useState<AttendanceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);

  // Form State
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [status, setStatus] = useState<'PRESENT' | 'VACATION' | 'ABSENT'>('PRESENT');
  const [startTime, setStartTime] = useState('07:00');
  const [endTime, setEndTime] = useState('15:30');
  const [breakMinutes, setBreakMinutes] = useState('30');
  const [projectName, setProjectName] = useState('SEGRO Park Berlin City');
  const [notes, setNotes] = useState('');

  const calculateHours = (start: string, end: string, breakMins: string): number => {
    try {
      const [startH, startM] = start.split(':').map(Number);
      const [endH, endM] = end.split(':').map(Number);
      const totalMinutes = endH * 60 + endM - (startH * 60 + startM) - (Number(breakMins) || 0);
      return Math.max(0, Number((totalMinutes / 60).toFixed(2)));
    } catch {
      return 8.0;
    }
  };

  const loadEntries = useCallback(async () => {
    try {
      setLoading(true);
      const db = await getDatabase();
      const rows = await db.getAllAsync<any>(
        'SELECT * FROM attendance WHERE deleted_at IS NULL ORDER BY clock_in DESC, created_at DESC;'
      );

      const parsed: AttendanceEntry[] = rows.map((r: any) => {
        const rawDate = r.clock_in ? r.clock_in.split('T')[0] : new Date().toISOString().split('T')[0];
        const isVacation = r.notes?.includes('[URLOP]') || r.notes?.includes('[VACATION]');
        const isAbsent = r.notes?.includes('[NIEOBECNOŚĆ]') || r.notes?.includes('[ABSENT]');
        const entryStatus = isVacation ? 'VACATION' : isAbsent ? 'ABSENT' : 'PRESENT';

        let start = '07:00';
        let end = '15:30';
        if (r.clock_in && r.clock_in.includes('T')) {
          start = r.clock_in.split('T')[1].substring(0, 5);
        }
        if (r.clock_out && r.clock_out.includes('T')) {
          end = r.clock_out.split('T')[1].substring(0, 5);
        }

        const totalH = entryStatus === 'PRESENT' ? calculateHours(start, end, '30') : 8.0;

        return {
          id: r.id,
          date: rawDate,
          status: entryStatus,
          start_time: start,
          end_time: end,
          break_time: 30,
          total_hours: totalH,
          project_name: r.notes?.split('\n')[0] || 'Budowa ogólna',
          notes: r.notes || '',
          version: r.version || 1,
        };
      });

      if (parsed.length === 0) {
        // Seed default starter entries
        setEntries([
          {
            id: 'att-sample-1',
            date: new Date().toISOString().split('T')[0],
            status: 'PRESENT',
            start_time: '07:00',
            end_time: '15:30',
            break_time: 30,
            total_hours: 8.0,
            project_name: 'SEGRO Park Berlin City',
            notes: 'Montaż tras kablowych i puszek rozdzielczych',
            version: 1,
          },
          {
            id: 'att-sample-2',
            date: new Date(Date.now() - 86400000).toISOString().split('T')[0],
            status: 'PRESENT',
            start_time: '07:00',
            end_time: '16:00',
            break_time: 30,
            total_hours: 8.5,
            project_name: 'Sapporo Tower',
            notes: 'Pomiary rezystancji i okablowanie BMA',
            version: 1,
          },
        ]);
      } else {
        setEntries(parsed);
      }
    } catch (err) {
      console.error('[Attendance] Load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const handleSaveEntry = async () => {
    if (!date.trim()) {
      Alert.alert('Błąd', 'Podaj datę wpisu.');
      return;
    }

    try {
      const db = await getDatabase();
      const attendanceId = `att-${Date.now()}`;
      const now = new Date().toISOString();

      const clockInIso = `${date}T${startTime}:00Z`;
      const clockOutIso = `${date}T${endTime}:00Z`;
      const calculatedH = status === 'PRESENT' ? calculateHours(startTime, endTime, breakMinutes) : 8.0;

      const formattedNotes =
        status === 'VACATION'
          ? `[URLOP] ${notes || 'Urlop wypoczynkowy'}`
          : status === 'ABSENT'
          ? `[NIEOBECNOŚĆ] ${notes || 'Nieobecność usprawiedliwiona'}`
          : `${projectName}\n${notes ? notes + '\n' : ''}Czas: ${startTime}-${endTime} (Przerwa: ${breakMinutes}m, Suma: ${calculatedH}h)`;

      await db.runAsync(`
        INSERT INTO attendance (id, user_id, project_id, clock_in, clock_out, notes, version, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?);
      `, [
        attendanceId,
        'usr-current',
        null,
        clockInIso,
        status === 'PRESENT' ? clockOutIso : clockInIso,
        formattedNotes,
        now,
        now,
      ]);

      // Record offline mutation
      await db.runAsync(`
        INSERT INTO mutations (
          mutation_id, entity_type, entity_id, operation, base_version, payload, status, attempts, created_at, updated_at
        ) VALUES (?, 'attendance', ?, 'INSERT', 1, ?, 'PENDING', 0, ?, ?);
      `, [
        `mut-${Date.now()}`,
        attendanceId,
        JSON.stringify({
          id: attendanceId,
          date,
          status,
          start_time: startTime,
          end_time: endTime,
          break_time: Number(breakMinutes) || 0,
          notes: formattedNotes,
          created_at: now,
        }),
        now,
        now,
      ]);

      Alert.alert('Zapisano', 'Wpis godzin / urlopu został dodany do bazy lokalnej.');
      setShowAddForm(false);
      setNotes('');
      await loadEntries();
    } catch (err: any) {
      Alert.alert('Błąd zapisu', err?.message || 'Nie udało się zapisać wpisu');
    }
  };

  const totalMonthlyHours = entries
    .filter((e) => e.status === 'PRESENT')
    .reduce((acc, curr) => acc + (curr.total_hours || 0), 0);

  const vacationDays = entries.filter((e) => e.status === 'VACATION').length;

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{
          title: 'Godziny i Urlopy (Zeiterfassung)',
          headerShown: true,
          headerBackTitle: 'Wstecz',
          headerStyle: { backgroundColor: '#0B0F19' },
          headerTintColor: '#38BDF8',
          headerTitleStyle: { color: '#F8FAFC', fontWeight: '700' },
        }}
      />

      {/* Summary KPI */}
      <View style={styles.summaryBar}>
        <View style={styles.kpiBox}>
          <Text style={styles.kpiValue}>{totalMonthlyHours.toFixed(1)} h</Text>
          <Text style={styles.kpiLabel}>Przepracowane godziny</Text>
        </View>
        <View style={styles.kpiDivider} />
        <View style={styles.kpiBox}>
          <Text style={[styles.kpiValue, { color: '#F59E0B' }]}>{vacationDays} dni</Text>
          <Text style={styles.kpiLabel}>Wykorzystany urlop</Text>
        </View>
        <View style={styles.kpiDivider} />
        <TouchableOpacity
          style={styles.addBtnHeader}
          onPress={() => setShowAddForm(!showAddForm)}
        >
          <Text style={styles.addBtnHeaderText}>{showAddForm ? '✕ Anuluj' : '+ Dodaj wpis'}</Text>
        </TouchableOpacity>
      </View>

      {/* Manual Entry Form */}
      {showAddForm && (
        <ScrollView style={styles.formCard}>
          <Text style={styles.formTitle}>Nowy wpis godzin / urlopu</Text>

          {/* Status Switcher */}
          <View style={styles.typeSelector}>
            <TouchableOpacity
              style={[styles.typeBtn, status === 'PRESENT' && styles.typeBtnActive]}
              onPress={() => setStatus('PRESENT')}
            >
              <Text style={[styles.typeBtnText, status === 'PRESENT' && styles.typeBtnTextActive]}>
                🟢 Przepracowane godziny
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.typeBtn, status === 'VACATION' && styles.typeBtnActiveVacation]}
              onPress={() => setStatus('VACATION')}
            >
              <Text style={[styles.typeBtnText, status === 'VACATION' && styles.typeBtnTextActiveVacation]}>
                🟡 Urlop
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.typeBtn, status === 'ABSENT' && styles.typeBtnActiveAbsent]}
              onPress={() => setStatus('ABSENT')}
            >
              <Text style={[styles.typeBtnText, status === 'ABSENT' && styles.typeBtnTextActiveAbsent]}>
                🔴 Nieobecność
              </Text>
            </TouchableOpacity>
          </View>

          {/* Date */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>DATA (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={date}
              onChangeText={setDate}
              placeholder="2026-09-24"
              placeholderTextColor="#64748B"
            />
          </View>

          {status === 'PRESENT' && (
            <>
              {/* Hours Grid */}
              <View style={styles.timeRow}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>OD GODZINY</Text>
                  <TextInput
                    style={styles.input}
                    value={startTime}
                    onChangeText={setStartTime}
                    placeholder="07:00"
                    placeholderTextColor="#64748B"
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>DO GODZINY</Text>
                  <TextInput
                    style={styles.input}
                    value={endTime}
                    onChangeText={setEndTime}
                    placeholder="15:30"
                    placeholderTextColor="#64748B"
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>PRZERWA (MIN)</Text>
                  <TextInput
                    style={styles.input}
                    value={breakMinutes}
                    onChangeText={setBreakMinutes}
                    keyboardType="numeric"
                    placeholder="30"
                    placeholderTextColor="#64748B"
                  />
                </View>
              </View>

              <Text style={styles.calcPreview}>
                ⏱️ Suma netto: <Text style={{ color: '#38BDF8', fontWeight: '800' }}>{calculateHours(startTime, endTime, breakMinutes)} h</Text>
              </Text>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>PROJEKT / BUDOWA</Text>
                <TextInput
                  style={styles.input}
                  value={projectName}
                  onChangeText={setProjectName}
                  placeholder="np. SEGRO Park Berlin City"
                  placeholderTextColor="#64748B"
                />
              </View>
            </>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>OPIS WYKONANYCH PRAC / UWAGI</Text>
            <TextInput
              style={[styles.input, { height: 60 }]}
              value={notes}
              onChangeText={setNotes}
              multiline
              placeholder="np. Montaż tras kablowych, podłączenie rozdzielnicy..."
              placeholderTextColor="#64748B"
            />
          </View>

          <TouchableOpacity style={styles.saveBtn} activeOpacity={0.8} onPress={handleSaveEntry}>
            <Text style={styles.saveBtnText}>💾 Zapisz wpis do bazy</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Entries List */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#38BDF8" />
          <Text style={styles.loadingText}>Ładowanie ewidencji godzin...</Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyTitle}>Brak wpisów</Text>
              <Text style={styles.emptySubtitle}>Kliknij "+ Dodaj wpis", aby oddać godziny lub urlop.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.dateCol}>
                  <Text style={styles.dateText}>{item.date}</Text>
                  <Text style={styles.projectText}>{item.project_name}</Text>
                </View>

                {item.status === 'VACATION' ? (
                  <View style={styles.vacationBadge}>
                    <Text style={styles.vacationBadgeText}>🟡 URLOP</Text>
                  </View>
                ) : item.status === 'ABSENT' ? (
                  <View style={styles.absentBadge}>
                    <Text style={styles.absentBadgeText}>🔴 NIEOBECNOŚĆ</Text>
                  </View>
                ) : (
                  <View style={styles.hoursBadge}>
                    <Text style={styles.hoursBadgeText}>🟢 {item.total_hours} h</Text>
                  </View>
                )}
              </View>

              {item.status === 'PRESENT' && (
                <View style={styles.timeDetailsRow}>
                  <Text style={styles.timeRange}>
                    🕒 {item.start_time} - {item.end_time}
                  </Text>
                  <Text style={styles.breakText}>Przerwa: {item.break_time} min</Text>
                </View>
              )}

              {item.notes ? <Text style={styles.notesText}>{item.notes}</Text> : null}
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
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0B0F19',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  kpiBox: {
    alignItems: 'center',
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#38BDF8',
  },
  kpiLabel: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
  },
  kpiDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#1E293B',
  },
  addBtnHeader: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  addBtnHeaderText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
  },
  formCard: {
    backgroundColor: '#0F172A',
    margin: 16,
    marginBottom: 0,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    maxHeight: 400,
  },
  formTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 12,
  },
  typeSelector: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
  },
  typeBtn: {
    flex: 1,
    backgroundColor: '#1E293B',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  typeBtnActive: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    borderWidth: 1,
    borderColor: '#22C55E',
  },
  typeBtnActiveVacation: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  typeBtnActiveAbsent: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  typeBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },
  typeBtnTextActive: {
    color: '#22C55E',
  },
  typeBtnTextActiveVacation: {
    color: '#F59E0B',
  },
  typeBtnTextActiveAbsent: {
    color: '#EF4444',
  },
  inputGroup: {
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#030712',
    color: '#F8FAFC',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  timeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  calcPreview: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 10,
  },
  saveBtn: {
    backgroundColor: '#0284C7',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 16,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  list: {
    padding: 16,
  },
  card: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  dateCol: {
    flex: 1,
  },
  dateText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  projectText: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  hoursBadge: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  hoursBadgeText: {
    color: '#22C55E',
    fontSize: 13,
    fontWeight: '800',
  },
  vacationBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  vacationBadgeText: {
    color: '#F59E0B',
    fontSize: 12,
    fontWeight: '800',
  },
  absentBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  absentBadgeText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '800',
  },
  timeDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#0B0F19',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    marginBottom: 6,
  },
  timeRange: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '600',
  },
  breakText: {
    color: '#64748B',
    fontSize: 12,
  },
  notesText: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 4,
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
