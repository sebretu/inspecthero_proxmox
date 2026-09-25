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
  Image,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { getDatabase } from '../../src/db/database';
import { authSupabase } from '../../src/auth/authClient';
import { useLanguage } from '../../src/i18n/LanguageContext';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://inspecthero.pl';

export type AufmassType = 'aufmass' | 'zusatz' | 'baubehinderung' | 'bestellung' | 'fragen';

interface AufmassSession {
  id: string;
  project_id: string;
  plan_id?: string;
  session_type: AufmassType;
  name: string;
  client_name?: string | null;
  client_phone?: string | null;
  client_email?: string | null;
  created_at: string;
  projects?: { name: string } | null;
  plans?: { name: string } | null;
}

interface AufmassMaterial {
  id: string;
  session_id: string;
  name: string;
  unit: string;
  quantity: number;
}

interface AufmassLabor {
  id: string;
  session_id: string;
  description: string;
  hours: number;
  worker_count: number;
  date?: string;
}

interface AufmassPhoto {
  id: string;
  session_id: string;
  url: string;
  caption?: string;
}

interface ProjectOption {
  id: string;
  name: string;
}

interface PlanOption {
  id: string;
  name: string;
  project_id?: string;
}

export default function AufmassScreen() {
  const router = useRouter();
  const { t } = useLanguage();

  const [sessions, setSessions] = useState<AufmassSession[]>([]);
  const [selectedType, setSelectedType] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Selected Session for Details Modal
  const [activeSession, setActiveSession] = useState<AufmassSession | null>(null);
  const [sessionMaterials, setSessionMaterials] = useState<AufmassMaterial[]>([]);
  const [sessionLabor, setSessionLabor] = useState<AufmassLabor[]>([]);
  const [sessionPhotos, setSessionPhotos] = useState<AufmassPhoto[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // Create New Session Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [newProjectId, setNewProjectId] = useState('');
  const [newPlanId, setNewPlanId] = useState('');
  const [newType, setNewType] = useState<AufmassType>('aufmass');
  const [newName, setNewName] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [creating, setCreating] = useState(false);

  // Add Item to Session Modal
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [addItemType, setAddItemType] = useState<'material' | 'labor'>('material');
  const [matName, setMatName] = useState('');
  const [matUnit, setMatUnit] = useState('st.');
  const [matQty, setMatQty] = useState('1');
  const [laborDesc, setLaborDesc] = useState('');
  const [laborHours, setLaborHours] = useState('1');
  const [laborWorkers, setLaborWorkers] = useState('1');
  const [savingItem, setSavingItem] = useState(false);

  // Load Sessions
  const loadSessions = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { session } } = await authSupabase.auth.getSession();
      const headers: Record<string, string> = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {};

      const res = await fetch(`${API_BASE_URL}/api/aufmass/sessions`, { headers });
      if (res.ok) {
        const json = await res.json();
        const list = Array.isArray(json) ? json : (json?.data || []);
        setSessions(list);
      }
    } catch (err) {
      console.warn('[Aufmass] Load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Load Projects & Plans for Creation
  const loadProjectsAndPlans = useCallback(async () => {
    try {
      const { data: { session } } = await authSupabase.auth.getSession();
      const headers: Record<string, string> = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {};

      const pRes = await fetch(`${API_BASE_URL}/api/projects`, { headers });
      if (pRes.ok) {
        const pJson = await pRes.json();
        const pList = Array.isArray(pJson) ? pJson : (pJson?.data || []);
        setProjects(pList);
        if (pList.length > 0 && !newProjectId) {
          setNewProjectId(pList[0].id);
        }
      }
    } catch (e) {}
  }, [newProjectId]);

  useEffect(() => {
    if (newProjectId) {
      authSupabase.auth.getSession().then(({ data: { session } }) => {
        const headers: Record<string, string> = session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {};
        fetch(`${API_BASE_URL}/api/plans?projectId=${encodeURIComponent(newProjectId)}&current=true`, { headers })
          .then((r) => r.json())
          .then((pJson) => {
            const pList = Array.isArray(pJson) ? pJson : (pJson?.data || []);
            setPlans(pList);
            if (pList.length > 0) {
              setNewPlanId(pList[0].id);
            } else {
              setNewPlanId('');
            }
          })
          .catch(() => {});
      });
    }
  }, [newProjectId]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const onRefresh = () => {
    setRefreshing(true);
    loadSessions();
  };

  // Load Details of Selected Session
  const openSessionDetails = async (s: AufmassSession) => {
    setActiveSession(s);
    setDetailsLoading(true);
    try {
      const { data: { session } } = await authSupabase.auth.getSession();
      const headers: Record<string, string> = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {};

      const [mRes, lRes, pRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/aufmass/materials?sessionId=${s.id}`, { headers }).catch(() => null),
        fetch(`${API_BASE_URL}/api/aufmass/labor?sessionId=${s.id}`, { headers }).catch(() => null),
        fetch(`${API_BASE_URL}/api/aufmass-photos?sessionId=${s.id}`, { headers }).catch(() => null),
      ]);

      if (mRes && mRes.ok) {
        const mJson = await mRes.json();
        setSessionMaterials(Array.isArray(mJson) ? mJson : (mJson?.data || []));
      }
      if (lRes && lRes.ok) {
        const lJson = await lRes.json();
        setSessionLabor(Array.isArray(lJson) ? lJson : (lJson?.data || []));
      }
      if (pRes && pRes.ok) {
        const pJson = await pRes.json();
        setSessionPhotos(Array.isArray(pJson) ? pJson : (pJson?.data || []));
      }
    } catch (e) {
      console.warn('[Aufmass] Details error:', e);
    } finally {
      setDetailsLoading(false);
    }
  };

  // Create New Session
  const handleCreateSession = async () => {
    if (!newProjectId || !newName.trim()) {
      Alert.alert('Wymagane pola', 'Podaj nazwę protokołu i wybierz projekt.');
      return;
    }

    try {
      setCreating(true);
      const { data: { session } } = await authSupabase.auth.getSession();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      };

      const res = await fetch(`${API_BASE_URL}/api/aufmass/sessions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          project_id: newProjectId,
          plan_id: newPlanId || undefined,
          session_type: newType,
          name: newName.trim(),
          client_name: newClientName.trim() || undefined,
          client_phone: newClientPhone.trim() || undefined,
          client_email: newClientEmail.trim() || undefined,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        const created = json?.data || json;
        setSessions((prev) => [created, ...prev]);
        setShowCreateModal(false);
        setNewName('');
        setNewClientName('');
        setNewClientPhone('');
        setNewClientEmail('');
        Alert.alert('Utworzono', 'Protokół Aufmaß został utworzony.');
      } else {
        Alert.alert('Błąd', 'Nie udało się utworzyć protokołu.');
      }
    } catch (err: any) {
      Alert.alert('Błąd', err?.message || 'Błąd połączenia z serwerem.');
    } finally {
      setCreating(false);
    }
  };

  // Add Photo to Session
  const handleAddPhoto = async (useCamera = false) => {
    if (!activeSession) return;
    try {
      let result;
      if (useCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Brak uprawnień', 'Wymagany dostęp do aparatu');
          return;
        }
        result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
      }

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const localUri = result.assets[0].uri;
        const { data: { session } } = await authSupabase.auth.getSession();
        const formData = new FormData();
        formData.append('file', {
          uri: localUri,
          name: `aufmass_photo_${Date.now()}.jpg`,
          type: 'image/jpeg',
        } as any);

        const upRes = await fetch(`${API_BASE_URL}/api/upload`, {
          method: 'POST',
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
          body: formData,
        });

        if (upRes.ok) {
          const uJson = await upRes.json();
          const photoUrl = uJson.url || uJson.file_url || localUri;

          // Attach to session
          await fetch(`${API_BASE_URL}/api/aufmass-photos`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
            },
            body: JSON.stringify({
              session_id: activeSession.id,
              url: photoUrl,
              caption: 'Zdjęcie z aplikacji mobilnej',
            }),
          });

          setSessionPhotos((prev) => [...prev, { id: `pho-${Date.now()}`, session_id: activeSession.id, url: photoUrl }]);
          Alert.alert('Dodano', 'Zdjęcie dołączone do protokołu.');
        }
      }
    } catch (err: any) {
      Alert.alert('Błąd', err?.message || 'Nie udało się dołączyć zdjęcia.');
    }
  };

  // Add Item / Labor
  const handleSaveItem = async () => {
    if (!activeSession) return;
    try {
      setSavingItem(true);
      const { data: { session } } = await authSupabase.auth.getSession();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      };

      if (addItemType === 'material') {
        if (!matName.trim()) {
          Alert.alert('Błąd', 'Podaj nazwę materiału.');
          return;
        }
        const qty = parseFloat(matQty) || 1;
        const res = await fetch(`${API_BASE_URL}/api/aufmass/materials`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            session_id: activeSession.id,
            name: matName.trim(),
            unit: matUnit.trim() || 'st.',
            quantity: qty,
          }),
        });
        if (res.ok) {
          const json = await res.json();
          setSessionMaterials((prev) => [...prev, json?.data || { id: `mat-${Date.now()}`, session_id: activeSession.id, name: matName, unit: matUnit, quantity: qty }]);
        }
      } else {
        if (!laborDesc.trim()) {
          Alert.alert('Błąd', 'Podaj opis wykonanych prac.');
          return;
        }
        const hrs = parseFloat(laborHours) || 1;
        const wCount = parseInt(laborWorkers, 10) || 1;
        const res = await fetch(`${API_BASE_URL}/api/aufmass/labor`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            session_id: activeSession.id,
            description: laborDesc.trim(),
            hours: hrs,
            worker_count: wCount,
            date: new Date().toISOString().split('T')[0],
          }),
        });
        if (res.ok) {
          const json = await res.json();
          setSessionLabor((prev) => [...prev, json?.data || { id: `lab-${Date.now()}`, session_id: activeSession.id, description: laborDesc, hours: hrs, worker_count: wCount }]);
        }
      }

      setShowAddItemModal(false);
      setMatName('');
      setLaborDesc('');
    } catch (e: any) {
      Alert.alert('Błąd', e?.message || 'Nie udało się dodać pozycji.');
    } finally {
      setSavingItem(false);
    }
  };

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (selectedType !== 'all' && s.session_type !== selectedType) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = s.name?.toLowerCase().includes(q);
        const matchProj = s.projects?.name?.toLowerCase().includes(q);
        const matchClient = s.client_name?.toLowerCase().includes(q);
        if (!matchName && !matchProj && !matchClient) return false;
      }
      return true;
    });
  }, [sessions, selectedType, search]);

  const getTypeTheme = (type: AufmassType) => {
    switch (type) {
      case 'zusatz':
        return { label: 'Zusatzarbeit (Prace dodatkowe)', icon: '➕', color: '#F59E0B' };
      case 'baubehinderung':
        return { label: 'Baubehinderung (Utrudnienia)', icon: '🚧', color: '#EF4444' };
      case 'bestellung':
        return { label: 'Bestellung (Zamówienie)', icon: '📦', color: '#10B981' };
      case 'fragen':
        return { label: 'Fragen (Pytania)', icon: '❓', color: '#8B5CF6' };
      default:
        return { label: 'Aufmaß (Pomiary powykonawcze)', icon: '📏', color: '#0284C7' };
    }
  };

  const renderSessionItem = ({ item }: { item: AufmassSession }) => {
    const theme = getTypeTheme(item.session_type);

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => openSessionDetails(item)}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.typeBadge, { backgroundColor: `${theme.color}20`, borderColor: theme.color }]}>
            <Text style={{ fontSize: 13, marginRight: 4 }}>{theme.icon}</Text>
            <Text style={[styles.typeBadgeText, { color: theme.color }]}>{theme.label.split(' ')[0]}</Text>
          </View>
          <Text style={styles.dateText}>{item.created_at?.split('T')[0] || ''}</Text>
        </View>

        <Text style={styles.sessionTitle}>{item.name}</Text>
        <Text style={styles.projectSubtitle}>
          🏢 {item.projects?.name || 'Projekt'} {item.plans?.name ? `• 📐 ${item.plans.name}` : ''}
        </Text>

        {item.client_name ? (
          <Text style={styles.clientText}>👤 Klient / Zleceniodawca: {item.client_name}</Text>
        ) : null}

        <View style={styles.cardFooter}>
          <Text style={styles.actionDetailsLink}>Otwórz protokół & pozycje →</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{
          title: t('aufmass', '📏 Aufmaß & Protokoły Budowlane'),
          headerShown: true,
          headerBackTitle: 'Wróć',
          headerStyle: { backgroundColor: '#0B0F19' },
          headerTintColor: '#38BDF8',
          headerTitleStyle: { color: '#F8FAFC', fontWeight: '800' },
          headerRight: () => (
            <TouchableOpacity
              style={styles.headerAddBtn}
              onPress={() => {
                setShowCreateModal(true);
                loadProjectsAndPlans();
              }}
            >
              <Text style={styles.headerAddBtnText}>+ Nowy Protokół</Text>
            </TouchableOpacity>
          ),
        }}
      />

      {/* Type Filter Bar */}
      <View style={styles.filterSection}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
          {[
            { id: 'all', label: 'Wszystkie', icon: '📋' },
            { id: 'aufmass', label: 'Aufmaß', icon: '📏' },
            { id: 'zusatz', label: 'Zusatzarbeit', icon: '➕' },
            { id: 'baubehinderung', label: 'Baubehinderung', icon: '🚧' },
            { id: 'bestellung', label: 'Bestellung', icon: '📦' },
            { id: 'fragen', label: 'Fragen', icon: '❓' },
          ].map((cat) => (
            <TouchableOpacity
              key={cat.id}
              style={[styles.chip, selectedType === cat.id && styles.chipActive]}
              onPress={() => setSelectedType(cat.id)}
            >
              <Text style={{ fontSize: 12, marginRight: 4 }}>{cat.icon}</Text>
              <Text style={[styles.chipText, selectedType === cat.id && styles.chipTextActive]}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <TextInput
          style={styles.searchInput}
          placeholder="Szukaj protokołu (nazwa, projekt, klient)..."
          placeholderTextColor="#64748B"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Main List */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#38BDF8" />
          <Text style={styles.loadingText}>Ładowanie protokołów Aufmaß...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredSessions}
          keyExtractor={(item) => item.id}
          renderItem={renderSessionItem}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#38BDF8" />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={{ fontSize: 44, marginBottom: 10 }}>📏</Text>
              <Text style={styles.emptyTitle}>Brak protokołów w tej kategorii</Text>
              <Text style={styles.emptySub}>
                Utwórz nowy protokół Aufmaß, Zusatzarbeit lub Baubehinderung przyciskiem powyżej.
              </Text>
            </View>
          }
        />
      )}

      {/* MODAL: SESSION DETAILS & ITEMS */}
      <Modal
        visible={!!activeSession}
        transparent
        animationType="slide"
        onRequestClose={() => setActiveSession(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.detailsModalCard}>
            <View style={styles.modalHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.detailsTitle}>{activeSession?.name}</Text>
                <Text style={styles.detailsSubtitle}>
                  🏢 {activeSession?.projects?.name || 'Projekt'} {activeSession?.plans?.name ? `• 📐 ${activeSession.plans.name}` : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setActiveSession(null)}>
                <Text style={styles.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>

            {detailsLoading ? (
              <ActivityIndicator color="#38BDF8" style={{ marginVertical: 30 }} />
            ) : (
              <ScrollView style={{ maxHeight: 420 }}>
                {/* Plan Link */}
                {activeSession?.plan_id && (
                  <TouchableOpacity
                    style={styles.planNavBtn}
                    onPress={() => {
                      const pId = activeSession.plan_id;
                      setActiveSession(null);
                      router.push({ pathname: '/plans/[id]', params: { id: pId } } as any);
                    }}
                  >
                    <Text style={styles.planNavBtnText}>🗺️ Otwórz Rzut 2D tego Aufmaß →</Text>
                  </TouchableOpacity>
                )}

                {/* Materials Section */}
                <View style={styles.sectionBlock}>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionTitle}>📦 MATERIAŁY ({sessionMaterials.length})</Text>
                    <TouchableOpacity
                      onPress={() => {
                        setAddItemType('material');
                        setShowAddItemModal(true);
                      }}
                    >
                      <Text style={styles.addMiniBtnText}>+ Dodaj materiał</Text>
                    </TouchableOpacity>
                  </View>
                  {sessionMaterials.length === 0 ? (
                    <Text style={styles.noItemsText}>Brak zarejestrowanych materiałów</Text>
                  ) : (
                    sessionMaterials.map((m) => (
                      <View key={m.id} style={styles.itemRow}>
                        <Text style={styles.itemRowTitle}>{m.name}</Text>
                        <Text style={styles.itemRowValue}>
                          {m.quantity} {m.unit}
                        </Text>
                      </View>
                    ))
                  )}
                </View>

                {/* Labor Section */}
                <View style={styles.sectionBlock}>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionTitle}>⏱️ ROBOCIZNA / GODZINY ({sessionLabor.length})</Text>
                    <TouchableOpacity
                      onPress={() => {
                        setAddItemType('labor');
                        setShowAddItemModal(true);
                      }}
                    >
                      <Text style={styles.addMiniBtnText}>+ Dodaj godziny</Text>
                    </TouchableOpacity>
                  </View>
                  {sessionLabor.length === 0 ? (
                    <Text style={styles.noItemsText}>Brak zarejestrowanych godzin pracy</Text>
                  ) : (
                    sessionLabor.map((l) => (
                      <View key={l.id} style={styles.itemRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.itemRowTitle}>{l.description}</Text>
                          <Text style={styles.itemRowSub}>{l.worker_count} pracowników</Text>
                        </View>
                        <Text style={styles.itemRowValue}>{l.hours} h</Text>
                      </View>
                    ))
                  )}
                </View>

                {/* Photos Section */}
                <View style={styles.sectionBlock}>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionTitle}>📸 ZDJĘCIA & DOKUMENTACJA ({sessionPhotos.length})</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity onPress={() => handleAddPhoto(true)}>
                        <Text style={styles.addMiniBtnText}>📷 Aparat</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleAddPhoto(false)}>
                        <Text style={styles.addMiniBtnText}>🖼️ Galeria</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  {sessionPhotos.length === 0 ? (
                    <Text style={styles.noItemsText}>Brak dołączonych zdjęć</Text>
                  ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                      {sessionPhotos.map((p) => (
                        <Image key={p.id} source={{ uri: p.url }} style={styles.photoThumb} />
                      ))}
                    </ScrollView>
                  )}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* MODAL: CREATE NEW AUFMASS SESSION */}
      <Modal
        visible={showCreateModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalHeading}>➕ Nowy Protokół Aufmaß</Text>

            <ScrollView style={{ maxHeight: 380 }}>
              <Text style={styles.inputLabel}>TYP PROTOKOŁU:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                {[
                  { id: 'aufmass', label: '📏 Aufmaß' },
                  { id: 'zusatz', label: '➕ Zusatzarbeit' },
                  { id: 'baubehinderung', label: '🚧 Baubehinderung' },
                  { id: 'bestellung', label: '📦 Bestellung' },
                  { id: 'fragen', label: '❓ Fragen' },
                ].map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.typeChip, newType === t.id && styles.typeChipActive]}
                    onPress={() => setNewType(t.id as AufmassType)}
                  >
                    <Text style={[styles.typeChipText, newType === t.id && styles.typeChipTextActive]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.inputLabel}>PROJEKT BUDOWLANY *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                {projects.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.projChip, newProjectId === p.id && styles.projChipActive]}
                    onPress={() => setNewProjectId(p.id)}
                  >
                    <Text style={[styles.projChipText, newProjectId === p.id && styles.projChipTextActive]}>
                      🏢 {p.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {plans.length > 0 && (
                <>
                  <Text style={styles.inputLabel}>RZUT / PLAN ARCHITEKTONICZNY</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                    {plans.map((pl) => (
                      <TouchableOpacity
                        key={pl.id}
                        style={[styles.projChip, newPlanId === pl.id && styles.projChipActive]}
                        onPress={() => setNewPlanId(pl.id)}
                      >
                        <Text style={[styles.projChipText, newPlanId === pl.id && styles.projChipTextActive]}>
                          📐 {pl.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              )}

              <Text style={styles.inputLabel}>NAZWA SESJI / PROTOKOŁU *</Text>
              <TextInput
                style={styles.input}
                placeholder="np. Pomiary koryt kablowych Halle 4, Prace dodatkowe..."
                placeholderTextColor="#64748B"
                value={newName}
                onChangeText={setNewName}
              />

              <Text style={styles.inputLabel}>KLIENT / ZAMAWIAJĄCY (OPCJONALNIE)</Text>
              <TextInput
                style={styles.input}
                placeholder="Imię i nazwisko / Firma klienta..."
                placeholderTextColor="#64748B"
                value={newClientName}
                onChangeText={setNewClientName}
              />

              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Telefon"
                  placeholderTextColor="#64748B"
                  value={newClientPhone}
                  onChangeText={setNewClientPhone}
                />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="E-mail"
                  placeholderTextColor="#64748B"
                  value={newClientEmail}
                  onChangeText={setNewClientEmail}
                />
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowCreateModal(false)}>
                <Text style={styles.cancelBtnText}>Anuluj</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleCreateSession} disabled={creating}>
                {creating ? <ActivityIndicator color="#0F172A" /> : <Text style={styles.saveBtnText}>Utwórz Protokół</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL: ADD ITEM / LABOR */}
      <Modal
        visible={showAddItemModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddItemModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalHeading}>
              {addItemType === 'material' ? '📦 Dodaj Materiał' : '⏱️ Dodaj Robociznę'}
            </Text>

            {addItemType === 'material' ? (
              <>
                <Text style={styles.inputLabel}>NAZWA MATERIAŁU *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="np. Kabeltrasse 200x60, Przewód NYM-J..."
                  placeholderTextColor="#64748B"
                  value={matName}
                  onChangeText={setMatName}
                />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>ILOŚĆ</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="numeric"
                      value={matQty}
                      onChangeText={setMatQty}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>JEDNOSTKA</Text>
                    <TextInput
                      style={styles.input}
                      value={matUnit}
                      onChangeText={setMatUnit}
                    />
                  </View>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.inputLabel}>OPIS WYKONANYCH PRAC *</Text>
                <TextInput
                  style={[styles.input, { height: 60, textAlignVertical: 'top' }]}
                  placeholder="np. Montaż tras kablowych, podłączenie rozdzielnicy..."
                  placeholderTextColor="#64748B"
                  value={laborDesc}
                  onChangeText={setLaborDesc}
                  multiline
                />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>LICZBA GODZIN (H)</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="numeric"
                      value={laborHours}
                      onChangeText={setLaborHours}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>LICZBA PRACOWNIKÓW</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="numeric"
                      value={laborWorkers}
                      onChangeText={setLaborWorkers}
                    />
                  </View>
                </View>
              </>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAddItemModal(false)}>
                <Text style={styles.cancelBtnText}>Anuluj</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveItem} disabled={savingItem}>
                {savingItem ? <ActivityIndicator color="#0F172A" /> : <Text style={styles.saveBtnText}>Zapisz pozycję</Text>}
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
  filterSection: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: '#0B0F19',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  chipScroll: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  chipActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    borderColor: '#38BDF8',
  },
  chipText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
  },
  chipTextActive: {
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
    marginBottom: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  dateText: {
    fontSize: 11,
    color: '#64748B',
  },
  sessionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 4,
  },
  projectSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 4,
  },
  clientText: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 6,
  },
  cardFooter: {
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingTop: 8,
    marginTop: 4,
  },
  actionDetailsLink: {
    fontSize: 12,
    fontWeight: '700',
    color: '#38BDF8',
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
  detailsModalCard: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  detailsTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  detailsSubtitle: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  closeBtn: {
    fontSize: 18,
    color: '#94A3B8',
    padding: 4,
  },
  planNavBtn: {
    backgroundColor: '#1E293B',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  planNavBtnText: {
    color: '#38BDF8',
    fontWeight: '800',
    fontSize: 13,
  },
  sectionBlock: {
    marginBottom: 14,
    backgroundColor: '#131D31',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
  },
  addMiniBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#38BDF8',
  },
  noItemsText: {
    fontSize: 12,
    color: '#64748B',
    fontStyle: 'italic',
    marginTop: 2,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  itemRowTitle: {
    fontSize: 13,
    color: '#F8FAFC',
    fontWeight: '600',
  },
  itemRowSub: {
    fontSize: 10,
    color: '#64748B',
  },
  itemRowValue: {
    fontSize: 13,
    color: '#38BDF8',
    fontWeight: '800',
  },
  photoThumb: {
    width: 64,
    height: 64,
    borderRadius: 6,
    marginRight: 6,
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
    marginTop: 6,
  },
  input: {
    backgroundColor: '#1E293B',
    color: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 8,
  },
  typeChip: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  typeChipActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    borderColor: '#38BDF8',
  },
  typeChipText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
  },
  typeChipTextActive: {
    color: '#38BDF8',
  },
  projChip: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  projChipActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    borderColor: '#38BDF8',
  },
  projChipText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
  },
  projChipTextActive: {
    color: '#38BDF8',
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
