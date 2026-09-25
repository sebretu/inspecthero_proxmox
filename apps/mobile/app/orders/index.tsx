import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { useLanguage } from '../../src/i18n/LanguageContext';
import { useAuth } from '../../src/auth/useAuth';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://inspecthero.pl';

interface MaterialItem {
  id: string;
  name: string;
  display_name?: string | null;
  category?: string | null;
  unit: string;
  article_number?: string | null;
  is_favorite?: boolean;
}

interface MaterialCategory {
  id: string;
  name: string;
}

interface ProjectOption {
  id: string;
  name: string;
}

export default function MaterialsCatalogScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const { isAdmin } = useAuth();

  const [activeTab, setActiveTab] = useState<'catalog' | 'cart'>('catalog');
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [categories, setCategories] = useState<MaterialCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [orderNotes, setOrderNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Projects for Cart checkout only
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');

  // Add / Edit Material Modal
  const [modalMode, setModalMode] = useState<'add' | 'edit' | null>(null);
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formUnit, setFormUnit] = useState('st.');
  const [formCategory, setFormCategory] = useState('');
  const [formArticleNumber, setFormArticleNumber] = useState('');
  const [formIsFavorite, setFormIsFavorite] = useState(false);

  // Load Categories & Materials from API / SQLite
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { session } } = await authSupabase.auth.getSession();
      const headers: Record<string, string> = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {};

      // 1. Fetch Categories
      try {
        const catRes = await fetch(`${API_BASE_URL}/api/material-categories`, { headers });
        if (catRes.ok) {
          const catJson = await catRes.json();
          const catList = catJson?.data || [];
          setCategories(catList);
        }
      } catch (e) {
        console.warn('[Materials] Categories load error:', e);
      }

      // 2. Fetch Materials
      const matRes = await fetch(`${API_BASE_URL}/api/materials?limit=250`, { headers });
      if (matRes.ok) {
        const matJson = await matRes.json();
        const items = matJson?.data?.items || matJson?.items || [];
        if (items.length > 0) {
          const mapped: MaterialItem[] = items.map((it: any) => ({
            id: it.id,
            name: it.name,
            display_name: it.display_name,
            category: it.category || 'Ogólne',
            unit: it.unit || 'st.',
            article_number: it.article_number,
            is_favorite: !!it.is_favorite,
          }));
          setMaterials(mapped);

          // Cache in local SQLite
          const db = await getDatabase();
          const now = new Date().toISOString();
          for (const m of mapped) {
            await db.runAsync(
              `INSERT INTO materials (id, name, category, unit, created_at, updated_at, version)
               VALUES (?, ?, ?, ?, ?, ?, 1)
               ON CONFLICT(id) DO UPDATE SET name = excluded.name, category = excluded.category, unit = excluded.unit;`,
              [m.id, m.name, m.category || null, m.unit || 'st.', now, now]
            ).catch(() => {});
          }
          return;
        }
      }

      // Fallback local SQLite
      const db = await getDatabase();
      const localRows = (await db.getAllAsync(
        'SELECT id, name, category, unit FROM materials ORDER BY name ASC LIMIT 100;'
      )) as MaterialItem[];
      setMaterials(localRows || []);
    } catch (err) {
      console.warn('[Materials] Load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Load projects for cart checkout
  const loadProjects = useCallback(async () => {
    try {
      const { data: { session } } = await authSupabase.auth.getSession();
      const headers: Record<string, string> = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {};

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
        }
      }
    } catch (e) {}
  }, [selectedProjectId]);

  useEffect(() => {
    loadData();
    loadProjects();
  }, [loadData, loadProjects]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
    loadProjects();
  };

  // Quantity in Cart Management
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

  const totalCartCount = useMemo(() => {
    return Object.values(cart).reduce((a, b) => a + b, 0);
  }, [cart]);

  // Toggle Favorite
  const toggleFavorite = async (item: MaterialItem) => {
    try {
      const nextFav = !item.is_favorite;
      const updatedList = materials.map((m) => (m.id === item.id ? { ...m, is_favorite: nextFav } : m));
      setMaterials(updatedList);

      const { data: { session } } = await authSupabase.auth.getSession();
      if (session?.access_token) {
        await fetch(`${API_BASE_URL}/api/materials`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            name: item.name,
            unit: item.unit,
            is_favorite: nextFav,
          }),
        });
      }
    } catch (err) {
      console.warn('[Materials] Favorite toggle error:', err);
    }
  };

  // Open Add Modal
  const openAddModal = () => {
    setModalMode('add');
    setEditingMaterialId(null);
    setFormName('');
    setFormDisplayName('');
    setFormUnit('st.');
    setFormCategory(selectedCategory !== 'all' && selectedCategory !== 'favorites' ? selectedCategory : '');
    setFormArticleNumber('');
    setFormIsFavorite(false);
  };

  // Open Edit Modal
  const openEditModal = (item: MaterialItem) => {
    setModalMode('edit');
    setEditingMaterialId(item.id);
    setFormName(item.name);
    setFormDisplayName(item.display_name || '');
    setFormUnit(item.unit || 'st.');
    setFormCategory(item.category || '');
    setFormArticleNumber(item.article_number || '');
    setFormIsFavorite(!!item.is_favorite);
  };

  // Save Material (Add or Edit)
  const handleSaveMaterial = async () => {
    if (!formName.trim()) {
      Alert.alert('Błąd', 'Nazwa materiału jest wymagana.');
      return;
    }

    try {
      const { data: { session } } = await authSupabase.auth.getSession();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      };

      if (modalMode === 'add') {
        const payload = {
          name: formName.trim(),
          display_name: formDisplayName.trim() || undefined,
          unit: formUnit.trim() || 'st.',
          category: formCategory.trim() || 'Ogólne',
          article_number: formArticleNumber.trim() || undefined,
          is_favorite: formIsFavorite,
        };

        const res = await fetch(`${API_BASE_URL}/api/materials`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const json = await res.json();
          const created = json?.data?.material || json?.data || { id: `mat-${Date.now()}`, ...payload };
          setMaterials((prev) => [created, ...prev]);
        } else {
          // Fallback optimistic
          const temp: MaterialItem = {
            id: `mat-${Date.now()}`,
            name: formName.trim(),
            display_name: formDisplayName.trim() || null,
            unit: formUnit.trim() || 'st.',
            category: formCategory.trim() || 'Ogólne',
            article_number: formArticleNumber.trim() || null,
            is_favorite: formIsFavorite,
          };
          setMaterials((prev) => [temp, ...prev]);
        }
        Alert.alert('Sukces', 'Materiał został dodany do katalogu.');
      } else if (modalMode === 'edit' && editingMaterialId) {
        const payload = {
          id: editingMaterialId,
          name: formName.trim(),
          display_name: formDisplayName.trim() || undefined,
          unit: formUnit.trim() || 'st.',
          category: formCategory.trim() || 'Ogólne',
          article_number: formArticleNumber.trim() || undefined,
          is_favorite: formIsFavorite,
        };

        await fetch(`${API_BASE_URL}/api/materials`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(payload),
        });

        setMaterials((prev) =>
          prev.map((m) =>
            m.id === editingMaterialId
              ? {
                  ...m,
                  name: formName.trim(),
                  display_name: formDisplayName.trim() || null,
                  unit: formUnit.trim() || 'st.',
                  category: formCategory.trim() || 'Ogólne',
                  article_number: formArticleNumber.trim() || null,
                  is_favorite: formIsFavorite,
                }
              : m
          )
        );
        Alert.alert('Zaktualizowano', 'Materiał został pomyślnie zaktualizowany.');
      }

      setModalMode(null);
    } catch (e: any) {
      Alert.alert('Błąd', e?.message || 'Nie udało się zapisać materiału.');
    }
  };

  // Delete Material
  const handleDeleteMaterial = (item: MaterialItem) => {
    Alert.alert(
      'Usuń materiał',
      `Czy na pewno chcesz usunąć "${item.display_name || item.name}" z katalogu?`,
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Usuń',
          style: 'destructive',
          onPress: async () => {
            try {
              const { data: { session } } = await authSupabase.auth.getSession();
              if (session?.access_token) {
                await fetch(`${API_BASE_URL}/api/materials?id=${item.id}`, {
                  method: 'DELETE',
                  headers: { Authorization: `Bearer ${session.access_token}` },
                });
              }
              setMaterials((prev) => prev.filter((m) => m.id !== item.id));
            } catch (err) {
              Alert.alert('Błąd', 'Nie udało się usunąć materiału.');
            }
          },
        },
      ]
    );
  };

  // Submit Order / Request
  const handleSubmitOrder = async () => {
    if (totalCartCount === 0) {
      Alert.alert('Pusty koszyk', 'Dodaj materiały do koszyka przed złożeniem zamówienia.');
      return;
    }

    if (!selectedProjectId) {
      Alert.alert('Wybierz projekt', 'Wskaż projekt, na który składasz zapotrzebowanie.');
      return;
    }

    try {
      setSubmitting(true);
      const { data: { session } } = await authSupabase.auth.getSession();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      };

      const itemsPayload = Object.entries(cart).map(([matId, qty]) => {
        const mat = materials.find((m) => m.id === matId);
        return {
          material_id: matId,
          custom_name: mat?.display_name || mat?.name,
          custom_unit: mat?.unit || 'st.',
          quantity: qty,
        };
      });

      const res = await fetch(`${API_BASE_URL}/api/orders`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          project_id: selectedProjectId,
          notes: orderNotes.trim() || undefined,
          status: 'PENDING',
          items: itemsPayload,
        }),
      });

      if (res.ok) {
        Alert.alert('Zapotrzebowanie wysłane', 'Zamówienie materiałów zostało przesłane do realizacji.');
        setCart({});
        setOrderNotes('');
        setActiveTab('catalog');
      } else {
        const errJson = await res.json().catch(() => ({}));
        Alert.alert('Błąd', errJson?.error?.message || 'Nie udało się wysłać zapotrzebowania.');
      }
    } catch (e: any) {
      Alert.alert('Błąd', e?.message || 'Błąd połączenia z serwerem.');
    } finally {
      setSubmitting(false);
    }
  };

  // Filtered Materials
  const filteredMaterials = useMemo(() => {
    return materials.filter((m) => {
      // Category filter
      if (selectedCategory === 'favorites' && !m.is_favorite) return false;
      if (selectedCategory !== 'all' && selectedCategory !== 'favorites' && m.category !== selectedCategory) {
        return false;
      }
      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = m.name?.toLowerCase().includes(q);
        const matchDisplay = m.display_name?.toLowerCase().includes(q);
        const matchArticle = m.article_number?.toLowerCase().includes(q);
        const matchCategory = m.category?.toLowerCase().includes(q);
        if (!matchName && !matchDisplay && !matchArticle && !matchCategory) return false;
      }
      return true;
    });
  }, [materials, selectedCategory, search]);

  const renderMaterialItem = ({ item }: { item: MaterialItem }) => {
    const qtyInCart = cart[item.id] || 0;

    return (
      <View style={styles.card}>
        <View style={styles.cardMain}>
          <View style={styles.cardTitleRow}>
            <TouchableOpacity
              onPress={() => toggleFavorite(item)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.starBtn}
            >
              <Text style={styles.starIcon}>{item.is_favorite ? '⭐' : '☆'}</Text>
            </TouchableOpacity>

            <View style={{ flex: 1 }}>
              <Text style={styles.materialName}>{item.display_name || item.name}</Text>
              {item.display_name && item.name !== item.display_name ? (
                <Text style={styles.materialSubName}>{item.name}</Text>
              ) : null}
            </View>

            <View style={styles.unitBadge}>
              <Text style={styles.unitText}>{item.unit || 'st.'}</Text>
            </View>
          </View>

          <View style={styles.metaRow}>
            {item.category ? (
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryText}>{item.category}</Text>
              </View>
            ) : null}

            {item.article_number ? (
              <Text style={styles.articleNumberText}>Art.-Nr: {item.article_number}</Text>
            ) : null}
          </View>
        </View>

        {/* Footer Actions: Cart Quantity + Edit / Delete */}
        <View style={styles.cardActionsRow}>
          <View style={styles.adminActionButtons}>
            <TouchableOpacity
              style={styles.actionIconBtn}
              onPress={() => openEditModal(item)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.actionIconText}>✏️</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionIconBtn}
              onPress={() => handleDeleteMaterial(item)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.actionIconText}>🗑️</Text>
            </TouchableOpacity>
          </View>

          {/* Quantity Controls */}
          <View style={styles.qtyControlRow}>
            {qtyInCart > 0 && (
              <TouchableOpacity
                style={styles.qtyBtnMinus}
                onPress={() => updateQuantity(item.id, -1)}
              >
                <Text style={styles.qtyBtnText}>−</Text>
              </TouchableOpacity>
            )}

            {qtyInCart > 0 && (
              <Text style={styles.qtyValueText}>{qtyInCart}</Text>
            )}

            <TouchableOpacity
              style={[styles.qtyBtnPlus, qtyInCart > 0 && styles.qtyBtnPlusActive]}
              onPress={() => updateQuantity(item.id, 1)}
            >
              <Text style={[styles.qtyBtnText, qtyInCart > 0 && { color: '#0F172A' }]}>
                {qtyInCart > 0 ? '+ Dodaj' : '+ Do koszyka'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{
          title: t('materials_catalog', '📦 Katalog Materiałów & Osprzętu'),
          headerShown: true,
          headerBackTitle: 'Wróć',
          headerStyle: { backgroundColor: '#0B0F19' },
          headerTintColor: '#38BDF8',
          headerTitleStyle: { color: '#F8FAFC', fontWeight: '800' },
          headerRight: () => (
            <TouchableOpacity style={styles.headerAddBtn} onPress={openAddModal}>
              <Text style={styles.headerAddBtnText}>+ Nowy Artykuł</Text>
            </TouchableOpacity>
          ),
        }}
      />

      {/* Main Tabs: Katalog vs Koszyk */}
      <View style={styles.tabsHeader}>
        <TouchableOpacity
          style={[styles.mainTab, activeTab === 'catalog' && styles.mainTabActive]}
          onPress={() => setActiveTab('catalog')}
        >
          <Text style={[styles.mainTabText, activeTab === 'catalog' && styles.mainTabTextActive]}>
            📦 Katalog Materiałów ({materials.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.mainTab, activeTab === 'cart' && styles.mainTabActive]}
          onPress={() => setActiveTab('cart')}
        >
          <Text style={[styles.mainTabText, activeTab === 'cart' && styles.mainTabTextActive]}>
            🛒 Zapotrzebowanie {totalCartCount > 0 ? `(${totalCartCount})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {/* TAB 1: MASTER CATALOG */}
      {activeTab === 'catalog' ? (
        <View style={{ flex: 1 }}>
          {/* Category Filter Scroll */}
          <View style={styles.filterSection}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
              <TouchableOpacity
                style={[styles.catChip, selectedCategory === 'all' && styles.catChipActive]}
                onPress={() => setSelectedCategory('all')}
              >
                <Text style={[styles.catChipText, selectedCategory === 'all' && styles.catChipTextActive]}>
                  Wszystkie ({materials.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.catChip, selectedCategory === 'favorites' && styles.catChipActive]}
                onPress={() => setSelectedCategory('favorites')}
              >
                <Text style={[styles.catChipText, selectedCategory === 'favorites' && styles.catChipTextActive]}>
                  ⭐ Ulubione ({materials.filter((m) => m.is_favorite).length})
                </Text>
              </TouchableOpacity>

              {categories.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.catChip, selectedCategory === c.name && styles.catChipActive]}
                  onPress={() => setSelectedCategory(c.name)}
                >
                  <Text style={[styles.catChipText, selectedCategory === c.name && styles.catChipTextActive]}>
                    {c.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Search Input */}
            <TextInput
              style={styles.searchInput}
              placeholder="Szukaj artykułu (nazwa, Art.-Nr, EAN, kategoria)..."
              placeholderTextColor="#64748B"
              value={search}
              onChangeText={setSearch}
            />
          </View>

          {/* List */}
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#38BDF8" />
              <Text style={styles.loadingText}>Ładowanie katalogu materiałów...</Text>
            </View>
          ) : (
            <FlatList
              data={filteredMaterials}
              keyExtractor={(item) => item.id}
              renderItem={renderMaterialItem}
              contentContainerStyle={styles.listContent}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#38BDF8" />}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyEmoji}>📦</Text>
                  <Text style={styles.emptyTitle}>Brak materiałów w katalogu</Text>
                  <Text style={styles.emptySub}>
                    Zmień kryteria wyszukiwania lub dodaj nowy artykuł przyciskiem powyżej.
                  </Text>
                </View>
              }
            />
          )}
        </View>
      ) : (
        /* TAB 2: CART / ZAPOTRZEBOWANIE DLA PROJEKTU */
        <ScrollView style={styles.cartScroll} contentContainerStyle={{ padding: 16 }}>
          <Text style={styles.cartSectionHeading}>WYBIERZ PROJEKT DOCELOWY:</Text>
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

          <Text style={styles.cartSectionHeading}>POZYCJE W ZAPOTRZEBOWANIU ({totalCartCount} szt.):</Text>
          {Object.keys(cart).length === 0 ? (
            <View style={styles.emptyCartCard}>
              <Text style={{ fontSize: 36, marginBottom: 8 }}>🛒</Text>
              <Text style={styles.emptyTitle}>Twój koszyk zapotrzebowania jest pusty</Text>
              <Text style={styles.emptySub}>Przejdź do katalogu materiałów i wybierz potrzebne artykuły.</Text>
              <TouchableOpacity
                style={[styles.primaryButton, { marginTop: 14 }]}
                onPress={() => setActiveTab('catalog')}
              >
                <Text style={styles.primaryButtonText}>Przeglądaj Katalog Materiałów →</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              {Object.entries(cart).map(([matId, qty]) => {
                const mat = materials.find((m) => m.id === matId);
                return (
                  <View key={matId} style={styles.cartItemRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cartItemTitle}>{mat?.display_name || mat?.name || 'Artykuł'}</Text>
                      {mat?.article_number ? (
                        <Text style={styles.cartItemArt}>Art.-Nr: {mat.article_number}</Text>
                      ) : null}
                    </View>
                    <View style={styles.cartItemQtyWrap}>
                      <TouchableOpacity
                        style={styles.cartQtyBtn}
                        onPress={() => updateQuantity(matId, -1)}
                      >
                        <Text style={styles.cartQtyBtnText}>−</Text>
                      </TouchableOpacity>
                      <Text style={styles.cartQtyText}>
                        {qty} {mat?.unit || 'st.'}
                      </Text>
                      <TouchableOpacity
                        style={styles.cartQtyBtn}
                        onPress={() => updateQuantity(matId, 1)}
                      >
                        <Text style={styles.cartQtyBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}

              <Text style={[styles.cartSectionHeading, { marginTop: 20 }]}>UWAGI / MIEJSCE DOSTAWY:</Text>
              <TextInput
                style={[styles.input, { height: 70, textAlignVertical: 'top' }]}
                placeholder="Np. Pilne na jutro rano, rozdzielnica główna Halle 4..."
                placeholderTextColor="#64748B"
                value={orderNotes}
                onChangeText={setOrderNotes}
                multiline
              />

              <TouchableOpacity
                style={styles.submitOrderBtn}
                onPress={handleSubmitOrder}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#0F172A" />
                ) : (
                  <Text style={styles.submitOrderBtnText}>🚀 Złóż Zapotrzebowanie Materiałowe ({totalCartCount})</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}

      {/* MODAL: ADD / EDIT MATERIAL */}
      <Modal
        visible={!!modalMode}
        transparent
        animationType="slide"
        onRequestClose={() => setModalMode(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalHeading}>
              {modalMode === 'add' ? '➕ Nowy Materiał do Katalogu' : '✏️ Edycja Materiału'}
            </Text>

            <ScrollView style={{ maxHeight: 360 }}>
              <Text style={styles.inputLabel}>NAZWA MATERIAŁU *</Text>
              <TextInput
                style={styles.input}
                placeholder="Np. NYM-J 3x1.5 mm², Wago 221-413..."
                placeholderTextColor="#64748B"
                value={formName}
                onChangeText={setFormName}
              />

              <Text style={styles.inputLabel}>NAZWA WYŚWIETLANA (OPCJONALNIE)</Text>
              <TextInput
                style={styles.input}
                placeholder="Krótsza nazwa na etykiety..."
                placeholderTextColor="#64748B"
                value={formDisplayName}
                onChangeText={setFormDisplayName}
              />

              <View style={styles.rowInputs}>
                <View style={{ flex: 1, marginRight: 6 }}>
                  <Text style={styles.inputLabel}>JEDNOSTKA</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="st. / m / kpl / opk"
                    placeholderTextColor="#64748B"
                    value={formUnit}
                    onChangeText={setFormUnit}
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 6 }}>
                  <Text style={styles.inputLabel}>NUMER ARTYKUŁU</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Art.-Nr / EAN / SKU"
                    placeholderTextColor="#64748B"
                    value={formArticleNumber}
                    onChangeText={setFormArticleNumber}
                  />
                </View>
              </View>

              <Text style={styles.inputLabel}>KATEGORIA MATERIAŁU</Text>
              <TextInput
                style={styles.input}
                placeholder="Np. Kable, Osprzęt, Bezpieczniki, BMA..."
                placeholderTextColor="#64748B"
                value={formCategory}
                onChangeText={setFormCategory}
              />

              {/* Favorites Toggle */}
              <TouchableOpacity
                style={styles.favoriteCheckboxRow}
                onPress={() => setFormIsFavorite(!formIsFavorite)}
              >
                <Text style={{ fontSize: 18, marginRight: 8 }}>{formIsFavorite ? '⭐' : '☆'}</Text>
                <Text style={styles.favoriteCheckboxText}>Oznacz jako ulubiony (szybki wybór)</Text>
              </TouchableOpacity>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setModalMode(null)}
              >
                <Text style={styles.cancelBtnText}>Anuluj</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleSaveMaterial}
              >
                <Text style={styles.saveBtnText}>
                  {modalMode === 'add' ? 'Dodaj do katalogu' : 'Zapisz zmiany'}
                </Text>
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
  tabsHeader: {
    flexDirection: 'row',
    backgroundColor: '#0B0F19',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  mainTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  mainTabActive: {
    borderBottomColor: '#38BDF8',
  },
  mainTabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  mainTabTextActive: {
    color: '#38BDF8',
    fontWeight: '800',
  },
  filterSection: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: '#0F172A',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  catScroll: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  catChip: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  catChipActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    borderColor: '#38BDF8',
  },
  catChipText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
  },
  catChipTextActive: {
    color: '#38BDF8',
  },
  searchInput: {
    backgroundColor: '#1E293B',
    color: '#F8FAFC',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#334155',
  },
  listContent: {
    padding: 14,
    gap: 10,
  },
  card: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 6,
  },
  cardMain: {
    marginBottom: 8,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  starBtn: {
    marginRight: 8,
    paddingTop: 1,
  },
  starIcon: {
    fontSize: 18,
  },
  materialName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  materialSubName: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 1,
  },
  unitBadge: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
    marginLeft: 6,
  },
  unitText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#38BDF8',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    marginLeft: 26,
  },
  categoryBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
  },
  categoryText: {
    fontSize: 10,
    color: '#38BDF8',
    fontWeight: '700',
  },
  articleNumberText: {
    fontSize: 11,
    color: '#64748B',
  },
  cardActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingTop: 8,
    marginTop: 4,
  },
  adminActionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  actionIconBtn: {
    padding: 4,
  },
  actionIconText: {
    fontSize: 15,
  },
  qtyControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  qtyBtnMinus: {
    backgroundColor: '#1E293B',
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  qtyValueText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#38BDF8',
    minWidth: 20,
    textAlign: 'center',
  },
  qtyBtnPlus: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  qtyBtnPlusActive: {
    backgroundColor: '#38BDF8',
  },
  qtyBtnText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '800',
  },
  cartScroll: {
    flex: 1,
    backgroundColor: '#030712',
  },
  cartSectionHeading: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  projScroll: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  projChip: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  projChipActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    borderColor: '#38BDF8',
  },
  projChipText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
  },
  projChipTextActive: {
    color: '#38BDF8',
  },
  emptyCartCard: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E293B',
    marginTop: 8,
  },
  primaryButton: {
    backgroundColor: '#38BDF8',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  primaryButtonText: {
    color: '#0F172A',
    fontWeight: '800',
    fontSize: 13,
  },
  cartItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  cartItemTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  cartItemArt: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  cartItemQtyWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cartQtyBtn: {
    backgroundColor: '#1E293B',
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  cartQtyBtnText: {
    color: '#38BDF8',
    fontSize: 14,
    fontWeight: '800',
  },
  cartQtyText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '800',
  },
  submitOrderBtn: {
    backgroundColor: '#38BDF8',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 40,
  },
  submitOrderBtnText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.78)',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  modalHeading: {
    fontSize: 17,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#1E293B',
    color: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 10,
  },
  rowInputs: {
    flexDirection: 'row',
  },
  favoriteCheckboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    marginBottom: 10,
  },
  favoriteCheckboxText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 10,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  cancelBtnText: {
    color: '#94A3B8',
    fontWeight: '700',
  },
  saveBtn: {
    backgroundColor: '#38BDF8',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  saveBtnText: {
    color: '#0F172A',
    fontWeight: '800',
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
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyEmoji: {
    fontSize: 44,
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    maxWidth: 280,
  },
});
