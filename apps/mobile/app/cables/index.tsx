import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
  RefreshControl,
  Modal,
  TextInput,
} from 'react-native';
import { useRouter, Stack, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDatabase } from '../../src/db/database';
import { authSupabase } from '../../src/auth/authClient';

interface TrommelRow {
  id: string;
  name: string;
  cable_type: string;
  initial_length: number;
  remaining_length: number;
}

interface CableRow {
  id: string;
  plan_id: string;
  trommel_id?: string | null;
  cable_number: string;
  cable_type: string;
  length: number;
  status: 'planned' | 'drawn' | 'measured' | 'connected';
  version: number;
}

interface PlanOption {
  id: string;
  name: string;
}

export default function CablesScreen() {
  const router = useRouter();
  const { projectId } = useLocalSearchParams<{ projectId?: string }>();
  const [activeTab, setActiveTab] = useState<'cables' | 'trommels'>('cables');
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('all');
  const [trommels, setTrommels] = useState<TrommelRow[]>([]);
  const [cables, setCables] = useState<CableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Selected Cable Modal / Detail
  const [selectedCable, setSelectedCable] = useState<CableRow | null>(null);
  const [editLength, setEditLength] = useState<string>('');
  const [selectedTrommelId, setSelectedTrommelId] = useState<string>('');

  // Add Drum Modal
  const [addDrumModalVisible, setAddDrumModalVisible] = useState(false);
  const [newDrumName, setNewDrumName] = useState('');
  const [newDrumType, setNewDrumType] = useState('NYM-J 3x1.5');
  const [newDrumLength, setNewDrumLength] = useState('500');

  const syncCablesFromApi = async (db: any) => {
    try {
      const { data: { session } } = await authSupabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const planRows = (await db.getAllAsync(
        "SELECT id, name FROM plans WHERE deleted_at IS NULL AND id != 'pln-sample-001' ORDER BY name ASC;"
      )) as PlanOption[];
      setPlans(planRows);
      if (planRows.length > 0 && selectedPlanId === 'all') {
        setSelectedPlanId(planRows[0].id);
      }
    } catch (e) {
      console.warn('[Cables] Sync error:', e);
    }
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const db = await getDatabase();
      await syncCablesFromApi(db);

      const trommelRows = await db.getAllAsync<TrommelRow>(
        'SELECT * FROM trommels WHERE deleted_at IS NULL ORDER BY name ASC;'
      );
      setTrommels(trommelRows || []);

      const cableFilter = selectedPlanId !== 'all' ? `AND plan_id = '${selectedPlanId}'` : '';
      const cableRows = await db.getAllAsync<CableRow>(
        `SELECT * FROM cables WHERE deleted_at IS NULL ${cableFilter} ORDER BY cable_number ASC;`
      );
      setCables(cableRows || []);
    } catch (err) {
      console.error('[CablesScreen] Error loading cables & trommels:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedPlanId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const openPlanMap = (planIdToOpen?: string) => {
    const targetId = (planIdToOpen && planIdToOpen !== 'all') ? planIdToOpen : (plans[0]?.id || selectedPlanId);
    if (targetId && targetId !== 'all') {
      router.push({ pathname: '/plans/[id]', params: { id: targetId } } as any);
    } else {
      router.push('/plans' as any);
    }
  };

  const openCableDetail = (cable: CableRow) => {
    setSelectedCable(cable);
    setEditLength(String(cable.length || 0));
    setSelectedTrommelId(cable.trommel_id || '');
  };

  const handleSaveCableDetail = async () => {
    if (!selectedCable) return;
    try {
      const db = await getDatabase();
      const nextVersion = selectedCable.version + 1;
      const numLength = Number(editLength) || selectedCable.length;
      const targetTrommel = selectedTrommelId || null;
      const now = new Date().toISOString();

      await db.runAsync(
        'UPDATE cables SET length = ?, trommel_id = ?, version = ?, updated_at = ? WHERE id = ?;',
        [numLength, targetTrommel, nextVersion, now, selectedCable.id]
      );

      await db.runAsync(`
        INSERT INTO mutations (
          mutation_id, entity_type, entity_id, operation, base_version, payload, status, attempts, created_at, updated_at
        ) VALUES (?, 'cables', ?, 'UPDATE', ?, ?, 'PENDING', 0, ?, ?);
      `, [
        `mut-${Date.now()}-${selectedCable.id}`,
        selectedCable.id,
        selectedCable.version,
        JSON.stringify({
          length: numLength,
          trommel_id: targetTrommel,
          updated_at: now,
        }),
        now,
        now,
      ]);

      setCables((prev) =>
        prev.map((c) =>
          c.id === selectedCable.id
            ? { ...c, length: numLength, trommel_id: targetTrommel, version: nextVersion }
            : c
        )
      );

      setSelectedCable(null);
      Alert.alert('Zapisano', 'Parametry kabla i przypisanie do bębna zostały zaktualizowane.');
    } catch (err: any) {
      Alert.alert('Błąd', err?.message || 'Nie udało się zaktualizować kabla');
    }
  };

  const toggleCableStatus = async (cable: CableRow) => {
    const nextStatus: CableRow['status'] =
      cable.status === 'planned'
        ? 'drawn'
        : cable.status === 'drawn'
        ? 'measured'
        : cable.status === 'measured'
        ? 'connected'
        : 'planned';

    try {
      const db = await getDatabase();
      const nextVersion = cable.version + 1;
      const now = new Date().toISOString();

      await db.runAsync(
        'UPDATE cables SET status = ?, version = ?, updated_at = ? WHERE id = ?;',
        [nextStatus, nextVersion, now, cable.id]
      );

      await db.runAsync(`
        INSERT INTO mutations (
          mutation_id, entity_type, entity_id, operation, base_version, payload, status, attempts, created_at, updated_at
        ) VALUES (?, 'cables', ?, 'UPDATE', ?, ?, 'PENDING', 0, ?, ?);
      `, [
        `mut-${Date.now()}-${cable.id}`,
        cable.id,
        cable.version,
        JSON.stringify({ status: nextStatus, updated_at: now }),
        now,
        now,
      ]);

      setCables((prev) =>
        prev.map((c) => (c.id === cable.id ? { ...c, status: nextStatus, version: nextVersion } : c))
      );
    } catch (err: any) {
      Alert.alert('Błąd', err?.message || 'Nie udało się zaktualizować statusu kabla');
    }
  };

  const handleCreateDrum = async () => {
    if (!newDrumName.trim()) {
      Alert.alert('Wymagana nazwa', 'Wprowadź oznaczenie nowego bębna.');
      return;
    }

    try {
      const db = await getDatabase();
      const drumId = `trm-${Date.now()}`;
      const len = Number(newDrumLength) || 500;
      const now = new Date().toISOString();

      await db.runAsync(`
        INSERT INTO trommels (id, name, cable_type, initial_length, remaining_length, created_at, updated_at, version)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1);
      `, [drumId, newDrumName.trim(), newDrumType.trim(), len, len, now, now]);

      await db.runAsync(`
        INSERT INTO mutations (
          mutation_id, entity_type, entity_id, operation, base_version, payload, status, attempts, created_at, updated_at
        ) VALUES (?, 'trommels', ?, 'INSERT', 0, ?, 'PENDING', 0, ?, ?);
      `, [
        `mut-${Date.now()}-${drumId}`,
        drumId,
        JSON.stringify({
          name: newDrumName.trim(),
          cable_type: newDrumType.trim(),
          initial_length: len,
          remaining_length: len,
          created_at: now,
        }),
        now,
        now,
      ]);

      setTrommels((prev) => [
        ...prev,
        { id: drumId, name: newDrumName.trim(), cable_type: newDrumType.trim(), initial_length: len, remaining_length: len },
      ]);

      setAddDrumModalVisible(false);
      setNewDrumName('');
      Alert.alert('Sukces', 'Nowy bęben kablowy został dodany.');
    } catch (err: any) {
      Alert.alert('Błąd', err?.message || 'Nie udało się dodać bębna.');
    }
  };

  const getCableBadge = (status: CableRow['status']) => {
    switch (status) {
      case 'connected':
        return { label: 'PODŁĄCZONY', bg: 'rgba(34, 197, 94, 0.15)', text: '#22C55E' };
      case 'measured':
        return { label: 'ZMIERZONY', bg: 'rgba(56, 189, 248, 0.15)', text: '#38BDF8' };
      case 'drawn':
        return { label: 'WCIĄGNIĘTY', bg: 'rgba(234, 179, 8, 0.15)', text: '#EAB308' };
      default:
        return { label: 'PLANOWANY', bg: 'rgba(148, 163, 184, 0.15)', text: '#94A3B8' };
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{
          title: 'Kable & Bębny',
          headerShown: true,
          headerBackTitle: 'Wstecz',
          headerStyle: { backgroundColor: '#0B0F19' },
          headerTintColor: '#38BDF8',
          headerTitleStyle: { color: '#F8FAFC', fontWeight: '700' },
        }}
      />

      {/* Top Map Action Banner */}
      <View style={styles.topControlSection}>
        {plans.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.planScroll}>
            <TouchableOpacity
              style={[styles.planChip, selectedPlanId === 'all' && styles.planChipActive]}
              onPress={() => setSelectedPlanId('all')}
            >
              <Text style={[styles.planChipText, selectedPlanId === 'all' && styles.planChipTextActive]}>
                Wszystkie plany
              </Text>
            </TouchableOpacity>
            {plans.map((pl) => (
              <TouchableOpacity
                key={pl.id}
                style={[styles.planChip, selectedPlanId === pl.id && styles.planChipActive]}
                onPress={() => setSelectedPlanId(pl.id)}
              >
                <Text style={[styles.planChipText, selectedPlanId === pl.id && styles.planChipTextActive]}>
                  📐 {pl.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        <TouchableOpacity
          style={styles.openMapBanner}
          activeOpacity={0.8}
          onPress={() => openPlanMap(selectedPlanId)}
        >
          <Text style={styles.mapBannerIcon}>🗺️</Text>
          <View style={styles.mapBannerTextCol}>
            <Text style={styles.mapBannerTitle}>Otwórz trasę na rzucie PDF</Text>
            <Text style={styles.mapBannerSubtitle}>
              Przeglądaj trasy kablowe, punkty wejścia/wyjścia i bębny
            </Text>
          </View>
          <Text style={styles.mapBannerArrow}>➔</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'cables' && styles.tabActive]}
          onPress={() => setActiveTab('cables')}
        >
          <Text style={[styles.tabText, activeTab === 'cables' && styles.tabTextActive]}>
            🔌 Kable ({cables.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'trommels' && styles.tabActive]}
          onPress={() => setActiveTab('trommels')}
        >
          <Text style={[styles.tabText, activeTab === 'trommels' && styles.tabTextActive]}>
            🎯 Bębny / Trommle ({trommels.length})
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#38BDF8" />
          <Text style={styles.loadingText}>Ładowanie kabli i bębnów...</Text>
        </View>
      ) : activeTab === 'cables' ? (
        <FlatList
          data={cables}
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
              <Text style={styles.emptyTitle}>Brak kabli</Text>
              <Text style={styles.emptySubtitle}>Brak zarejestrowanych tras kablowych dla tego planu.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const badge = getCableBadge(item.status);
            const assignedTrommel = trommels.find((t) => t.id === item.trommel_id);
            return (
              <TouchableOpacity
                style={styles.card}
                activeOpacity={0.8}
                onPress={() => openCableDetail(item)}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{item.cable_number}</Text>
                  <TouchableOpacity
                    style={[styles.statusBadge, { backgroundColor: badge.bg }]}
                    onPress={() => toggleCableStatus(item)}
                  >
                    <Text style={[styles.statusText, { color: badge.text }]}>{badge.label}</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.cardDesc}>{item.cable_type}</Text>

                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>
                    Długość: <Text style={styles.metaValue}>{item.length} m</Text>
                  </Text>
                  {assignedTrommel ? (
                    <Text style={styles.drumTag}>🎯 {assignedTrommel.name}</Text>
                  ) : (
                    <Text style={styles.drumTagEmpty}>Brak przypisanego bębna</Text>
                  )}
                </View>

                <View style={styles.cardFooterRow}>
                  <Text style={styles.tapToEdit}>Kliknij, aby edytować parametry</Text>
                  <TouchableOpacity onPress={() => openPlanMap(item.plan_id)}>
                    <Text style={styles.viewOnMapText}>Pokaż na rzucie ➔</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      ) : (
        <View style={{ flex: 1 }}>
          <View style={styles.addDrumHeaderBar}>
            <TouchableOpacity
              style={styles.addDrumBtn}
              onPress={() => setAddDrumModalVisible(true)}
            >
              <Text style={styles.addDrumBtnText}>+ Dodaj nowy bęben do magazynu</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={trommels}
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
                <Text style={styles.emptyTitle}>Brak bębnów</Text>
                <Text style={styles.emptySubtitle}>Brak zarejestrowanych bębnów kablowych w magazynie.</Text>
              </View>
            }
            renderItem={({ item }) => {
              const percentRemaining = Math.round((item.remaining_length / (item.initial_length || 1)) * 100);
              return (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>{item.name}</Text>
                  <Text style={styles.cardDesc}>{item.cable_type}</Text>

                  <View style={styles.progressSection}>
                    <View style={styles.progressHeader}>
                      <Text style={styles.progressLabel}>Pozostało na bębnie</Text>
                      <Text style={styles.progressValue}>
                        {item.remaining_length} / {item.initial_length} m ({percentRemaining}%)
                      </Text>
                    </View>
                    <View style={styles.progressBarTrack}>
                      <View
                        style={[
                          styles.progressBarFill,
                          { width: `${Math.min(100, Math.max(0, percentRemaining))}%` },
                        ]}
                      />
                    </View>
                  </View>
                </View>
              );
            }}
          />
        </View>
      )}

      {/* Cable Detail Modal */}
      <Modal visible={!!selectedCable} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Szczegóły Kabla: {selectedCable?.cable_number}</Text>
            <Text style={styles.modalSubtitle}>Typ: {selectedCable?.cable_type}</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>DŁUGOŚĆ ZMIERZONA / PRZECIĄGNIĘTA (M)</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                value={editLength}
                onChangeText={setEditLength}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>PRZYPISANY BĘBEN (TROMMEL)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.trommelsScroll}>
                <TouchableOpacity
                  style={[
                    styles.trommelChip,
                    !selectedTrommelId && styles.trommelChipActive,
                  ]}
                  onPress={() => setSelectedTrommelId('')}
                >
                  <Text style={[styles.trommelChipText, !selectedTrommelId && styles.trommelChipTextActive]}>
                    Brak bębna
                  </Text>
                </TouchableOpacity>
                {trommels.map((tr) => {
                  const isSel = selectedTrommelId === tr.id;
                  return (
                    <TouchableOpacity
                      key={tr.id}
                      style={[styles.trommelChip, isSel && styles.trommelChipActive]}
                      onPress={() => setSelectedTrommelId(tr.id)}
                    >
                      <Text style={[styles.trommelChipText, isSel && styles.trommelChipTextActive]}>
                        🎯 {tr.name} ({tr.remaining_length}m)
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setSelectedCable(null)}
              >
                <Text style={styles.modalCancelText}>Anuluj</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={handleSaveCableDetail}
              >
                <Text style={styles.modalSaveText}>Zapisz zmiany</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Drum Modal */}
      <Modal visible={addDrumModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Dodaj Nowy Bęben Kablowy</Text>
            <Text style={styles.modalSubtitle}>Wprowadź oznaczenie i długość początkową</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>NUMER / NAZWA BĘBNA *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="np. T-101 / Bęben 01"
                placeholderTextColor="#64748B"
                value={newDrumName}
                onChangeText={setNewDrumName}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>TYP KABLA</Text>
              <TextInput
                style={styles.textInput}
                placeholder="np. NYM-J 3x1.5 / JE-H(St)H E30"
                placeholderTextColor="#64748B"
                value={newDrumType}
                onChangeText={setNewDrumType}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>DŁUGOŚĆ POCZĄTKOWA (METRY)</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                placeholder="500"
                placeholderTextColor="#64748B"
                value={newDrumLength}
                onChangeText={setNewDrumLength}
              />
            </View>

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setAddDrumModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Anuluj</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={handleCreateDrum}
              >
                <Text style={styles.modalSaveText}>Dodaj bęben</Text>
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
  topControlSection: {
    backgroundColor: '#0B0F19',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  planScroll: {
    marginBottom: 10,
  },
  planChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#1E293B',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  planChipActive: {
    backgroundColor: '#0284C7',
    borderColor: '#38BDF8',
  },
  planChipText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  planChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  openMapBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(2, 132, 199, 0.15)',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#0284C7',
  },
  mapBannerIcon: {
    fontSize: 22,
    marginRight: 10,
  },
  mapBannerTextCol: {
    flex: 1,
  },
  mapBannerTitle: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  mapBannerSubtitle: {
    color: '#94A3B8',
    fontSize: 10,
  },
  mapBannerArrow: {
    color: '#38BDF8',
    fontSize: 16,
    fontWeight: '900',
    marginLeft: 8,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#0B0F19',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#38BDF8',
  },
  tabText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#38BDF8',
    fontWeight: '800',
  },
  list: {
    padding: 16,
    paddingBottom: 30,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  loadingText: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 10,
  },
  emptyTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptySubtitle: {
    color: '#64748B',
    fontSize: 13,
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
  },
  cardDesc: {
    color: '#94A3B8',
    fontSize: 13,
    marginBottom: 10,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingTop: 10,
    marginBottom: 8,
  },
  metaLabel: {
    color: '#64748B',
    fontSize: 12,
  },
  metaValue: {
    color: '#F8FAFC',
    fontWeight: '700',
  },
  drumTag: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '700',
  },
  drumTagEmpty: {
    color: '#64748B',
    fontSize: 11,
    fontStyle: 'italic',
  },
  cardFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tapToEdit: {
    color: '#64748B',
    fontSize: 10,
  },
  viewOnMapText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '700',
  },
  addDrumHeaderBar: {
    padding: 12,
    backgroundColor: '#0B0F19',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  addDrumBtn: {
    backgroundColor: '#0284C7',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  addDrumBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  progressSection: {
    marginTop: 6,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressLabel: {
    color: '#64748B',
    fontSize: 11,
  },
  progressValue: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '700',
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: '#1E293B',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalBox: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  textInput: {
    backgroundColor: '#030712',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#F8FAFC',
    fontSize: 13,
  },
  trommelsScroll: {
    flexDirection: 'row',
  },
  trommelChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    marginRight: 8,
  },
  trommelChipActive: {
    backgroundColor: '#0284C7',
    borderColor: '#38BDF8',
  },
  trommelChipText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  trommelChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  modalActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 8,
  },
  modalCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modalCancelText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
  modalSaveBtn: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  modalSaveText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
