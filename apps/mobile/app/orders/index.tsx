import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  ScrollView,
  RefreshControl,
  Modal,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDatabase } from '../../src/db/database';
import { authSupabase } from '../../src/auth/authClient';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://inspecthero.pl';

interface MaterialItem {
  id: string;
  name: string;
  display_name?: string | null;
  category?: string | null;
  unit: string;
  article_number?: string | null;
}

interface ProjectOption {
  id: string;
  name: string;
}

export default function OrdersScreen() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [orderNotes, setOrderNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Custom material modal
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customUnit, setCustomUnit] = useState('szt');
  const [customArticle, setCustomArticle] = useState('');
  const [customCategory, setCustomCategory] = useState('');

  // Load Projects
  const loadProjects = useCallback(async () => {
    try {
      const db = await getDatabase();
      const { data: { session } } = await authSupabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const res = await fetch(`${API_BASE_URL}/api/projects`, { headers });
      if (res.ok) {
        const json = await res.json();
        const apiProjects = Array.isArray(json) ? json : (json?.data || []);
        if (apiProjects.length > 0) {
          const projs = apiProjects.map((p: any) => ({ id: p.id, name: p.name }));
          setProjects(projs);
          if (!selectedProjectId) {
            setSelectedProjectId(projs[0].id);
          }
          return;
        }
      }

      // Fallback local db
      const localProjs = await db.getAllAsync<ProjectOption>(
        "SELECT id, name FROM projects WHERE deleted_at IS NULL AND id != 'proj-sample-001' ORDER BY name ASC;"
      );
      setProjects(localProjs);
      if (localProjs.length > 0 && !selectedProjectId) {
        setSelectedProjectId(localProjs[0].id);
      }
    } catch (e) {
      console.warn('[OrdersScreen] Error loading projects:', e);
    }
  }, [selectedProjectId]);

  // Load Materials from API / SQLite
  const loadMaterials = useCallback(async (query = '') => {
    try {
      setSearching(true);
      const { data: { session } } = await authSupabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const searchParam = query.trim() ? `&search=${encodeURIComponent(query.trim())}` : '&favoritesOnly=true';
      const res = await fetch(`${API_BASE_URL}/api/materials?limit=100${searchParam}`, { headers });

      if (res.ok) {
        const json = await res.json();
        const items = json?.data?.items || json?.items || [];
        if (items.length > 0) {
          const mapped = items.map((it: any) => ({
            id: it.id,
            name: it.display_name || it.name,
            category: it.category || 'Ogólne',
            unit: it.unit || 'szt',
            article_number: it.article_number,
          }));
          setMaterials(mapped);

          // Cache in local SQLite
          const db = await getDatabase();
          const now = new Date().toISOString();
          for (const m of mapped) {
            await db.runAsync(
              `INSERT INTO materials (id, name, category, unit, unit_price, in_stock, created_at, updated_at, version)
               VALUES (?, ?, ?, ?, 0, 100, ?, ?, 1)
               ON CONFLICT(id) DO UPDATE SET name = excluded.name, category = excluded.category, unit = excluded.unit;`,
              [m.id, m.name, m.category, m.unit, now, now]
            );
          }
          return;
        }
      }

      // Fallback SQLite
      const db = await getDatabase();
      const filter = query.trim() ? `WHERE name LIKE '%${query.trim()}%'` : '';
      const localRows = await db.getAllAsync<MaterialItem>(
        `SELECT id, name, category, unit FROM materials ${filter} ORDER BY name ASC LIMIT 50;`
      );
      setMaterials(localRows);
    } catch (err) {
      console.warn('[OrdersScreen] Error loading materials:', err);
    } finally {
      setLoading(false);
      setSearching(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    const delay = setTimeout(() => {
      loadMaterials(search);
    }, 300);
    return () => clearTimeout(delay);
  }, [search, loadMaterials]);

  const onRefresh = () => {
    setRefreshing(true);
    loadProjects();
    loadMaterials(search);
  };

  const updateQuantity = (materialId: string, delta: number) => {
    setCart((prev) => {
      const current = prev[materialId] || 0;
      const next = Math.max(0, current + delta);
      if (next === 0) {
        const copy = { ...prev };
        delete copy[materialId];
        return copy;
      }
      return { ...prev, [materialId]: next };
    });
  };

  const totalCartItems = Object.values(cart).reduce((a, b) => a + b, 0);

  const handleAddCustomMaterial = async () => {
    if (!customName.trim()) {
      Alert.alert('Błąd', 'Podaj nazwę materiału.');
      return;
    }

    try {
      const { data: { session } } = await authSupabase.auth.getSession();
      const tempId = `mat-custom-${Date.now()}`;
      const newItem: MaterialItem = {
        id: tempId,
        name: customName.trim(),
        unit: customUnit.trim() || 'szt',
        category: customCategory.trim() || 'Własne',
        article_number: customArticle.trim() || null,
      };

      if (session?.access_token) {
        await fetch(`${API_BASE_URL}/api/materials`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            name: newItem.name,
            unit: newItem.unit,
            category: newItem.category,
            article_number: newItem.article_number,
          }),
        }).catch(() => {});
      }

      setMaterials((prev) => [newItem, ...prev]);
      updateQuantity(tempId, 1);
      setShowCustomModal(false);
      setCustomName('');
      setCustomArticle('');
      setCustomCategory('');
      Alert.alert('Dodano', 'Materiał dodany do koszyka.');
    } catch (e: any) {
      Alert.alert('Błąd', e?.message || 'Nie udało się dodać materiału');
    }
  };

  const handleSubmitOrder = async () => {
    if (totalCartItems === 0) {
      Alert.alert('Pusty koszyk', 'Wybierz materiały przed złożeniem zapotrzebowania.');
      return;
    }

    if (!selectedProjectId) {
      Alert.alert('Wybierz projekt', 'Wskaż projekt budowlany przed złożeniem zamówienia.');
      return;
    }

    try {
      setSubmitting(true);
      const db = await getDatabase();
      const orderId = `ord-${Date.now()}`;
      const now = new Date().toISOString();
      const { data: { session } } = await authSupabase.auth.getSession();

      const itemsPayload = Object.entries(cart).map(([matId, qty]) => {
        const mat = materials.find((m) => m.id === matId);
        return {
          material_id: matId.startsWith('mat-custom') ? null : matId,
          custom_name: matId.startsWith('mat-custom') ? mat?.name : null,
          custom_unit: matId.startsWith('mat-custom') ? mat?.unit : null,
          quantity: qty,
        };
      });

      // Try sending to API
      let sentToApi = false;
      if (session?.access_token) {
        try {
          const res = await fetch(`${API_BASE_URL}/api/orders`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              projectId: selectedProjectId,
              notes: orderNotes.trim() || null,
              items: itemsPayload,
            }),
          });
          if (res.ok) {
            sentToApi = true;
          }
        } catch (apiErr) {
          console.warn('[Orders] API post failed, queueing offline:', apiErr);
        }
      }

      // Record in local SQLite
      await db.runAsync(`
        INSERT INTO orders (id, project_id, user_id, status, notes, created_at, updated_at, version)
        VALUES (?, ?, ?, 'submitted', ?, ?, ?, 1);
      `, [orderId, selectedProjectId, session?.user?.id || 'usr-mobile', orderNotes.trim() || null, now, now]);

      // Record offline mutation
      await db.runAsync(`
        INSERT INTO mutations (
          mutation_id, entity_type, entity_id, operation, base_version, payload, status, attempts, created_at, updated_at
        ) VALUES (?, 'orders', ?, 'INSERT', 0, ?, ?, 0, ?, ?);
      `, [
        `mut-${Date.now()}-${orderId}`,
        orderId,
        JSON.stringify({
          project_id: selectedProjectId,
          notes: orderNotes.trim() || null,
          items: itemsPayload,
          created_at: now,
        }),
        sentToApi ? 'SYNCED' : 'PENDING',
        now,
        now,
      ]);

      setCart({});
      setOrderNotes('');
      Alert.alert(
        'Zapotrzebowanie wysłane',
        sentToApi
          ? 'Zamówienie zostało pomyślnie przekazane do działu zaopatrzenia!'
          : 'Zamówienie zarejestrowane offline. Zostanie zsynchronizowane po połączeniu.'
      );
    } catch (err: any) {
      Alert.alert('Błąd', err?.message || 'Nie udało się złożyć zapotrzebowania');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{
          title: 'Katalog Materiałów (et4u)',
          headerShown: true,
          headerBackTitle: 'Wstecz',
          headerStyle: { backgroundColor: '#0B0F19' },
          headerTintColor: '#38BDF8',
          headerTitleStyle: { color: '#F8FAFC', fontWeight: '700' },
        }}
      />

      {/* Project Selector */}
      <View style={styles.topBar}>
        <Text style={styles.sectionLabel}>PROJEKT BUDOWLANY:</Text>
        {projects.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.projScroll}>
            {projects.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={[styles.projChip, selectedProjectId === p.id && styles.projChipActive]}
                onPress={() => setSelectedProjectId(p.id)}
              >
                <Text style={[styles.projChipText, selectedProjectId === p.id && styles.projChipTextActive]}>
                  🏢 {p.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="Szukaj materiału, artykułu lub typu..."
            placeholderTextColor="#64748B"
            value={search}
            onChangeText={setSearch}
          />
          <TouchableOpacity
            style={styles.addCustomBtn}
            onPress={() => setShowCustomModal(true)}
          >
            <Text style={styles.addCustomBtnText}>+ Własny</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#38BDF8" />
          <Text style={styles.loadingText}>Ładowanie katalogu z serwera...</Text>
        </View>
      ) : (
        <View style={styles.content}>
          <FlatList
            data={materials}
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
                <Text style={styles.emptyTitle}>Brak materiałów</Text>
                <Text style={styles.emptySubtitle}>
                  Wpisz frazę wyszukiwania lub dodaj pozycję przyciskiem "+ Własny".
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const qty = cart[item.id] || 0;
              return (
                <View style={styles.card}>
                  <View style={styles.cardMain}>
                    <Text style={styles.matName}>{item.name}</Text>
                    <Text style={styles.matCategory}>
                      {item.category || 'Materiały'} • {item.unit}
                      {item.article_number ? ` • Art. ${item.article_number}` : ''}
                    </Text>
                  </View>

                  <View style={styles.qtyControl}>
                    <TouchableOpacity
                      style={styles.qtyBtn}
                      onPress={() => updateQuantity(item.id, -1)}
                    >
                      <Text style={styles.qtyBtnText}>-</Text>
                    </TouchableOpacity>

                    <Text style={styles.qtyText}>{qty}</Text>

                    <TouchableOpacity
                      style={styles.qtyBtn}
                      onPress={() => updateQuantity(item.id, 1)}
                    >
                      <Text style={styles.qtyBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }}
          />

          {/* Cart & Submit Footer */}
          {totalCartItems > 0 && (
            <View style={styles.footer}>
              <TextInput
                style={styles.notesInput}
                placeholder="Uwagi do zamówienia (np. rozładunek brama 2)..."
                placeholderTextColor="#64748B"
                value={orderNotes}
                onChangeText={setOrderNotes}
              />

              <TouchableOpacity
                style={styles.submitBtn}
                activeOpacity={0.8}
                onPress={handleSubmitOrder}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitBtnText}>
                    Złóż zapotrzebowanie ({totalCartItems} pozycji) ➔
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Modal: Add Custom Material */}
      <Modal
        visible={showCustomModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCustomModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Dodaj własny materiał</Text>

            <Text style={styles.inputLabel}>NAZWA MATERIAŁU *</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="np. Koryto kablowe BAKS 100x60"
              placeholderTextColor="#64748B"
              value={customName}
              onChangeText={setCustomName}
            />

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>JEDNOSTKA</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="szt / mb / opk"
                  placeholderTextColor="#64748B"
                  value={customUnit}
                  onChangeText={setCustomUnit}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>NUMER ARTYKUŁU</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="np. 110234"
                  placeholderTextColor="#64748B"
                  value={customArticle}
                  onChangeText={setCustomArticle}
                />
              </View>
            </View>

            <Text style={styles.inputLabel}>KATEGORIA</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="np. Trasy kablowe"
              placeholderTextColor="#64748B"
              value={customCategory}
              onChangeText={setCustomCategory}
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowCustomModal(false)}
              >
                <Text style={styles.modalCancelBtnText}>Anuluj</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSubmitBtn}
                onPress={handleAddCustomMaterial}
              >
                <Text style={styles.modalSubmitBtnText}>Dodaj do koszyka</Text>
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
  topBar: {
    backgroundColor: '#0B0F19',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  projScroll: {
    marginBottom: 10,
  },
  projChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#1E293B',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  projChipActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    borderColor: '#38BDF8',
  },
  projChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },
  projChipTextActive: {
    color: '#38BDF8',
    fontWeight: '700',
  },
  searchRow: {
    flexDirection: 'row',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#030712',
    color: '#F8FAFC',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  addCustomBtn: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  addCustomBtnText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  list: {
    padding: 16,
    paddingBottom: 140,
  },
  card: {
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
  cardMain: {
    flex: 1,
    marginRight: 12,
  },
  matName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 2,
  },
  matCategory: {
    fontSize: 11,
    color: '#38BDF8',
  },
  qtyControl: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#030712',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  qtyBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  qtyBtnText: {
    color: '#38BDF8',
    fontSize: 16,
    fontWeight: '800',
  },
  qtyText: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
    minWidth: 24,
    textAlign: 'center',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#0B0F19',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  notesInput: {
    backgroundColor: '#030712',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#F8FAFC',
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 10,
  },
  submitBtn: {
    backgroundColor: '#0284C7',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
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
  inputLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    marginBottom: 4,
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
    marginBottom: 12,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
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
