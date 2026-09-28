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

interface ProjectOption {
  id: string;
  name: string;
  company_name?: string;
  address?: string;
}

interface TrommelRow {
  id: string;
  project_id?: string;
  name: string;
  cable_type: string;
  initial_length: number;
  remaining_length: number;
}

interface CableRow {
  id: string;
  plan_id: string;
  plan_name?: string;
  trommel_id?: string | null;
  cable_number: string;
  cable_type: string;
  length: number;
  status: 'planned' | 'drawn' | 'measured' | 'connected';
  version: number;
}

interface PlanOption {
  id: string;
  project_id: string;
  name: string;
  building_name?: string;
  floor_name?: string;
  full_name: string;
}

export default function CablesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ projectId?: string }>();
  const [activeTab, setActiveTab] = useState<'cables' | 'trommels'>('cables');
  
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(params.projectId || '');
  const [showProjectPicker, setShowProjectPicker] = useState(false);

  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
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

  const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://inspecthero.pl';

  const syncCablesFromApi = async (db: any, projId?: string) => {
    try {
      const { data: { session } } = await authSupabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      // Sync projects
      const projRes = await fetch(`${API_BASE_URL}/api/projects`, { headers });
      if (projRes.ok) {
        const projJson = await projRes.json();
        const pList = Array.isArray(projJson) ? projJson : (projJson?.data || []);
        for (const p of pList) {
          const companyName = p.companies?.name || p.company?.name || null;
          await db.runAsync(
            `INSERT INTO projects (id, name, company_name, address, version)
             VALUES (?, ?, ?, ?, 1)
             ON CONFLICT(id) DO UPDATE SET name = excluded.name, company_name = excluded.company_name, address = excluded.address;`,
            [p.id, p.name, companyName, p.address || null]
          );
        }
      }

      // Sync plans for current project if selected
      const targetProj = projId || selectedProjectId;
      if (targetProj) {
        const planRes = await fetch(`${API_BASE_URL}/api/plans?projectId=${encodeURIComponent(targetProj)}`, { headers });
        if (planRes.ok) {
          const planJson = await planRes.json();
          const pList = Array.isArray(planJson) ? planJson : (planJson?.data || []);
          for (const pl of pList) {
            const bName = pl.floors?.buildings?.name || '';
            const fName = pl.floors?.name || '';
            const rawName = pl.name || 'Plan';
            const fullPlanName = [bName, fName, (rawName && rawName !== fName) ? rawName : ''].filter(Boolean).join(' · ') || rawName;

            await db.runAsync(
              `INSERT INTO plans (id, project_id, floor_id, name, width, height, version)
               VALUES (?, ?, ?, ?, ?, ?, 1)
               ON CONFLICT(id) DO UPDATE SET name = excluded.name, project_id = excluded.project_id, floor_id = excluded.floor_id;`,
              [pl.id, targetProj, pl.floor_id || null, fullPlanName, pl.image_width || 1920, pl.image_height || 1080]
            );
          }
        }
      }
    } catch (e) {
      console.warn('[Cables] Sync error:', e);
    }
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const db = await getDatabase();
      await syncCablesFromApi(db, selectedProjectId);

      // Load projects
      const projs = await db.getAllAsync<ProjectOption>(
        'SELECT id, name, company_name, address FROM projects WHERE deleted_at IS NULL ORDER BY name ASC;'
      );
      setProjects(projs || []);

      let activeProjId = selectedProjectId;
      if (!activeProjId && projs && projs.length > 0) {
        activeProjId = projs[0].id;
        setSelectedProjectId(activeProjId);
      }

      // Load plans for the project with full building & floor names
      let planRows: PlanOption[] = [];
      if (activeProjId) {
        const rawPlans = await db.getAllAsync<any>(`
          SELECT 
            p.id, 
            p.project_id,
            p.name,
            COALESCE(b.name, '') as building_name,
            COALESCE(f.name, '') as floor_name
          FROM plans p
          LEFT JOIN floors f ON p.floor_id = f.id
          LEFT JOIN buildings b ON f.building_id = b.id
          WHERE p.deleted_at IS NULL AND p.project_id = ? AND p.id != 'pln-sample-001'
          ORDER BY b.name ASC, f.level_number ASC, p.name ASC;
        `, [activeProjId]);

        planRows = (rawPlans || []).map((p) => {
          const parts = [p.building_name, p.floor_name, (p.name && p.name !== p.floor_name) ? p.name : ''].filter(Boolean);
          const full = parts.length > 0 ? parts.join(' · ') : p.name;
          return {
            id: p.id,
            project_id: p.project_id,
            name: p.name,
            building_name: p.building_name,
            floor_name: p.floor_name,
            full_name: full,
          };
        });
      }
      setPlans(planRows);

      // Load Trommels
      const trommelRows = await db.getAllAsync<TrommelRow>(
        'SELECT * FROM trommels WHERE deleted_at IS NULL ORDER BY name ASC;'
      );
      setTrommels(trommelRows || []);

      // Load Cables
      let cableQuery = `
        SELECT 
          c.id, 
          c.plan_id, 
          c.trommel_id, 
          c.cable_number, 
          c.cable_type, 
          c.length, 
          c.status, 
          c.version,
          p.name as plan_name
        FROM cables c
        LEFT JOIN plans p ON c.plan_id = p.id
        WHERE c.deleted_at IS NULL
      `;
      const paramsSql: any[] = [];

      if (selectedPlanId !== 'all') {
        cableQuery += ' AND c.plan_id = ?';
        paramsSql.push(selectedPlanId);
      } else if (activeProjId) {
        cableQuery += ' AND p.project_id = ?';
        paramsSql.push(activeProjId);
      }

      cableQuery += ' ORDER BY c.cable_number ASC;';
      const cableRows = await db.getAllAsync<CableRow>(cableQuery, paramsSql);
      setCables(cableRows || []);
    } catch (err) {
      console.error('[CablesScreen] Error loading cables & trommels:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedProjectId, selectedPlanId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const currentProject = projects.find((p) => p.id === selectedProjectId);

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

  const filteredCables = cables.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.cable_number.toLowerCase().includes(q) ||
      c.cable_type.toLowerCase().includes(q) ||
      (c.plan_name && c.plan_name.toLowerCase().includes(q))
    );
  });

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

      {/* 1. Project Selector Bar (Disambiguate Segro Flingern: Lichtband vs SV) */}
      <View style={styles.projectBar}>
        <TouchableOpacity
          style={styles.projectSelectorBtn}
          onPress={() => setShowProjectPicker(true)}
          activeOpacity={0.8}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.projectSelectorSub}>WYBRANY PROJEKT:</Text>
            <View style={styles.projectSelectorRow}>
              {currentProject?.company_name ? (
                <View style={styles.companyBadge}>
                  <Text style={styles.companyBadgeText}>[{currentProject.company_name}]</Text>
                </View>
              ) : null}
              <Text style={styles.projectSelectorTitle} numberOfLines={1}>
                {currentProject?.name || 'Wybierz projekt budowlany...'}
              </Text>
            </View>
            {currentProject?.address ? (
              <Text style={styles.projectAddressText} numberOfLines={1}>
                📍 {currentProject.address}
              </Text>
            ) : null}
          </View>
          <Text style={styles.chevronIcon}>▼</Text>
        </TouchableOpacity>
      </View>

      {/* 2. Plan Scroll with FULL Names */}
      <View style={styles.topControlSection}>
        {plans.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.planScroll}>
            <TouchableOpacity
              style={[styles.planChip, selectedPlanId === 'all' && styles.planChipActive]}
              onPress={() => setSelectedPlanId('all')}
            >
              <Text style={[styles.planChipText, selectedPlanId === 'all' && styles.planChipTextActive]}>
                Wszystkie plany ({plans.length})
              </Text>
            </TouchableOpacity>
            {plans.map((pl) => (
              <TouchableOpacity
                key={pl.id}
                style={[styles.planChip, selectedPlanId === pl.id && styles.planChipActive]}
                onPress={() => setSelectedPlanId(pl.id)}
              >
                <Text style={[styles.planChipText, selectedPlanId === pl.id && styles.planChipTextActive]}>
                  📐 {pl.full_name}
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
              Przeglądaj trasy kablowe, punkty wejścia/wyjścia i bębny na mapie
            </Text>
          </View>
          <Text style={styles.mapBannerArrow}>➔</Text>
        </TouchableOpacity>
      </View>

      {/* Search Input */}
      <View style={styles.searchSection}>
        <TextInput
          style={styles.searchInput}
          placeholder="Szukaj kabla, typu lub rzutu..."
          placeholderTextColor="#64748B"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery ? (
          <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearSearchBtn}>
            <Text style={styles.clearSearchText}>✕</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'cables' && styles.tabActive]}
          onPress={() => setActiveTab('cables')}
        >
          <Text style={[styles.tabText, activeTab === 'cables' && styles.tabTextActive]}>
            🔌 Kable ({filteredCables.length})
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
          <Text style={styles.loadingText}>Ładowanie tras kablowych...</Text>
        </View>
      ) : activeTab === 'cables' ? (
        <FlatList
          data={filteredCables}
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
              <Text style={styles.emptySubtitle}>Brak zarejestrowanych tras kablowych dla wybranego planu.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const badge = getCableBadge(item.status);
            const assignedTrommel = trommels.find((t) => t.id === item.trommel_id);
            const planObj = plans.find((p) => p.id === item.plan_id);
            const displayPlanName = planObj?.full_name || item.plan_name || 'Plan bazowy';

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

                {/* Full Plan Name Badge */}
                <View style={styles.planNameRow}>
                  <Text style={styles.planNameBadgeText}>📐 {displayPlanName}</Text>
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
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>🎯 {item.name}</Text>
                  <Text style={styles.drumTypeBadge}>{item.cable_type}</Text>
                </View>
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>
                    Początkowa: <Text style={styles.metaValue}>{item.initial_length} m</Text>
                  </Text>
                  <Text style={styles.metaLabel}>
                    Pozostało: <Text style={[styles.metaValue, { color: '#22C55E' }]}>{item.remaining_length} m</Text>
                  </Text>
                </View>
              </View>
            )}
          />
        </View>
      )}

      {/* Project Picker Modal */}
      <Modal visible={showProjectPicker} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.projectModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Wybierz projekt budowlany</Text>
              <TouchableOpacity onPress={() => setShowProjectPicker(false)}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 380 }}>
              {projects.map((pr) => (
                <TouchableOpacity
                  key={pr.id}
                  style={[
                    styles.projectItem,
                    selectedProjectId === pr.id && styles.projectItemActive,
                  ]}
                  onPress={() => {
                    setSelectedProjectId(pr.id);
                    setSelectedPlanId('all');
                    setShowProjectPicker(false);
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <View style={styles.projectItemHeader}>
                      {pr.company_name ? (
                        <View style={styles.companyBadge}>
                          <Text style={styles.companyBadgeText}>[{pr.company_name}]</Text>
                        </View>
                      ) : null}
                      <Text style={styles.projectItemTitle}>{pr.name}</Text>
                    </View>
                    {pr.address ? (
                      <Text style={styles.projectItemSub}>📍 {pr.address}</Text>
                    ) : null}
                  </View>
                  {selectedProjectId === pr.id ? (
                    <Text style={styles.checkmarkIcon}>✓</Text>
                  ) : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Edit Cable Modal */}
      <Modal visible={!!selectedCable} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edycja: {selectedCable?.cable_number}</Text>
              <TouchableOpacity onPress={() => setSelectedCable(null)}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Długość kabla (metry):</Text>
            <TextInput
              style={styles.input}
              value={editLength}
              onChangeText={setEditLength}
              keyboardType="numeric"
              placeholder="np. 45"
              placeholderTextColor="#64748B"
            />

            <Text style={styles.inputLabel}>Przypisz do bębna / Trommel:</Text>
            <ScrollView horizontal style={styles.drumScroll} showsHorizontalScrollIndicator={false}>
              <TouchableOpacity
                style={[styles.drumChip, selectedTrommelId === '' && styles.drumChipActive]}
                onPress={() => setSelectedTrommelId('')}
              >
                <Text style={[styles.drumChipText, selectedTrommelId === '' && styles.drumChipTextActive]}>
                  Brak
                </Text>
              </TouchableOpacity>
              {trommels.map((t) => (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.drumChip, selectedTrommelId === t.id && styles.drumChipActive]}
                  onPress={() => setSelectedTrommelId(t.id)}
                >
                  <Text style={[styles.drumChipText, selectedTrommelId === t.id && styles.drumChipTextActive]}>
                    🎯 {t.name} ({t.remaining_length}m)
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.saveBtn]}
                onPress={handleSaveCableDetail}
              >
                <Text style={styles.saveBtnText}>Zapisz zmiany</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Drum Modal */}
      <Modal visible={addDrumModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nowy bęben w magazynie</Text>
              <TouchableOpacity onPress={() => setAddDrumModalVisible(false)}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Numer / Kod bębna (np. TR-01):</Text>
            <TextInput
              style={styles.input}
              value={newDrumName}
              onChangeText={setNewDrumName}
              placeholder="TR-01"
              placeholderTextColor="#64748B"
            />

            <Text style={styles.inputLabel}>Typ kabla:</Text>
            <TextInput
              style={styles.input}
              value={newDrumType}
              onChangeText={setNewDrumType}
              placeholder="NYM-J 3x1.5"
              placeholderTextColor="#64748B"
            />

            <Text style={styles.inputLabel}>Długość początkowa (m):</Text>
            <TextInput
              style={styles.input}
              value={newDrumLength}
              onChangeText={setNewDrumLength}
              keyboardType="numeric"
              placeholder="500"
              placeholderTextColor="#64748B"
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.saveBtn]}
                onPress={handleCreateDrum}
              >
                <Text style={styles.saveBtnText}>Dodaj bęben</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  projectBar: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
    backgroundColor: '#0F172A',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  projectSelectorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 6,
  },
  projectSelectorSub: {
    fontSize: 9,
    fontWeight: '800',
    color: '#38BDF8',
    letterSpacing: 0.5,
  },
  projectSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  companyBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  companyBadgeText: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  projectSelectorTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '800',
    flex: 1,
  },
  projectAddressText: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  chevronIcon: {
    color: '#38BDF8',
    fontSize: 12,
    marginLeft: 8,
  },
  topControlSection: {
    backgroundColor: '#0F172A',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  planScroll: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  planChip: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  planChipActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    borderColor: '#38BDF8',
  },
  planChipText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
  },
  planChipTextActive: {
    color: '#38BDF8',
  },
  openMapBanner: {
    marginHorizontal: 14,
    marginTop: 4,
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  mapBannerIcon: { fontSize: 24, marginRight: 10 },
  mapBannerTextCol: { flex: 1 },
  mapBannerTitle: { color: '#F8FAFC', fontSize: 13, fontWeight: '800' },
  mapBannerSubtitle: { color: '#94A3B8', fontSize: 10, marginTop: 2 },
  mapBannerArrow: { color: '#38BDF8', fontSize: 16, fontWeight: '900', marginLeft: 8 },
  searchSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#0B0F19',
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#F8FAFC',
    fontSize: 13,
  },
  clearSearchBtn: {
    position: 'absolute',
    right: 24,
    padding: 6,
  },
  clearSearchText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: 'bold',
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#0B0F19',
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#1E293B',
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  tabActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderColor: '#38BDF8',
  },
  tabText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
  },
  tabTextActive: {
    color: '#38BDF8',
  },
  list: { padding: 14, paddingBottom: 40 },
  card: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardTitle: { color: '#F8FAFC', fontSize: 16, fontWeight: '800' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  planNameRow: {
    marginTop: 2,
    marginBottom: 4,
  },
  planNameBadgeText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '700',
  },
  cardDesc: { color: '#94A3B8', fontSize: 13, fontWeight: '600', marginBottom: 8 },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingTop: 8,
    marginTop: 4,
  },
  metaLabel: { color: '#64748B', fontSize: 12 },
  metaValue: { color: '#F8FAFC', fontWeight: '700' },
  drumTag: { color: '#38BDF8', fontSize: 11, fontWeight: '700' },
  drumTagEmpty: { color: '#64748B', fontSize: 11, fontStyle: 'italic' },
  drumTypeBadge: { color: '#38BDF8', fontSize: 11, fontWeight: '700', backgroundColor: '#1E293B', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  cardFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 6,
  },
  tapToEdit: { color: '#475569', fontSize: 10, fontStyle: 'italic' },
  viewOnMapText: { color: '#38BDF8', fontSize: 12, fontWeight: '700' },
  addDrumHeaderBar: { paddingHorizontal: 14, paddingTop: 10 },
  addDrumBtn: {
    backgroundColor: '#0284C7',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  addDrumBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  loadingText: { color: '#94A3B8', fontSize: 13, marginTop: 12 },
  emptyTitle: { color: '#F8FAFC', fontSize: 16, fontWeight: '800', marginBottom: 4 },
  emptySubtitle: { color: '#64748B', fontSize: 12, textAlign: 'center' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  projectModalContent: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: { color: '#F8FAFC', fontSize: 16, fontWeight: '800' },
  closeBtnText: { color: '#94A3B8', fontSize: 18, fontWeight: 'bold' },
  projectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  projectItemActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderColor: '#38BDF8',
  },
  projectItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  projectItemTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '800',
    flex: 1,
  },
  projectItemSub: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 4,
  },
  checkmarkIcon: {
    color: '#38BDF8',
    fontSize: 16,
    fontWeight: '900',
    marginLeft: 8,
  },
  inputLabel: { color: '#94A3B8', fontSize: 12, fontWeight: '700', marginTop: 12, marginBottom: 6 },
  input: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#F8FAFC',
    fontSize: 14,
  },
  drumScroll: { marginVertical: 6 },
  drumChip: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  drumChipActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    borderColor: '#38BDF8',
  },
  drumChipText: { color: '#94A3B8', fontSize: 12, fontWeight: '700' },
  drumChipTextActive: { color: '#38BDF8' },
  modalBtnRow: { marginTop: 20 },
  modalBtn: { paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  saveBtn: { backgroundColor: '#0284C7' },
  saveBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
});
