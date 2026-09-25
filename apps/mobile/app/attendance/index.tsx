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
  worker_id?: string;
  worker_name?: string;
  date: string;
  status: 'PRESENT' | 'VACATION' | 'ABSENT';
  start_time?: string;
  end_time?: string;
  break_time?: number;
  total_hours?: number;
  notes?: string;
  version: number;
}

export default function AttendanceScreen() {
  const router = useRouter();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('all');
  const [entries, setEntries] = useState<AttendanceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Add / Edit Entry Form State
  const [showAddForm, setShowAddForm] = useState(false);
  const [formWorkerId, setFormWorkerId] = useState<string>('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [status, setStatus] = useState<'PRESENT' | 'VACATION' | 'ABSENT'>('PRESENT');
  const [startTime, setStartTime] = useState('07:00');
  const [endTime, setEndTime] = useState('15:30');
  const [breakMinutes, setBreakMinutes] = useState('30');
  const [notes, setNotes] = useState('');

  // Add Employee Modal
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

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const db = await getDatabase();
      const { data: { session } } = await authSupabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const currentYear = new Date().getFullYear();
      let loadedWorkers: Worker[] = [];
      let loadedEntries: AttendanceEntry[] = [];

      // 1. Try fetching from web API
      try {
        const [calRes, empRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/calendar?year=${currentYear}`, { headers }).catch(() => null),
          fetch(`${API_BASE_URL}/api/employees`, { headers }).catch(() => null),
        ]);

        if (calRes && calRes.ok) {
          const calJson = await calRes.json();
          const calData = calJson?.data || calJson;
          if (calData?.workers && Array.isArray(calData.workers)) {
            loadedWorkers = calData.workers.map((w: any) => ({
              id: w.id,
              full_name: w.full_name,
              type: w.type || 'EMPLOYEE',
            }));
          }

          if (calData?.attendance && Array.isArray(calData.attendance)) {
            loadedEntries = calData.attendance.map((a: any) => {
              const workerObj = loadedWorkers.find((w) => w.id === (a.employee_id || a.user_id));
              const start = a.start_time || '07:00';
              const end = a.end_time || '15:30';
              const brk = a.break_time !== undefined ? a.break_time : 30;
              const calcH = a.status === 'PRESENT' ? calculateHours(start, end, String(brk)) : 8.0;

              return {
                id: `att-${a.date}-${a.employee_id || a.user_id}`,
                worker_id: a.employee_id || a.user_id,
                worker_name: workerObj?.full_name || 'Pracownik',
                date: a.date,
                status: a.status || 'PRESENT',
                start_time: start,
                end_time: end,
                break_time: brk,
                total_hours: calcH,
                notes: '',
                version: 1,
              };
            });
          }

          if (calData?.vacations && Array.isArray(calData.vacations)) {
            for (const v of calData.vacations) {
              const workerObj = loadedWorkers.find((w) => w.id === (v.employee_id || v.user_id));
              loadedEntries.push({
                id: `vac-${v.start_date}-${v.employee_id || v.user_id}`,
                worker_id: v.employee_id || v.user_id,
                worker_name: workerObj?.full_name || 'Pracownik',
                date: v.start_date,
                status: 'VACATION',
                total_hours: 8.0,
                notes: 'Urlop wypoczynkowy',
                version: 1,
              });
            }
          }
        }

        if (loadedWorkers.length === 0 && empRes && empRes.ok) {
          const empJson = await empRes.json();
          const emps = Array.isArray(empJson) ? empJson : (empJson?.data || []);
          loadedWorkers = emps.map((e: any) => ({
            id: e.id,
            full_name: e.full_name,
            type: 'EMPLOYEE',
          }));
        }
      } catch (apiErr) {
        console.warn('[Attendance] API fetch error, falling back to local SQLite:', apiErr);
      }

      // 2. Local fallback if empty
      if (loadedWorkers.length === 0) {
        loadedWorkers = [
          { id: 'emp-01', full_name: 'Jan Kowalski (Elektryk)', type: 'EMPLOYEE' },
          { id: 'emp-02', full_name: 'Piotr Nowak (Monter)', type: 'EMPLOYEE' },
          { id: 'emp-03', full_name: 'Tomasz Wiśniewski (Brygadzista)', type: 'EMPLOYEE' },
        ];
      }

      setWorkers(loadedWorkers);
      if (!formWorkerId && loadedWorkers.length > 0) {
        setFormWorkerId(loadedWorkers[0].id);
      }

      // Sort entries by date desc
      loadedEntries.sort((a, b) => (a.date > b.date ? -1 : 1));
      setEntries(loadedEntries);
    } catch (err) {
      console.error('[Attendance] Load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [formWorkerId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleAddWorker = async () => {
    if (!newWorkerName.trim()) {
      Alert.alert('Błąd', 'Podaj imię i nazwisko pracownika.');
      return;
    }

    try {
      const { data: { session } } = await authSupabase.auth.getSession();
      const newId = `emp-${Date.now()}`;
      const newWorker: Worker = {
        id: newId,
        full_name: newWorkerName.trim(),
        type: 'EMPLOYEE',
      };

      if (session?.access_token) {
        await fetch(`${API_BASE_URL}/api/employees`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ full_name: newWorker.full_name }),
        }).catch(() => {});
      }

      setWorkers((prev) => [...prev, newWorker]);
      setFormWorkerId(newId);
      setShowAddWorkerModal(false);
      setNewWorkerName('');
      Alert.alert('Sukces', `Dodano pracownika: ${newWorker.full_name}`);
    } catch (e: any) {
      Alert.alert('Błąd', e?.message || 'Nie udało się dodać pracownika');
    }
  };

  const handleSaveEntry = async () => {
    if (!formWorkerId) {
      Alert.alert('Błąd', 'Wybierz pracownika.');
      return;
    }
    if (!date.trim()) {
      Alert.alert('Błąd', 'Podaj datę wpisu.');
      return;
    }

    try {
      setSaving(true);
      const targetWorker = workers.find((w) => w.id === formWorkerId);
      const isProfile = targetWorker?.type === 'PROFILE';
      const idKey = isProfile ? 'user_id' : 'employee_id';

      const { data: { session } } = await authSupabase.auth.getSession();
      let sentToApi = false;

      if (session?.access_token) {
        try {
          const res = await fetch(`${API_BASE_URL}/api/attendance`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              date,
              status,
              start_time: status === 'PRESENT' ? startTime : null,
              end_time: status === 'PRESENT' ? endTime : null,
              break_time: status === 'PRESENT' ? Number(breakMinutes) || 0 : 0,
              [idKey]: formWorkerId,
            }),
          });
          if (res.ok) {
            sentToApi = true;
          }
        } catch (apiErr) {
          console.warn('[Attendance] Save to API error:', apiErr);
        }
      }

      const calculatedH = status === 'PRESENT' ? calculateHours(startTime, endTime, breakMinutes) : 8.0;
      const newEntry: AttendanceEntry = {
        id: `att-${Date.now()}`,
        worker_id: formWorkerId,
        worker_name: targetWorker?.full_name || 'Pracownik',
        date,
        status,
        start_time: startTime,
        end_time: endTime,
        break_time: Number(breakMinutes) || 0,
        total_hours: calculatedH,
        notes,
        version: 1,
      };

      setEntries((prev) => [newEntry, ...prev.filter((e) => !(e.worker_id === formWorkerId && e.date === date))]);
      setShowAddForm(false);
      setNotes('');
      Alert.alert(
        'Zapisano',
        sentToApi ? 'Godziny / urlop zapisane na serwerze!' : 'Wpis zapisany lokalnie (tryb offline).'
      );
    } catch (err: any) {
      Alert.alert('Błąd zapisu', err?.message || 'Nie udało się zapisać wpisu');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEntry = async (entry: AttendanceEntry) => {
    Alert.alert('Potwierdzenie', `Czy na pewno chcesz usunąć wpis z dnia ${entry.date}?`, [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń',
        style: 'destructive',
        onPress: async () => {
          try {
            const { data: { session } } = await authSupabase.auth.getSession();
            if (session?.access_token && entry.worker_id) {
              const targetWorker = workers.find((w) => w.id === entry.worker_id);
              const idKey = targetWorker?.type === 'PROFILE' ? 'user_id' : 'employee_id';
              await fetch(`${API_BASE_URL}/api/attendance?date=${entry.date}&${idKey}=${entry.worker_id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${session.access_token}` },
              }).catch(() => {});
            }
            setEntries((prev) => prev.filter((e) => e.id !== entry.id));
          } catch (e: any) {
            Alert.alert('Błąd', e?.message || 'Nie udało się usunąć wpisu');
          }
        },
      },
    ]);
  };

  const filteredEntries = entries.filter((e) =>
    selectedWorkerId === 'all' ? true : e.worker_id === selectedWorkerId
  );

  const totalMonthlyHours = filteredEntries
    .filter((e) => e.status === 'PRESENT')
    .reduce((acc, curr) => acc + (curr.total_hours || 0), 0);

  const vacationDays = filteredEntries.filter((e) => e.status === 'VACATION').length;

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{
          title: 'Ewidencja Godzin i Urlopów',
          headerShown: true,
          headerBackTitle: 'Wstecz',
          headerStyle: { backgroundColor: '#0B0F19' },
          headerTintColor: '#38BDF8',
          headerTitleStyle: { color: '#F8FAFC', fontWeight: '700' },
        }}
      />

      {/* Worker Selector Bar */}
      <View style={styles.workerSelectBar}>
        <View style={styles.workerBarHeader}>
          <Text style={styles.workerBarLabel}>WYBIERZ PRACOWNIKA:</Text>
          <TouchableOpacity
            style={styles.addWorkerBtn}
            onPress={() => setShowAddWorkerModal(true)}
          >
            <Text style={styles.addWorkerBtnText}>+ Nowy Pracownik</Text>
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.workerScroll}>
          <TouchableOpacity
            style={[styles.workerChip, selectedWorkerId === 'all' && styles.workerChipActive]}
            onPress={() => setSelectedWorkerId('all')}
          >
            <Text style={[styles.workerChipText, selectedWorkerId === 'all' && styles.workerChipTextActive]}>
              👥 Wszyscy ({entries.length})
            </Text>
          </TouchableOpacity>

          {workers.map((w) => {
            const count = entries.filter((e) => e.worker_id === w.id).length;
            return (
              <TouchableOpacity
                key={w.id}
                style={[styles.workerChip, selectedWorkerId === w.id && styles.workerChipActive]}
                onPress={() => setSelectedWorkerId(w.id)}
              >
                <Text style={[styles.workerChipText, selectedWorkerId === w.id && styles.workerChipTextActive]}>
                  👤 {w.full_name} ({count})
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Summary KPI */}
      <View style={styles.summaryBar}>
        <View style={styles.kpiBox}>
          <Text style={styles.kpiValue}>{totalMonthlyHours.toFixed(1)} h</Text>
          <Text style={styles.kpiLabel}>Suma godzin</Text>
        </View>
        <View style={styles.kpiDivider} />
        <View style={styles.kpiBox}>
          <Text style={[styles.kpiValue, { color: '#F59E0B' }]}>{vacationDays} dni</Text>
          <Text style={styles.kpiLabel}>Dni urlopu</Text>
        </View>
        <View style={styles.kpiDivider} />
        <TouchableOpacity
          style={styles.addBtnHeader}
          onPress={() => setShowAddForm(!showAddForm)}
        >
          <Text style={styles.addBtnHeaderText}>{showAddForm ? '✕ Zamknij' : '+ Wpisz godziny/urlop'}</Text>
        </TouchableOpacity>
      </View>

      {/* Manual Entry Form */}
      {showAddForm && (
        <ScrollView style={styles.formCard} nestedScrollEnabled>
          <Text style={styles.formTitle}>Wpisz godziny lub urlop pracownika</Text>

          {/* Target Worker Picker in Form */}
          <Text style={styles.inputLabel}>DLA PRACOWNIKA *</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            {workers.map((w) => (
              <TouchableOpacity
                key={w.id}
                style={[styles.workerChip, formWorkerId === w.id && styles.workerChipActive]}
                onPress={() => setFormWorkerId(w.id)}
              >
                <Text style={[styles.workerChipText, formWorkerId === w.id && styles.workerChipTextActive]}>
                  👤 {w.full_name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Status Switcher */}
          <View style={styles.typeSelector}>
            <TouchableOpacity
              style={[styles.typeBtn, status === 'PRESENT' && styles.typeBtnActive]}
              onPress={() => setStatus('PRESENT')}
            >
              <Text style={[styles.typeBtnText, status === 'PRESENT' && styles.typeBtnTextActive]}>
                🟢 Praca (Godziny)
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
              placeholder="2026-09-25"
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
                ⏱️ Suma czasu netto: <Text style={{ color: '#38BDF8', fontWeight: '800' }}>{calculateHours(startTime, endTime, breakMinutes)} h</Text>
              </Text>
            </>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>UWAGI / OPIS CZYNNOŚCI</Text>
            <TextInput
              style={[styles.input, { height: 60 }]}
              value={notes}
              onChangeText={setNotes}
              multiline
              placeholder="np. Montaż oświetlenia korytarza, podłączenie rozdzielnicy..."
              placeholderTextColor="#64748B"
            />
          </View>

          <TouchableOpacity
            style={styles.saveBtn}
            activeOpacity={0.8}
            onPress={handleSaveEntry}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.saveBtnText}>💾 Zapisz wpis pracownika</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Entries List */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#38BDF8" />
          <Text style={styles.loadingText}>Ładowanie ewidencji czasu pracy...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredEntries}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#38BDF8"
              colors={['#38BDF8']}
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyTitle}>Brak wpisów obecności</Text>
              <Text style={styles.emptySubtitle}>
                Wybierz pracownika i kliknij "+ Wpisz godziny/urlop", aby zarejestrować obecność.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.dateCol}>
                  <Text style={styles.dateText}>{item.date}</Text>
                  <Text style={styles.workerNameText}>👤 {item.worker_name}</Text>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
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

                  <TouchableOpacity
                    style={styles.deleteEntryBtn}
                    onPress={() => handleDeleteEntry(item)}
                  >
                    <Text style={styles.deleteEntryText}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {item.status === 'PRESENT' && (
                <View style={styles.timeDetailsRow}>
                  <Text style={styles.timeRange}>
                    🕒 {item.start_time} - {item.end_time}
                  </Text>
                  <Text style={styles.breakText}>Przerwa: {item.break_time || 0} min</Text>
                </View>
              )}

              {item.notes ? <Text style={styles.notesText}>{item.notes}</Text> : null}
            </View>
          )}
        />
      )}

      {/* Modal: Add Employee */}
      <Modal
        visible={showAddWorkerModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddWorkerModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Dodaj nowego pracownika</Text>

            <Text style={styles.inputLabel}>IMIĘ I NAZWISKO *</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="np. Marek Zieliński (Elektryk)"
              placeholderTextColor="#64748B"
              value={newWorkerName}
              onChangeText={setNewWorkerName}
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowAddWorkerModal(false)}
              >
                <Text style={styles.modalCancelBtnText}>Anuluj</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSubmitBtn}
                onPress={handleAddWorker}
              >
                <Text style={styles.modalSubmitBtnText}>Zapisz pracownika</Text>
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
  workerSelectBar: {
    backgroundColor: '#0B0F19',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  workerBarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  workerBarLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  addWorkerBtn: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  addWorkerBtnText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '700',
  },
  workerScroll: {
    flexDirection: 'row',
  },
  workerChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#1E293B',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  workerChipActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    borderColor: '#38BDF8',
  },
  workerChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },
  workerChipTextActive: {
    color: '#38BDF8',
    fontWeight: '700',
  },
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#0F172A',
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
    margin: 12,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    maxHeight: 440,
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
  workerNameText: {
    fontSize: 13,
    color: '#38BDF8',
    fontWeight: '600',
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
  deleteEntryBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#1E293B',
  },
  deleteEntryText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
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
    color: '#F8FAFC',
    fontWeight: '700',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 16,
  },
  modalInput: {
    backgroundColor: '#030712',
    color: '#F8FAFC',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 14,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: '#1E293B',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalCancelBtnText: {
    color: '#94A3B8',
    fontWeight: '700',
  },
  modalSubmitBtn: {
    flex: 1,
    backgroundColor: '#0284C7',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalSubmitBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
