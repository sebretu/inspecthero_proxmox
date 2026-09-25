import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  Image,
  Modal,
  TextInput,
  Alert,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { authSupabase } from '../../src/auth/authClient';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://inspecthero.pl';

interface CompanyOption {
  id: string;
  name: string;
  slug?: string;
}

interface ProjectOption {
  id: string;
  name: string;
  company_id?: string | null;
  companies?: { name: string } | null;
}

interface MaengelDocument {
  id: string;
  project_id: string;
  title: string;
  file_name?: string;
  status?: string;
  created_at?: string;
  items_count?: number;
}

interface MaengelItem {
  id: string;
  document_id: string;
  item_number?: string;
  title: string;
  description: string | null;
  trade?: string | null;
  location?: string | null;
  deadline?: string | null;
  status: 'OPEN' | 'IN_PROGRESS' | 'ZU_KLAEREN' | 'DONE' | 'NOT_RELEVANT';
  before_photo_url?: string | null;
  after_photo_url?: string | null;
  user_doc?: string | null;
  response_text?: string | null;
  created_at?: string;
}

export default function MaengelanzeigeScreen() {
  const router = useRouter();
  const { projectId: initialProjectId, docId: initialDocId } = useLocalSearchParams<{
    projectId?: string;
    docId?: string;
  }>();

  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(initialProjectId || '');
  const [documents, setDocuments] = useState<MaengelDocument[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>(initialDocId || '');
  const [items, setItems] = useState<MaengelItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scanning, setScanning] = useState(false);

  // Fullscreen Photo Lightbox
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Status Edit Modal
  const [editingItem, setEditingItem] = useState<MaengelItem | null>(null);
  const [responseNotes, setResponseNotes] = useState('');
  const [updating, setUpdating] = useState(false);

  const loadProjectsAndDocs = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { session } } = await authSupabase.auth.getSession();
      const headers: Record<string, string> = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {};

      // 0. Load Companies (Firmen)
      try {
        const cRes = await fetch(`${API_BASE_URL}/api/companies`, { headers });
        if (cRes.ok) {
          const cJson = await cRes.json();
          const cList = Array.isArray(cJson) ? cJson : (cJson?.data || []);
          setCompanies(cList);
        }
      } catch (cErr) {
        console.warn('[Maengelanzeige] Companies load error:', cErr);
      }

      // 1. Load Projects
      const pRes = await fetch(`${API_BASE_URL}/api/projects`, { headers });
      if (pRes.ok) {
        const pJson = await pRes.json();
        const pList = Array.isArray(pJson) ? pJson : (pJson?.data || []);
        setProjects(pList);
        if (!selectedProjectId && pList.length > 0) {
          setSelectedProjectId(pList[0].id);
        }
      }

      // 2. Load Documents for selected project
      const projIdToUse = selectedProjectId || (projects[0]?.id ?? '');
      if (projIdToUse) {
        const dRes = await fetch(`${API_BASE_URL}/api/maengelanzeige/documents?projectId=${encodeURIComponent(projIdToUse)}`, { headers });
        if (dRes.ok) {
          const dJson = await dRes.json();
          const dList = Array.isArray(dJson) ? dJson : (dJson?.data || []);
          setDocuments(dList);
          if (dList.length > 0 && !selectedDocId) {
            setSelectedDocId(dList[0].id);
          }
        }
      }
    } catch (err) {
      console.warn('[Maengelanzeige] Projects/Docs load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedProjectId]);

  const loadItems = useCallback(async () => {
    if (!selectedDocId) {
      setItems([]);
      return;
    }
    try {
      const { data: { session } } = await authSupabase.auth.getSession();
      const headers: Record<string, string> = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {};

      const iRes = await fetch(`${API_BASE_URL}/api/maengelanzeige/items?documentId=${encodeURIComponent(selectedDocId)}`, { headers });
      if (iRes.ok) {
        const iJson = await iRes.json();
        const iList = Array.isArray(iJson) ? iJson : (iJson?.data || []);
        setItems(iList);
      }
    } catch (err) {
      console.warn('[Maengelanzeige] Items load error:', err);
    }
  }, [selectedDocId]);

  useEffect(() => {
    loadProjectsAndDocs();
  }, [loadProjectsAndDocs]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const onRefresh = () => {
    setRefreshing(true);
    loadProjectsAndDocs().then(() => loadItems());
  };

  const updateItemStatus = async (item: MaengelItem, nextStatus: MaengelItem['status'], notes?: string) => {
    try {
      setUpdating(true);
      const { data: { session } } = await authSupabase.auth.getSession();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      };

      const payload = {
        id: item.id,
        status: nextStatus,
        response_text: notes !== undefined ? notes : item.response_text,
      };

      const res = await fetch(`${API_BASE_URL}/api/maengelanzeige/items`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, status: nextStatus, response_text: notes ?? i.response_text } : i))
        );
        setEditingItem(null);
      } else {
        Alert.alert('Błąd', 'Nie udało się zaktualizować statusu wady na serwerze.');
      }
    } catch (err: any) {
      Alert.alert('Błąd', err?.message || 'Błąd połączenia');
    } finally {
      setUpdating(false);
    }
  };

  const handleTakeDefectPhoto = async (item: MaengelItem) => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Brak uprawnień', 'Aplikacja potrzebuje dostępu do aparatu.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        quality: 0.8,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const localUri = result.assets[0].uri;
        // Upload photo to backend
        const { data: { session } } = await authSupabase.auth.getSession();
        const formData = new FormData();
        formData.append('photo', {
          uri: localUri,
          name: `mangel_${item.id}_${Date.now()}.jpg`,
          type: 'image/jpeg',
        } as any);
        formData.append('mangelId', item.id);

        const uploadRes = await fetch(`${API_BASE_URL}/api/upload`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session?.access_token || ''}`,
          },
          body: formData,
        });

        if (uploadRes.ok) {
          const uploadJson = await uploadRes.json();
          const publicUrl = uploadJson.url || uploadJson.data?.url || localUri;

          await fetch(`${API_BASE_URL}/api/maengelanzeige/items`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session?.access_token || ''}`,
            },
            body: JSON.stringify({
              id: item.id,
              after_photo_url: publicUrl,
              status: 'DONE',
            }),
          });

          setItems((prev) =>
            prev.map((i) => (i.id === item.id ? { ...i, after_photo_url: publicUrl, status: 'DONE' } : i))
          );
          Alert.alert('Sukces', 'Zdjęcie usunięcia wady zostało przesłane.');
        } else {
          // Fallback set local URI for immediate view
          setItems((prev) =>
            prev.map((i) => (i.id === item.id ? { ...i, after_photo_url: localUri, status: 'DONE' } : i))
          );
        }
      }
    } catch (err: any) {
      Alert.alert('Błąd', err?.message || 'Nie udało się dodać zdjęcia.');
    }
  };

  const getStatusInfo = (status: MaengelItem['status']) => {
    switch (status) {
      case 'DONE':
        return { label: 'USUNIĘTO / GOTOWE', bg: 'rgba(34, 197, 94, 0.15)', text: '#22C55E', icon: '✅' };
      case 'IN_PROGRESS':
        return { label: 'W TRAKCIE NAPRAWY', bg: 'rgba(234, 179, 8, 0.15)', text: '#EAB308', icon: '⏳' };
      case 'ZU_KLAEREN':
        return { label: 'DO WYJAŚNIENIA', bg: 'rgba(168, 85, 247, 0.15)', text: '#A855F7', icon: '❓' };
      case 'NOT_RELEVANT':
        return { label: 'NIE DOTYCZY', bg: 'rgba(100, 116, 139, 0.15)', text: '#94A3B8', icon: '🚫' };
      default:
        return { label: 'NOWA WADA (OPEN)', bg: 'rgba(239, 68, 68, 0.15)', text: '#EF4444', icon: '🚨' };
    }
  };

  const filteredItems = items.filter((item) => {
    if (statusFilter === 'ALL') return true;
    return item.status === statusFilter;
  });

  const visibleProjects = projects.filter((p) => {
    if (!selectedCompanyId) return true;
    return p.company_id === selectedCompanyId;
  });

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{
          title: 'Mängelanzeige (Protokoły Wad)',
          headerShown: true,
          headerBackTitle: 'Wróć',
          headerStyle: { backgroundColor: '#0B0F19' },
          headerTintColor: '#38BDF8',
          headerTitleStyle: { color: '#F8FAFC', fontWeight: '700' },
        }}
      />

      {/* 0. Company (Firma) Switcher Bar */}
      {companies.length > 0 && (
        <View style={[styles.topSelectorBar, { borderBottomWidth: 0, paddingBottom: 4 }]}>
          <Text style={styles.selectorLabel}>FIRMA / ZLECENIODAWCA:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scrollBar}>
            <TouchableOpacity
              style={[styles.projChip, !selectedCompanyId && styles.projChipActive]}
              onPress={() => {
                setSelectedCompanyId('');
              }}
            >
              <Text style={[styles.projChipText, !selectedCompanyId && styles.projChipTextActive]}>
                🏢 Wszystkie firmy
              </Text>
            </TouchableOpacity>
            {companies.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={[styles.projChip, selectedCompanyId === c.id && styles.projChipActive]}
                onPress={() => {
                  setSelectedCompanyId(c.id);
                  const matchingProj = projects.find((p) => p.company_id === c.id);
                  if (matchingProj) {
                    setSelectedProjectId(matchingProj.id);
                    setSelectedDocId('');
                  }
                }}
              >
                <Text style={[styles.projChipText, selectedCompanyId === c.id && styles.projChipTextActive]}>
                  🏢 {c.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* 1. Project Switcher Bar */}
      <View style={styles.topSelectorBar}>
        <Text style={styles.selectorLabel}>PROJEKT:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scrollBar}>
          {visibleProjects.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={[styles.projChip, selectedProjectId === p.id && styles.projChipActive]}
              onPress={() => {
                setSelectedProjectId(p.id);
                setSelectedDocId('');
              }}
            >
              <Text style={[styles.projChipText, selectedProjectId === p.id && styles.projChipTextActive]}>
                📁 {p.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* 2. Documents (Protokoły PDF) Switcher */}
      {documents.length > 0 && (
        <View style={styles.docSelectorBar}>
          <Text style={styles.selectorLabel}>PROTOKÓŁ PDF / DOKUMENT:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scrollBar}>
            {documents.map((d) => (
              <TouchableOpacity
                key={d.id}
                style={[styles.docChip, selectedDocId === d.id && styles.docChipActive]}
                onPress={() => setSelectedDocId(d.id)}
              >
                <Text style={[styles.docChipText, selectedDocId === d.id && styles.docChipTextActive]}>
                  📑 {d.title || d.file_name || 'Protokół wad'}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* 3. Status Filter Bar */}
      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {[
            { id: 'ALL', label: `Wszystkie (${items.length})` },
            { id: 'OPEN', label: `🚨 Otwarte (${items.filter((i) => i.status === 'OPEN').length})` },
            { id: 'IN_PROGRESS', label: `⏳ W trakcie (${items.filter((i) => i.status === 'IN_PROGRESS').length})` },
            { id: 'ZU_KLAEREN', label: `❓ Wyjaśnić (${items.filter((i) => i.status === 'ZU_KLAEREN').length})` },
            { id: 'DONE', label: `✅ Zrobione (${items.filter((i) => i.status === 'DONE').length})` },
          ].map((f) => (
            <TouchableOpacity
              key={f.id}
              style={[styles.filterChip, statusFilter === f.id && styles.filterChipActive]}
              onPress={() => setStatusFilter(f.id)}
            >
              <Text style={[styles.filterChipText, statusFilter === f.id && styles.filterChipTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* 4. Main Defect List */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#38BDF8" />
          <Text style={styles.loadingText}>Ładowanie protokołów i wad...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredItems}
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
              <Text style={styles.emptyTitle}>Brak pozycji wad</Text>
              <Text style={styles.emptySubtitle}>
                {documents.length === 0
                  ? 'Brak wgranych dokumentów Mängelanzeige dla tego projektu.'
                  : 'Wszystkie wady w tym protokole zostały zrealizowane.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const statusInfo = getStatusInfo(item.status);
            return (
              <View style={styles.itemCard}>
                {/* Header */}
                <View style={styles.itemCardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemNumberText}>
                      {item.item_number ? `#${item.item_number} • ` : ''}{item.trade || 'Branża el.'}
                    </Text>
                    <Text style={styles.itemTitleText}>{item.title}</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}
                    onPress={() => {
                      setEditingItem(item);
                      setResponseNotes(item.response_text || '');
                    }}
                  >
                    <Text style={[styles.statusBadgeText, { color: statusInfo.text }]}>
                      {statusInfo.icon} {statusInfo.label}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Location & Deadline */}
                {(item.location || item.deadline) && (
                  <View style={styles.metaRow}>
                    {item.location ? <Text style={styles.metaBadge}>📍 {item.location}</Text> : null}
                    {item.deadline ? <Text style={styles.metaBadgeDeadline}>⏱️ Termin: {item.deadline}</Text> : null}
                  </View>
                )}

                {/* Description */}
                {item.description ? (
                  <Text style={styles.descText}>{item.description}</Text>
                ) : null}

                {/* Response notes */}
                {item.response_text ? (
                  <View style={styles.responseBox}>
                    <Text style={styles.responseHeading}>ODPOWIEDŹ / PROTOKÓŁ NAPRAWY:</Text>
                    <Text style={styles.responseText}>{item.response_text}</Text>
                  </View>
                ) : null}

                {/* Photos Row */}
                <View style={styles.photosSection}>
                  {item.before_photo_url ? (
                    <TouchableOpacity
                      style={styles.photoThumbWrapper}
                      onPress={() => setLightboxUrl(item.before_photo_url!)}
                    >
                      <Image source={{ uri: item.before_photo_url }} style={styles.photoThumb} />
                      <Text style={styles.photoLabel}>📸 Przed (PDF)</Text>
                    </TouchableOpacity>
                  ) : null}

                  {item.after_photo_url ? (
                    <TouchableOpacity
                      style={styles.photoThumbWrapper}
                      onPress={() => setLightboxUrl(item.after_photo_url!)}
                    >
                      <Image source={{ uri: item.after_photo_url }} style={styles.photoThumb} />
                      <Text style={[styles.photoLabel, { color: '#22C55E' }]}>📸 Po naprawie</Text>
                    </TouchableOpacity>
                  ) : null}

                  {/* Add Photo Button */}
                  <TouchableOpacity
                    style={styles.addPhotoBtn}
                    onPress={() => handleTakeDefectPhoto(item)}
                  >
                    <Text style={styles.addPhotoIcon}>📷</Text>
                    <Text style={styles.addPhotoText}>Dodaj foto</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* 5. Lightbox Modal */}
      <Modal visible={!!lightboxUrl} transparent animationType="fade" onRequestClose={() => setLightboxUrl(null)}>
        <View style={styles.lightboxOverlay}>
          <TouchableOpacity style={styles.lightboxCloseBtn} onPress={() => setLightboxUrl(null)}>
            <Text style={styles.lightboxCloseText}>✕ ZAMKNIJ</Text>
          </TouchableOpacity>
          {lightboxUrl && (
            <Image source={{ uri: lightboxUrl }} style={styles.lightboxImage} resizeMode="contain" />
          )}
        </View>
      </Modal>

      {/* 6. Edit Status & Response Modal */}
      <Modal visible={!!editingItem} transparent animationType="slide" onRequestClose={() => setEditingItem(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>📝 Zmień status wady</Text>
            <Text style={styles.modalSubtitle}>{editingItem?.title}</Text>

            <Text style={styles.modalFieldLabel}>STATUS WADY:</Text>
            <View style={styles.statusButtonsGrid}>
              {[
                { id: 'OPEN', label: '🚨 OTWARTA', color: '#EF4444' },
                { id: 'IN_PROGRESS', label: '⏳ W TRAKCIE', color: '#EAB308' },
                { id: 'ZU_KLAEREN', label: '❓ DO WYJAŚNIENIA', color: '#A855F7' },
                { id: 'DONE', label: '✅ USUNIĘTO', color: '#22C55E' },
              ].map((st) => (
                <TouchableOpacity
                  key={st.id}
                  style={[
                    styles.statusSelectBtn,
                    editingItem?.status === st.id && { borderColor: st.color, backgroundColor: `${st.color}20` },
                  ]}
                  onPress={() => {
                    if (editingItem) {
                      setEditingItem({ ...editingItem, status: st.id as any });
                    }
                  }}
                >
                  <Text style={[styles.statusSelectBtnText, { color: st.color }]}>{st.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.modalFieldLabel}>NOTATKA / WYJAŚNIENIE USUNIĘCIA WADY:</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Wpisz jak wada została naprawiona..."
              placeholderTextColor="#64748B"
              value={responseNotes}
              onChangeText={setResponseNotes}
              multiline
            />

            <View style={styles.modalActionsRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setEditingItem(null)}>
                <Text style={styles.modalCancelBtnText}>Anuluj</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveBtn}
                disabled={updating}
                onPress={() => {
                  if (editingItem) {
                    updateItemStatus(editingItem, editingItem.status, responseNotes);
                  }
                }}
              >
                <Text style={styles.modalSaveBtnText}>{updating ? 'Zapisywanie...' : 'Zapisz status'}</Text>
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
  topSelectorBar: {
    backgroundColor: '#0B0F19',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  docSelectorBar: {
    backgroundColor: '#080E1E',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  selectorLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#38BDF8',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  scrollBar: {
    flexDirection: 'row',
  },
  projChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#1E293B',
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  projChipActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    borderColor: '#38BDF8',
  },
  projChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },
  projChipTextActive: {
    color: '#38BDF8',
  },
  docChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#0F172A',
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  docChipActive: {
    backgroundColor: 'rgba(168, 85, 247, 0.2)',
    borderColor: '#A855F7',
  },
  docChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  },
  docChipTextActive: {
    color: '#C084FC',
  },
  filterBar: {
    backgroundColor: '#030712',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#0F172A',
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  filterChipActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    borderColor: '#38BDF8',
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  },
  filterChipTextActive: {
    color: '#38BDF8',
    fontWeight: '700',
  },
  list: {
    padding: 12,
    paddingBottom: 40,
  },
  itemCard: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  itemCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  itemNumberText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#38BDF8',
    textTransform: 'uppercase',
  },
  itemTitleText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 8,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  metaRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  metaBadge: {
    fontSize: 10,
    color: '#94A3B8',
    backgroundColor: '#0B132B',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  metaBadgeDeadline: {
    fontSize: 10,
    color: '#EF4444',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontWeight: '700',
  },
  descText: {
    fontSize: 12,
    color: '#CBD5E1',
    lineHeight: 18,
    marginBottom: 8,
  },
  responseBox: {
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    borderLeftWidth: 3,
    borderLeftColor: '#38BDF8',
    padding: 8,
    borderRadius: 6,
    marginBottom: 8,
  },
  responseHeading: {
    fontSize: 9,
    fontWeight: '800',
    color: '#38BDF8',
    marginBottom: 2,
  },
  responseText: {
    fontSize: 11,
    color: '#F8FAFC',
  },
  photosSection: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  photoThumbWrapper: {
    alignItems: 'center',
  },
  photoThumb: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#1E293B',
  },
  photoLabel: {
    fontSize: 9,
    color: '#94A3B8',
    marginTop: 2,
    fontWeight: '700',
  },
  addPhotoBtn: {
    width: 60,
    height: 60,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#38BDF8',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.05)',
  },
  addPhotoIcon: {
    fontSize: 18,
  },
  addPhotoText: {
    fontSize: 9,
    color: '#38BDF8',
    fontWeight: '700',
    marginTop: 2,
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
    fontSize: 13,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
  },
  lightboxOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxCloseBtn: {
    position: 'absolute',
    top: 48,
    right: 20,
    backgroundColor: '#0F172A',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    zIndex: 10,
  },
  lightboxCloseText: {
    color: '#38BDF8',
    fontWeight: '800',
    fontSize: 12,
  },
  lightboxImage: {
    width: SCREEN_WIDTH - 20,
    height: '80%',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 2,
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 14,
  },
  modalFieldLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#38BDF8',
    marginBottom: 6,
  },
  statusButtonsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  statusSelectBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#1E293B',
  },
  statusSelectBtnText: {
    fontSize: 11,
    fontWeight: '800',
  },
  modalInput: {
    backgroundColor: '#030712',
    color: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    height: 80,
    textAlignVertical: 'top',
    fontSize: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 16,
  },
  modalActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  modalCancelBtnText: {
    color: '#94A3B8',
    fontWeight: '700',
    fontSize: 12,
  },
  modalSaveBtn: {
    backgroundColor: '#38BDF8',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  modalSaveBtnText: {
    color: '#030712',
    fontWeight: '800',
    fontSize: 12,
  },
});
