import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
  ScrollView,
  RefreshControl,
  Modal,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDatabase } from '../../src/db/database';
import { authSupabase } from '../../src/auth/authClient';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://inspecthero.pl';

interface Worker {
  id: string;
  full_name: string;
  type?: 'PROFILE' | 'EMPLOYEE';
  is_active?: boolean;
}

interface AttendanceEntry {
  id: string;
  worker_id: string;
  date: string; // YYYY-MM-DD
  status: 'PRESENT' | 'VACATION' | 'ABSENT' | 'HOLIDAY';
  start_time?: string;
  end_time?: string;
  break_time?: number;
  total_hours?: number;
  notes?: string;
}

const MONTH_NAMES = [
  'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
  'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'
];

const MONTH_SHORT = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAI', 'JUN',
  'JUL', 'AUG', 'SEP', 'OKT', 'NOV', 'DEZ'
];

export default function AttendanceCalendarScreen() {
  const router = useRouter();
  const currentDate = new Date();
  const [year, setYear] = useState<number>(currentDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(currentDate.getMonth()); // 0-11
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [entries, setEntries] = useState<AttendanceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchWorker, setSearchWorker] = useState('');

  // Cell Edit Modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
  const [editingDate, setEditingDate] = useState<string>('');
  const [editStatus, setEditStatus] = useState<'PRESENT' | 'VACATION' | 'ABSENT'>('PRESENT');
  const [editStart, setEditStart] = useState('07:00');
  const [editEnd, setEditEnd] = useState('15:30');
  const [editBreak, setEditBreak] = useState('30');
  const [editNotes, setEditNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Add Worker Modal
  const [showAddWorkerModal, setShowAddWorkerModal] = useState(false);
  const [newWorkerName, setNewWorkerName] = useState('');

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

  const getDaysInMonth = (mIdx: number, y: number) => new Date(y, mIdx + 1, 0).getDate();

  // Load attendance data from SQLite first, then background sync API
  const loadData = useCallback(async (targetYear = year) => {
    try {
      const db = await getDatabase();

      // Check local SQLite first for instant 0ms load
      const localWorkers = (await db.getAllAsync(
        'SELECT id, full_name, type FROM workers ORDER BY full_name ASC;'
      ).catch(() => [])) as Worker[];

      if (localWorkers && localWorkers.length > 0) {
        setWorkers(localWorkers);
        setLoading(false);
      }

      // Background fetch from API
      const { data: { session } } = await authSupabase.auth.getSession();
      const headers: Record<string, string> = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {};

      try {
        const [calRes, empRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/calendar?year=${targetYear}`, { headers }).catch(() => null),
          fetch(`${API_BASE_URL}/api/employees`, { headers }).catch(() => null),
        ]);

        let fetchedWorkers: Worker[] = [];
        let fetchedEntries: AttendanceEntry[] = [];

        if (calRes && calRes.ok) {
          const calJson = await calRes.json();
          const calData = calJson?.data || calJson;

          if (calData?.workers && Array.isArray(calData.workers)) {
            fetchedWorkers = calData.workers.map((w: any) => ({
              id: w.id,
              full_name: w.full_name,
              type: w.type || 'EMPLOYEE',
            }));
          }

          if (calData?.attendance && Array.isArray(calData.attendance)) {
            calData.attendance.forEach((a: any) => {
              const start = a.start_time || '07:00';
              const end = a.end_time || '15:30';
              const brk = a.break_time !== undefined ? a.break_time : 30;
              const wId = a.employee_id || a.user_id;
              if (wId && a.date) {
                fetchedEntries.push({
                  id: `att-${a.date}-${wId}`,
                  worker_id: wId,
                  date: a.date,
                  status: a.status || 'PRESENT',
                  start_time: start,
                  end_time: end,
                  break_time: brk,
                  total_hours: a.status === 'PRESENT' ? calculateHours(start, end, String(brk)) : 8.0,
                });
              }
            });
          }

          if (calData?.vacations && Array.isArray(calData.vacations)) {
            calData.vacations.forEach((v: any) => {
              const wId = v.employee_id || v.user_id;
              if (wId && v.start_date) {
                fetchedEntries.push({
                  id: `vac-${v.start_date}-${wId}`,
                  worker_id: wId,
                  date: v.start_date,
                  status: 'VACATION',
                  total_hours: 8.0,
                  notes: 'Urlop wypoczynkowy',
                });
              }
            });
          }

          if (calData?.holidays && Array.isArray(calData.holidays)) {
            calData.holidays.forEach((h: any) => {
              if (h.date) {
                // Apply holiday for all workers
                fetchedWorkers.forEach((w) => {
                  fetchedEntries.push({
                    id: `hol-${h.date}-${w.id}`,
                    worker_id: w.id,
                    date: h.date,
                    status: 'HOLIDAY',
                    notes: h.name || 'Feiertag',
                  });
                });
              }
            });
          }
        }

        if (fetchedWorkers.length === 0 && empRes && empRes.ok) {
          const empJson = await empRes.json();
          const emps = Array.isArray(empJson) ? empJson : (empJson?.data || []);
          fetchedWorkers = emps.map((e: any) => ({
            id: e.id,
            full_name: e.full_name,
            type: 'EMPLOYEE',
          }));
        }

        if (fetchedWorkers.length > 0) {
          setWorkers(fetchedWorkers);
          setEntries(fetchedEntries);

          // Save workers into SQLite
          for (const w of fetchedWorkers) {
            await db.runAsync(
              `INSERT INTO workers (id, full_name, type) VALUES (?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET full_name = excluded.full_name;`,
              [w.id, w.full_name, w.type || 'EMPLOYEE']
            ).catch(() => {});
          }
        }
      } catch (err) {
        console.warn('[Attendance] API fetch warning:', err);
      }
    } catch (e) {
      console.warn('[Attendance] Load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [year]);

  useEffect(() => {
    loadData(year);
  }, [year, loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData(year);
  };

  // Open Edit Cell Modal
  const openEditModal = (worker: Worker, day: number) => {
    const formattedDate = `${year}-${String(selectedMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setEditingWorker(worker);
    setEditingDate(formattedDate);

    const existing = entries.find((e) => e.worker_id === worker.id && e.date === formattedDate);
    if (existing) {
      setEditStatus(existing.status === 'HOLIDAY' ? 'PRESENT' : existing.status);
      setEditStart(existing.start_time || '07:00');
      setEditEnd(existing.end_time || '15:30');
      setEditBreak(String(existing.break_time !== undefined ? existing.break_time : '30'));
      setEditNotes(existing.notes || '');
    } else {
      setEditStatus('PRESENT');
      setEditStart('07:00');
      setEditEnd('15:30');
      setEditBreak('30');
      setEditNotes('');
    }

    setShowEditModal(true);
  };

  // Save Entry
  const handleSaveEntry = async () => {
    if (!editingWorker || !editingDate) return;

    try {
      setIsSaving(true);
      const isProfile = editingWorker.type === 'PROFILE';
      const idKey = isProfile ? 'user_id' : 'employee_id';

      const calcH = editStatus === 'PRESENT' ? calculateHours(editStart, editEnd, editBreak) : 8.0;

      const newEntry: AttendanceEntry = {
        id: `att-${editingDate}-${editingWorker.id}`,
        worker_id: editingWorker.id,
        date: editingDate,
        status: editStatus,
        start_time: editStatus === 'PRESENT' ? editStart : undefined,
        end_time: editStatus === 'PRESENT' ? editEnd : undefined,
        break_time: editStatus === 'PRESENT' ? Number(editBreak) || 0 : undefined,
        total_hours: calcH,
        notes: editNotes,
      };

      // Update state immediately
      setEntries((prev) => [
        newEntry,
        ...prev.filter((e) => !(e.worker_id === editingWorker.id && e.date === editingDate)),
      ]);

      setShowEditModal(false);

      // Async post to API
      const { data: { session } } = await authSupabase.auth.getSession();
      if (session?.access_token) {
        fetch(`${API_BASE_URL}/api/attendance`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            date: editingDate,
            status: editStatus,
            start_time: editStatus === 'PRESENT' ? editStart : null,
            end_time: editStatus === 'PRESENT' ? editEnd : null,
            break_time: editStatus === 'PRESENT' ? Number(editBreak) || 0 : 0,
            [idKey]: editingWorker.id,
          }),
        }).catch((err) => console.warn('[Attendance] API save error:', err));
      }
    } catch (e: any) {
      Alert.alert('Błąd', e?.message || 'Nie udało się zapisać wpisu.');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Entry
  const handleDeleteEntry = async () => {
    if (!editingWorker || !editingDate) return;

    try {
      setIsSaving(true);
      setEntries((prev) => prev.filter((e) => !(e.worker_id === editingWorker.id && e.date === editingDate)));
      setShowEditModal(false);

      const { data: { session } } = await authSupabase.auth.getSession();
      if (session?.access_token) {
        const idKey = editingWorker.type === 'PROFILE' ? 'user_id' : 'employee_id';
        fetch(`${API_BASE_URL}/api/attendance?date=${editingDate}&${idKey}=${editingWorker.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${session.access_token}` },
        }).catch(() => {});
      }
    } catch (e: any) {
      Alert.alert('Błąd', e?.message || 'Nie udało się usunąć wpisu.');
    } finally {
      setIsSaving(false);
    }
  };

  // Add Worker
  const handleAddWorker = async () => {
    if (!newWorkerName.trim()) {
      Alert.alert('Błąd', 'Wpisz imię i nazwisko pracownika.');
      return;
    }

    try {
      const newId = `emp-${Date.now()}`;
      const newW: Worker = {
        id: newId,
        full_name: newWorkerName.trim(),
        type: 'EMPLOYEE',
      };

      setWorkers((prev) => [...prev, newW]);
      setShowAddWorkerModal(false);
      setNewWorkerName('');

      const db = await getDatabase();
      await db.runAsync(
        'INSERT INTO workers (id, full_name, type) VALUES (?, ?, ?);',
        [newW.id, newW.full_name, 'EMPLOYEE']
      ).catch(() => {});

      const { data: { session } } = await authSupabase.auth.getSession();
      if (session?.access_token) {
        await fetch(`${API_BASE_URL}/api/employees`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ full_name: newW.full_name }),
        }).catch(() => {});
      }
    } catch (e: any) {
      Alert.alert('Błąd', e?.message || 'Nie udało się dodać pracownika.');
    }
  };

  const daysInSelectedMonth = useMemo(() => getDaysInMonth(selectedMonth, year), [selectedMonth, year]);

  const filteredWorkers = useMemo(() => {
    if (!searchWorker.trim()) return workers;
    return workers.filter((w) => w.full_name.toLowerCase().includes(searchWorker.toLowerCase()));
  }, [workers, searchWorker]);

  // Calculate monthly total hours per worker
  const workerTotals = useMemo(() => {
    const map: Record<string, { hours: number; vacation: number; absent: number }> = {};
    const monthPrefix = `${year}-${String(selectedMonth + 1).padStart(2, '0')}`;

    workers.forEach((w) => {
      map[w.id] = { hours: 0, vacation: 0, absent: 0 };
    });

    entries.forEach((e) => {
      if (e.date.startsWith(monthPrefix) && map[e.worker_id]) {
        if (e.status === 'PRESENT') {
          map[e.worker_id].hours += e.total_hours || 0;
        } else if (e.status === 'VACATION') {
          map[e.worker_id].vacation += 1;
        } else if (e.status === 'ABSENT') {
          map[e.worker_id].absent += 1;
        }
      }
    });

    return map;
  }, [workers, entries, year, selectedMonth]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{
          title: '📅 Anwesenheitskalender',
          headerShown: true,
          headerBackTitle: 'Wróć',
          headerStyle: { backgroundColor: '#0B0F19' },
          headerTintColor: '#38BDF8',
          headerTitleStyle: { color: '#F8FAFC', fontWeight: '800' },
          headerRight: () => (
            <TouchableOpacity
              style={styles.headerAddBtn}
              onPress={() => setShowAddWorkerModal(true)}
            >
              <Text style={styles.headerAddBtnText}>+ Pracownik</Text>
            </TouchableOpacity>
          ),
        }}
      />

      {/* Month Picker Bar */}
      <View style={styles.monthBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.monthScroll}>
          {MONTH_SHORT.map((m, idx) => (
            <TouchableOpacity
              key={m}
              style={[styles.monthChip, selectedMonth === idx && styles.monthChipActive]}
              onPress={() => setSelectedMonth(idx)}
            >
              <Text style={[styles.monthChipText, selectedMonth === idx && styles.monthChipTextActive]}>
                {m}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Subheader: Filter & Legend */}
      <View style={styles.subHeader}>
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#22C55E' }]} />
            <Text style={styles.legendText}>Praca</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#F59E0B' }]} />
            <Text style={styles.legendText}>Urlop</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
            <Text style={styles.legendText}>Nieobecność</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#2196F3' }]} />
            <Text style={styles.legendText}>Święto</Text>
          </View>
        </View>

        <TextInput
          style={styles.searchWorkerInput}
          placeholder="Szukaj pracownika..."
          placeholderTextColor="#64748B"
          value={searchWorker}
          onChangeText={setSearchWorker}
        />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#38BDF8" />
          <Text style={styles.loadingText}>Ładowanie kalendarza obecności...</Text>
        </View>
      ) : (
        /* CALENDAR TABLE GRID */
        <ScrollView
          style={styles.gridContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#38BDF8" />}
        >
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View style={styles.table}>
              {/* Table Header Row: Worker column + Day numbers */}
              <View style={styles.tableHeaderRow}>
                <View style={styles.workerColHeader}>
                  <Text style={styles.workerColHeaderText}>PRACOWNIK ({filteredWorkers.length})</Text>
                  <Text style={styles.workerColHeaderSub}>{MONTH_NAMES[selectedMonth]} {year}</Text>
                </View>

                {Array.from({ length: daysInSelectedMonth }, (_, i) => i + 1).map((day) => {
                  const d = new Date(year, selectedMonth, day);
                  const isSun = d.getDay() === 0;
                  const isSat = d.getDay() === 6;
                  return (
                    <View
                      key={day}
                      style={[
                        styles.dayHeaderCell,
                        isSun && styles.daySunHeader,
                        isSat && styles.daySatHeader,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayHeaderText,
                          isSun && { color: '#EF4444' },
                          isSat && { color: '#94A3B8' },
                        ]}
                      >
                        {day}
                      </Text>
                      <Text style={styles.dayHeaderWeekday}>
                        {['ND', 'PN', 'WT', 'ŚR', 'CZ', 'PT', 'SO'][d.getDay()]}
                      </Text>
                    </View>
                  );
                })}
              </View>

              {/* Table Body: Rows for each worker */}
              {filteredWorkers.map((worker) => {
                const total = workerTotals[worker.id] || { hours: 0, vacation: 0, absent: 0 };

                return (
                  <View key={worker.id} style={styles.tableRow}>
                    {/* Sticky-like Left Worker Cell */}
                    <View style={styles.workerCell}>
                      <View style={styles.workerAvatar}>
                        <Text style={styles.workerAvatarText}>
                          {worker.full_name?.charAt(0)?.toUpperCase() || 'P'}
                        </Text>
                      </View>
                      <View style={{ flex: 1, overflow: 'hidden' }}>
                        <Text style={styles.workerName} numberOfLines={1}>
                          {worker.full_name}
                        </Text>
                        <Text style={styles.workerStats}>
                          Suma: <Text style={{ color: '#38BDF8', fontWeight: '800' }}>{total.hours.toFixed(1)}h</Text>
                          {total.vacation > 0 ? ` | 🟡 ${total.vacation}d` : ''}
                        </Text>
                      </View>
                    </View>

                    {/* Day Cells for this worker */}
                    {Array.from({ length: daysInSelectedMonth }, (_, i) => i + 1).map((day) => {
                      const formattedDate = `${year}-${String(selectedMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                      const entry = entries.find((e) => e.worker_id === worker.id && e.date === formattedDate);

                      const d = new Date(year, selectedMonth, day);
                      const isSun = d.getDay() === 0;
                      const isSat = d.getDay() === 6;

                      let cellBg = '#0B0F19';
                      let cellText = '·';
                      let textColor = '#475569';

                      if (entry) {
                        if (entry.status === 'PRESENT') {
                          cellBg = '#15803D';
                          cellText = entry.total_hours ? `${entry.total_hours}h` : '✓';
                          textColor = '#F8FAFC';
                        } else if (entry.status === 'VACATION') {
                          cellBg = '#B45309';
                          cellText = 'U';
                          textColor = '#FEF3C7';
                        } else if (entry.status === 'ABSENT') {
                          cellBg = '#B91C1C';
                          cellText = 'X';
                          textColor = '#FEE2E2';
                        } else if (entry.status === 'HOLIDAY') {
                          cellBg = '#1D4ED8';
                          cellText = 'F';
                          textColor = '#DBEAFE';
                        }
                      } else if (isSun) {
                        cellBg = 'rgba(239, 68, 68, 0.08)';
                      } else if (isSat) {
                        cellBg = 'rgba(71, 85, 105, 0.15)';
                      }

                      return (
                        <TouchableOpacity
                          key={day}
                          style={[styles.dayCell, { backgroundColor: cellBg }]}
                          onPress={() => openEditModal(worker, day)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.dayCellText, { color: textColor }]}>
                            {cellText}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </ScrollView>
      )}

      {/* MODAL: EDIT ATTENDANCE CELL */}
      <Modal
        visible={showEditModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEditModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalHeading}>
              ✏️ Wpis: {editingWorker?.full_name}
            </Text>
            <Text style={styles.modalSubheading}>Data: {editingDate}</Text>

            {/* Status Switcher */}
            <View style={styles.modalStatusRow}>
              <TouchableOpacity
                style={[styles.modalStatusBtn, editStatus === 'PRESENT' && styles.modalStatusBtnActivePresent]}
                onPress={() => setEditStatus('PRESENT')}
              >
                <Text style={[styles.modalStatusBtnText, editStatus === 'PRESENT' && { color: '#22C55E' }]}>
                  🟢 Praca
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalStatusBtn, editStatus === 'VACATION' && styles.modalStatusBtnActiveVacation]}
                onPress={() => setEditStatus('VACATION')}
              >
                <Text style={[styles.modalStatusBtnText, editStatus === 'VACATION' && { color: '#F59E0B' }]}>
                  🟡 Urlop
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalStatusBtn, editStatus === 'ABSENT' && styles.modalStatusBtnActiveAbsent]}
                onPress={() => setEditStatus('ABSENT')}
              >
                <Text style={[styles.modalStatusBtnText, editStatus === 'ABSENT' && { color: '#EF4444' }]}>
                  🔴 Nieobecność
                </Text>
              </TouchableOpacity>
            </View>

            {editStatus === 'PRESENT' && (
              <View style={{ marginTop: 10 }}>
                <View style={styles.timeInputsRow}>
                  <View style={{ flex: 1, marginRight: 6 }}>
                    <Text style={styles.inputLabel}>OD GODZINY</Text>
                    <TextInput
                      style={styles.modalInput}
                      value={editStart}
                      onChangeText={setEditStart}
                      placeholder="07:00"
                      placeholderTextColor="#64748B"
                    />
                  </View>

                  <View style={{ flex: 1, marginLeft: 6 }}>
                    <Text style={styles.inputLabel}>DO GODZINY</Text>
                    <TextInput
                      style={styles.modalInput}
                      value={editEnd}
                      onChangeText={setEditEnd}
                      placeholder="15:30"
                      placeholderTextColor="#64748B"
                    />
                  </View>

                  <View style={{ flex: 0.8, marginLeft: 6 }}>
                    <Text style={styles.inputLabel}>PRZERWA</Text>
                    <TextInput
                      style={styles.modalInput}
                      value={editBreak}
                      onChangeText={setEditBreak}
                      keyboardType="numeric"
                      placeholder="30"
                      placeholderTextColor="#64748B"
                    />
                  </View>
                </View>

                <Text style={styles.calcHoursText}>
                  ⏱️ Obliczone godziny: <Text style={{ color: '#38BDF8', fontWeight: '800' }}>{calculateHours(editStart, editEnd, editBreak)} h</Text>
                </Text>
              </View>
            )}

            <Text style={[styles.inputLabel, { marginTop: 10 }]}>NOTATKI / OPIS</Text>
            <TextInput
              style={[styles.modalInput, { height: 54 }]}
              value={editNotes}
              onChangeText={setEditNotes}
              placeholder="np. Prace na obiekcie Segro Halle 2..."
              placeholderTextColor="#64748B"
              multiline
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={handleDeleteEntry}
                disabled={isSaving}
              >
                <Text style={styles.deleteBtnText}>Usuń</Text>
              </TouchableOpacity>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setShowEditModal(false)}
                >
                  <Text style={styles.cancelBtnText}>Anuluj</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.saveBtn}
                  onPress={handleSaveEntry}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <ActivityIndicator color="#0F172A" />
                  ) : (
                    <Text style={styles.saveBtnText}>💾 Zapisz</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL: ADD WORKER */}
      <Modal
        visible={showAddWorkerModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddWorkerModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalHeading}>➕ Dodaj Nowego Pracownika</Text>

            <Text style={styles.inputLabel}>IMIĘ I NAZWISKO *</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="np. Piotr Kowalski (Elektryk)"
              placeholderTextColor="#64748B"
              value={newWorkerName}
              onChangeText={setNewWorkerName}
            />

            <View style={[styles.modalActions, { justifyContent: 'flex-end' }]}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setShowAddWorkerModal(false)}
              >
                <Text style={styles.cancelBtnText}>Anuluj</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleAddWorker}
              >
                <Text style={styles.saveBtnText}>Dodaj pracownika</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#030712',
  },
  headerAddBtn: {
    backgroundColor: '#38BDF8',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    marginRight: 8,
  },
  headerAddBtnText: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '800',
  },
  monthBar: {
    backgroundColor: '#0B0F19',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  monthScroll: {
    flexDirection: 'row',
  },
  monthChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#1E293B',
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  monthChipActive: {
    backgroundColor: '#38BDF8',
    borderColor: '#38BDF8',
  },
  monthChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#94A3B8',
  },
  monthChipTextActive: {
    color: '#0F172A',
  },
  subHeader: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#0F172A',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    gap: 8,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
  },
  searchWorkerInput: {
    backgroundColor: '#1E293B',
    color: '#F8FAFC',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  gridContainer: {
    flex: 1,
    backgroundColor: '#030712',
  },
  table: {
    flexDirection: 'column',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#0B0F19',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  workerColHeader: {
    width: 170,
    paddingHorizontal: 10,
    paddingVertical: 8,
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#1E293B',
    backgroundColor: '#0B0F19',
  },
  workerColHeaderText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#38BDF8',
    letterSpacing: 0.5,
  },
  workerColHeaderSub: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2,
  },
  dayHeaderCell: {
    width: 38,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#1E293B',
  },
  daySunHeader: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  daySatHeader: {
    backgroundColor: 'rgba(71, 85, 105, 0.25)',
  },
  dayHeaderText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  dayHeaderWeekday: {
    fontSize: 8,
    color: '#64748B',
    fontWeight: '700',
    marginTop: 1,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    height: 48,
  },
  workerCell: {
    width: 170,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    borderRightWidth: 1,
    borderRightColor: '#1E293B',
    backgroundColor: '#0B0F19',
    gap: 8,
  },
  workerAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  workerAvatarText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '800',
  },
  workerName: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700',
  },
  workerStats: {
    color: '#64748B',
    fontSize: 9,
    marginTop: 1,
  },
  dayCell: {
    width: 38,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#1E293B',
  },
  dayCellText: {
    fontSize: 10,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  modalHeading: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  modalSubheading: {
    fontSize: 12,
    color: '#38BDF8',
    fontWeight: '700',
    marginTop: 2,
    marginBottom: 12,
  },
  modalStatusRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  modalStatusBtn: {
    flex: 1,
    backgroundColor: '#1E293B',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalStatusBtnActivePresent: {
    backgroundColor: 'rgba(34, 197, 94, 0.18)',
    borderColor: '#22C55E',
  },
  modalStatusBtnActiveVacation: {
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
    borderColor: '#F59E0B',
  },
  modalStatusBtnActiveAbsent: {
    backgroundColor: 'rgba(239, 68, 68, 0.18)',
    borderColor: '#EF4444',
  },
  modalStatusBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },
  timeInputsRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    marginBottom: 4,
  },
  modalInput: {
    backgroundColor: '#1E293B',
    color: '#F8FAFC',
    borderRadius: 8,
    padding: 8,
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#334155',
  },
  calcHoursText: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
  },
  deleteBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  deleteBtnText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '700',
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  cancelBtnText: {
    color: '#94A3B8',
    fontWeight: '700',
    fontSize: 12,
  },
  saveBtn: {
    backgroundColor: '#38BDF8',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  saveBtnText: {
    color: '#0F172A',
    fontWeight: '800',
    fontSize: 12,
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
});
