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
  Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { authSupabase } from '../../src/auth/authClient';
import { useLanguage } from '../../src/i18n/LanguageContext';
import { useAuth } from '../../src/auth/useAuth';

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

export interface MaengelPhoto {
  id: string;
  url: string;
  caption?: string | null;
  photo_type?: 'BEFORE' | 'AFTER' | 'GENERAL' | null;
  created_at?: string;
}

export interface MaengelItem {
  id: string;
  document_id: string;
  project_id?: string;
  item_number: string;
  trade_or_company?: string | null; // e.g. KDSK, ETEC, Philips, Elektro, BMA
  location?: string | null; // e.g. 1.OG Raum 102
  page_number: number;
  original_text: string;
  ai_relevance?: string;
  is_selected?: boolean;
  our_documentation?: string | null; // Bauleitung / Admin Notizen (Protected)
  user_documentation?: string | null; // Protokół naprawy / Kommentar durch Mitarbeiter (Editable by Worker)
  status: 'OPEN' | 'IN_PROGRESS' | 'ZU_KLAEREN' | 'DONE' | 'NOT_RELEVANT';
  created_at?: string;
  photos?: MaengelPhoto[];
}

export default function MaengelanzeigeScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const { isAdmin, isMod } = useAuth();
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
  const [tradeFilter, setTradeFilter] = useState<string>('ALL');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Fullscreen Photo Lightbox
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Photo Source Selection Sheet (Vorher vs Nachher / Kamera vs Galerie)
  const [photoTarget, setPhotoTarget] = useState<{ item: MaengelItem; type: 'BEFORE' | 'AFTER' } | null>(null);

  // Status & Comment Edit Modal
  const [editingItem, setEditingItem] = useState<MaengelItem | null>(null);
  const [userDocText, setUserDocText] = useState('');
  const [adminDocText, setAdminDocText] = useState('');
  const [selectedNextStatus, setSelectedNextStatus] = useState<MaengelItem['status']>('OPEN');
  const [updating, setUpdating] = useState(false);

  const loadProjectsAndDocs = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { session } } = await authSupabase.auth.getSession();
      const headers: Record<string, string> = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {};

      // 0. Load Companies (Firmen / Zleceniodawcy)
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
        const formatted: MaengelItem[] = (iList || []).map((i: any) => ({
          id: i.id,
          document_id: i.document_id,
          project_id: i.project_id,
          item_number: i.item_number ? String(i.item_number) : '',
          trade_or_company: i.trade_or_company || i.trade || null,
          location: i.location || null,
          page_number: i.page_number || 1,
          original_text: i.original_text || i.description || i.title || 'Keine Mängelbeschreibung vorhanden',
          our_documentation: i.our_documentation || null,
          user_documentation: i.user_documentation || i.response_text || null,
          status: i.status || 'OPEN',
          photos: (i.photos || i.maengelanzeige_photos || []).map((p: any) => {
            let pt = p.photo_type;
            if (!pt) {
              if (p.caption?.includes('[NACHHER]')) pt = 'AFTER';
              else if (p.caption?.includes('[VORHER]')) pt = 'BEFORE';
              else pt = 'BEFORE';
            }
            return {
              id: p.id,
              url: p.url,
              caption: p.caption || null,
              photo_type: pt,
              created_at: p.created_at,
            };
          }),
          created_at: i.created_at,
        }));
        setItems(formatted);
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

  const updateItemDetails = async (
    item: MaengelItem,
    nextStatus: MaengelItem['status'],
    userDoc?: string,
    adminDoc?: string
  ) => {
    try {
      setUpdating(true);
      const { data: { session } } = await authSupabase.auth.getSession();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      };

      const payload: Record<string, any> = {
        id: item.id,
        status: nextStatus,
        user_documentation: userDoc !== undefined ? userDoc : item.user_documentation,
      };

      // Only allow updating Bauleitung / Admin notes if role is Admin or Mod
      if (isAdmin || isMod) {
        payload.our_documentation = adminDoc !== undefined ? adminDoc : item.our_documentation;
      }

      const res = await fetch(`${API_BASE_URL}/api/maengelanzeige/items`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? {
                  ...i,
                  status: nextStatus,
                  user_documentation: userDoc !== undefined ? userDoc : i.user_documentation,
                  our_documentation: isAdmin || isMod ? (adminDoc !== undefined ? adminDoc : i.our_documentation) : i.our_documentation,
                }
              : i
          )
        );
        setEditingItem(null);
      } else {
        Alert.alert('Fehler', 'Status konnte auf dem Server nicht aktualisiert werden.');
      }
    } catch (err: any) {
      Alert.alert('Fehler', err?.message || 'Verbindungsfehler');
    } finally {
      setUpdating(false);
    }
  };

  const executePhotoUpload = async (
    item: MaengelItem,
    useCamera: boolean,
    photoType: 'BEFORE' | 'AFTER'
  ) => {
    setPhotoTarget(null);
    try {
      let result;
      if (useCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Berechtigung erforderlich', 'Aktivieren Sie den Kamerazugriff in den Einstellungen.');
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          quality: 0.7,
          base64: true,
          allowsEditing: false,
        });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({
          quality: 0.7,
          base64: true,
          allowsEditing: false,
        });
      }

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        let base64 = asset.base64;
        if (!base64 && asset.uri) {
          base64 = await FileSystem.readAsStringAsync(asset.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
        }

        if (!base64) {
          Alert.alert('Fehler', 'Foto konnte nicht geladen werden.');
          return;
        }

        setLoading(true);
        const { data: { session } } = await authSupabase.auth.getSession();
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        };

        const payload = {
          itemId: item.id,
          imageBase64: base64,
          fileName: `mangel_${item.id}_${photoType.toLowerCase()}_${Date.now()}.jpg`,
          caption: photoType === 'AFTER' ? '[NACHHER] Mangel behoben' : '[VORHER] Mangelaufnahme',
          photoType,
        };

        const res = await fetch(`${API_BASE_URL}/api/maengelanzeige/photos`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const photoJson = await res.json();
          const newPhoto = photoJson?.data || photoJson;
          setItems((prev) =>
            prev.map((i) => {
              if (i.id === item.id) {
                const cur = i.photos || [];
                return {
                  ...i,
                  status: photoType === 'AFTER' && i.status === 'OPEN' ? 'IN_PROGRESS' : i.status,
                  photos: [...cur, newPhoto],
                };
              }
              return i;
            })
          );
          Alert.alert(
            'Erfolg',
            `${photoType === 'AFTER' ? 'Nachher-Foto' : 'Vorher-Foto'} wurde erfolgreich hochgeladen!`
          );
        } else {
          Alert.alert('Fehler', 'Upload des Fotos fehlgeschlagen.');
        }
      }
    } catch (err: any) {
      Alert.alert('Fehler', err?.message || 'Upload-Fehler');
    } finally {
      setLoading(false);
    }
  };

  const getStatusInfo = (status: MaengelItem['status']) => {
    switch (status) {
      case 'OPEN':
        return { label: '🚨 OFFEN', bg: '#EF444425', text: '#EF4444', icon: '🚨' };
      case 'IN_PROGRESS':
        return { label: '⏳ IN BEARBEITUNG', bg: '#EAB30825', text: '#EAB308', icon: '⏳' };
      case 'ZU_KLAEREN':
        return { label: '❓ ZU KLÄREN', bg: '#A855F725', text: '#A855F7', icon: '❓' };
      case 'DONE':
        return { label: '✅ BEHOBEN', bg: '#22C55E25', text: '#22C55E', icon: '✅' };
      default:
        return { label: 'NICHT RELEVANT', bg: '#64748B25', text: '#94A3B8', icon: '⚪' };
    }
  };

  const getTradeColor = (trade?: string | null) => {
    if (!trade) return { bg: 'rgba(56, 189, 248, 0.15)', text: '#38BDF8', border: '#38BDF8' };
    const tUp = trade.toUpperCase();
    if (tUp.includes('KDSK')) return { bg: 'rgba(245, 158, 11, 0.2)', text: '#F59E0B', border: '#F59E0B' };
    if (tUp.includes('ETEC')) return { bg: 'rgba(56, 189, 248, 0.2)', text: '#38BDF8', border: '#38BDF8' };
    if (tUp.includes('PHILIPS')) return { bg: 'rgba(168, 85, 247, 0.2)', text: '#C084FC', border: '#A855F7' };
    if (tUp.includes('ELEKTRO') || tUp.includes('EL')) return { bg: 'rgba(59, 130, 246, 0.2)', text: '#60A5FA', border: '#3B82F6' };
    if (tUp.includes('BMA') || tUp.includes('BRAND')) return { bg: 'rgba(239, 68, 68, 0.2)', text: '#F87171', border: '#EF4444' };
    if (tUp.includes('HKLS') || tUp.includes('HEIZ') || tUp.includes('SAN')) return { bg: 'rgba(6, 182, 212, 0.2)', text: '#22D3EE', border: '#06B6D4' };
    if (tUp.includes('TROCKEN') || tUp.includes('BAU')) return { bg: 'rgba(16, 185, 129, 0.2)', text: '#34D399', border: '#10B981' };
    return { bg: 'rgba(148, 163, 184, 0.2)', text: '#CBD5E1', border: '#64748B' };
  };

  const visibleProjects = projects.filter((p) => {
    if (!selectedCompanyId) return true;
    return p.company_id === selectedCompanyId;
  });

  const uniqueTrades = Array.from(new Set(items.map((i) => i.trade_or_company).filter(Boolean))) as string[];

  const filteredItems = items.filter((item) => {
    if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;
    if (tradeFilter !== 'ALL' && item.trade_or_company !== tradeFilter) return false;
    return true;
  });

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{
          title: 'Mängelanzeige (Protokoły Wad)',
          headerShown: true,
          headerBackTitle: 'Zurück',
          headerStyle: { backgroundColor: '#0B0F19' },
          headerTintColor: '#38BDF8',
          headerTitleStyle: { color: '#F8FAFC', fontWeight: '800' },
        }}
      />

      {/* 0. Company (Firma / Auftraggeber) Filter Bar */}
      {companies.length > 0 && (
        <View style={[styles.topSelectorBar, { borderBottomWidth: 0, paddingBottom: 4 }]}>
          <Text style={styles.selectorLabel}>FIRMA / AUFTRAGGEBER:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scrollBar}>
            <TouchableOpacity
              style={[styles.projChip, !selectedCompanyId && styles.projChipActive]}
              onPress={() => setSelectedCompanyId('')}
            >
              <Text style={[styles.projChipText, !selectedCompanyId && styles.projChipTextActive]}>
                🏢 Alle Firmen ({companies.length})
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
          <Text style={styles.selectorLabel}>PROTOKOLL-DOKUMENT (PDF):</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scrollBar}>
            {documents.map((d) => (
              <TouchableOpacity
                key={d.id}
                style={[styles.docChip, selectedDocId === d.id && styles.docChipActive]}
                onPress={() => setSelectedDocId(d.id)}
              >
                <Text style={[styles.docChipText, selectedDocId === d.id && styles.docChipTextActive]}>
                  📑 {d.title || d.file_name || 'Mängelprotokoll'}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* 3. Trade Filter Bar (KDSK, ETEC, Philips, etc.) */}
      {uniqueTrades.length > 0 && (
        <View style={[styles.tradeFilterBar]}>
          <Text style={styles.selectorLabel}>GEWERK / FIRMA (KDSK, ETEC, PHILIPS...):</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scrollBar}>
            <TouchableOpacity
              style={[styles.tradeChip, tradeFilter === 'ALL' && styles.tradeChipActive]}
              onPress={() => setTradeFilter('ALL')}
            >
              <Text style={[styles.tradeChipText, tradeFilter === 'ALL' && styles.tradeChipTextActive]}>
                Alle Gewerke ({items.length})
              </Text>
            </TouchableOpacity>
            {uniqueTrades.map((tr) => {
              const tc = getTradeColor(tr);
              const isActive = tradeFilter === tr;
              return (
                <TouchableOpacity
                  key={tr}
                  style={[
                    styles.tradeChip,
                    { borderColor: tc.border, backgroundColor: isActive ? tc.bg : '#0F172A' },
                  ]}
                  onPress={() => setTradeFilter(tr)}
                >
                  <Text style={[styles.tradeChipText, { color: isActive ? '#FFFFFF' : tc.text, fontWeight: '800' }]}>
                    🏢 {tr}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* 4. Status Filter Bar */}
      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {[
            { id: 'ALL', label: `Alle (${items.length})` },
            { id: 'OPEN', label: `🚨 Offen (${items.filter((i) => i.status === 'OPEN').length})` },
            { id: 'IN_PROGRESS', label: `⏳ In Bearbeitung (${items.filter((i) => i.status === 'IN_PROGRESS').length})` },
            { id: 'ZU_KLAEREN', label: `❓ Zu klären (${items.filter((i) => i.status === 'ZU_KLAEREN').length})` },
            { id: 'DONE', label: `✅ Behoben (${items.filter((i) => i.status === 'DONE').length})` },
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

      {/* 5. Main Defect List (1:1 Web Parity) */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#38BDF8" />
          <Text style={styles.loadingText}>Mängelprotokolle werden geladen...</Text>
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
              <Text style={styles.emptyTitle}>Keine Mängeleinträge vorhanden</Text>
              <Text style={styles.emptySubtitle}>
                {documents.length === 0
                  ? 'Keine Mängelanzeige-Dokumente für dieses Projekt hochgeladen.'
                  : 'Alle Mängel in diesem Protokoll entsprechen den gewählten Filtern.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const statusInfo = getStatusInfo(item.status);
            const tradeColor = getTradeColor(item.trade_or_company);

            const beforePhotos = (item.photos || []).filter(
              (p) => p.photo_type === 'BEFORE' || (!p.photo_type && p.caption?.includes('[VORHER]'))
            );
            const afterPhotos = (item.photos || []).filter(
              (p) => p.photo_type === 'AFTER' || (!p.photo_type && p.caption?.includes('[NACHHER]'))
            );
            const generalPhotos = (item.photos || []).filter(
              (p) => p.photo_type === 'GENERAL' || (!beforePhotos.includes(p) && !afterPhotos.includes(p))
            );

            return (
              <View style={styles.itemCard}>
                {/* 1. Header Bar: Item Number, Trade/Company badge, Page, and Status */}
                <View style={styles.itemCardHeader}>
                  <View style={styles.headerBadgesRow}>
                    <View style={styles.itemNumBadge}>
                      <Text style={styles.itemNumberText}>
                        #{item.item_number || 'Pos'}
                      </Text>
                    </View>

                    {item.trade_or_company ? (
                      <View
                        style={[
                          styles.tradeBadge,
                          { backgroundColor: tradeColor.bg, borderColor: tradeColor.border },
                        ]}
                      >
                        <Text style={[styles.tradeBadgeText, { color: tradeColor.text }]}>
                          🏢 {item.trade_or_company}
                        </Text>
                      </View>
                    ) : null}

                    <View style={styles.pageBadge}>
                      <Text style={styles.pageBadgeText}>📄 S. {item.page_number}</Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.statusBadge, { backgroundColor: statusInfo.bg, borderColor: statusInfo.text }]}
                    onPress={() => {
                      setEditingItem(item);
                      setSelectedNextStatus(item.status);
                      setUserDocText(item.user_documentation || '');
                      setAdminDocText(item.our_documentation || '');
                    }}
                  >
                    <Text style={[styles.statusBadgeText, { color: statusInfo.text }]}>
                      {statusInfo.icon} {statusInfo.label}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* 2. Location (Ort / Raum / Bauteil) */}
                {item.location ? (
                  <View style={styles.locationRow}>
                    <Text style={styles.locationBadge}>📍 {item.location}</Text>
                  </View>
                ) : null}

                {/* 3. Original Mangel Description (Originaltext aus Mängelanzeige) */}
                <View style={styles.descBox}>
                  <Text style={styles.descHeading}>MANGELBESCHREIBUNG / OPIS WADY:</Text>
                  <Text style={styles.descText}>{item.original_text}</Text>
                </View>

                {/* 4. Bauleitung / Admin Dokumentation (Protected for regular workers) */}
                {item.our_documentation ? (
                  <View style={styles.adminDocBox}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                      <Text style={styles.adminDocHeading}>👑 BAULEITUNG DOKUMENTATION:</Text>
                      <Text style={{ fontSize: 10, color: '#EAB308', fontWeight: '700' }}>🔒 Admin</Text>
                    </View>
                    <Text style={styles.adminDocText}>{item.our_documentation}</Text>
                  </View>
                ) : null}

                {/* 5. Mitarbeiter Protokoll / Rückmeldung */}
                {item.user_documentation ? (
                  <View style={styles.userDocBox}>
                    <Text style={styles.userDocHeading}>🛠️ PROTOKOLL / RÜCKMELDUNG ZUR BEHEBUNG (MITARBEITER):</Text>
                    <Text style={styles.userDocText}>{item.user_documentation}</Text>
                  </View>
                ) : null}

                {/* 6. Photos Section: VORHER (Przed) & NACHHER (Po naprawie) */}
                <View style={styles.photosContainer}>
                  {/* Before Photos */}
                  {beforePhotos.length > 0 && (
                    <View style={styles.photoGroup}>
                      <Text style={styles.photoGroupTitle}>📸 VORHER (PDF / Aufnahme):</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoThumbList}>
                        {beforePhotos.map((p) => (
                          <TouchableOpacity
                            key={p.id}
                            style={styles.photoThumbWrapper}
                            onPress={() => setLightboxUrl(p.url)}
                          >
                            <Image source={{ uri: p.url }} style={styles.photoThumb} />
                            <Text style={styles.photoLabel} numberOfLines={1}>
                              {p.caption?.replace('[VORHER]', '').trim() || 'Vorher'}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}

                  {/* After Photos */}
                  {afterPhotos.length > 0 && (
                    <View style={styles.photoGroup}>
                      <Text style={[styles.photoGroupTitle, { color: '#22C55E' }]}>📸 NACHHER (Behebung / Po naprawie):</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoThumbList}>
                        {afterPhotos.map((p) => (
                          <TouchableOpacity
                            key={p.id}
                            style={[styles.photoThumbWrapper, { borderColor: '#22C55E' }]}
                            onPress={() => setLightboxUrl(p.url)}
                          >
                            <Image source={{ uri: p.url }} style={styles.photoThumb} />
                            <Text style={[styles.photoLabel, { color: '#22C55E' }]} numberOfLines={1}>
                              {p.caption?.replace('[NACHHER]', '').trim() || 'Behoben'}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}

                  {/* General Photos if any */}
                  {generalPhotos.length > 0 && (
                    <View style={styles.photoGroup}>
                      <Text style={[styles.photoGroupTitle, { color: '#38BDF8' }]}>📸 WEITERE FOTOS:</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoThumbList}>
                        {generalPhotos.map((p) => (
                          <TouchableOpacity
                            key={p.id}
                            style={styles.photoThumbWrapper}
                            onPress={() => setLightboxUrl(p.url)}
                          >
                            <Image source={{ uri: p.url }} style={styles.photoThumb} />
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}

                  {/* Action Buttons: Add Vorher-Foto, Add Nachher-Foto, Edit Status/Protokoll */}
                  <View style={styles.actionButtonsRow}>
                    <TouchableOpacity
                      style={styles.addBeforeBtn}
                      onPress={() => setPhotoTarget({ item, type: 'BEFORE' })}
                    >
                      <Text style={styles.actionBtnIcon}>📸</Text>
                      <Text style={styles.actionBtnText}>+ Vorher</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.addAfterBtn}
                      onPress={() => setPhotoTarget({ item, type: 'AFTER' })}
                    >
                      <Text style={styles.actionBtnIcon}>✅</Text>
                      <Text style={styles.actionBtnText}>+ Nachher</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.editBtn}
                      onPress={() => {
                        setEditingItem(item);
                        setSelectedNextStatus(item.status);
                        setUserDocText(item.user_documentation || '');
                        setAdminDocText(item.our_documentation || '');
                      }}
                    >
                      <Text style={styles.actionBtnIcon}>✏️</Text>
                      <Text style={[styles.actionBtnText, { color: '#38BDF8' }]}>Protokoll</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* 6. Fullscreen Photo Lightbox Modal */}
      <Modal visible={!!lightboxUrl} transparent animationType="fade" onRequestClose={() => setLightboxUrl(null)}>
        <View style={styles.lightboxOverlay}>
          <TouchableOpacity style={styles.lightboxCloseBtn} onPress={() => setLightboxUrl(null)}>
            <Text style={styles.lightboxCloseText}>✕ SCHLIESSEN</Text>
          </TouchableOpacity>
          {lightboxUrl && (
            <Image source={{ uri: lightboxUrl }} style={styles.lightboxImage} resizeMode="contain" />
          )}
        </View>
      </Modal>

      {/* 7. Photo Source Picker Modal (Camera vs Gallery for Vorher / Nachher) */}
      <Modal visible={!!photoTarget} transparent animationType="fade" onRequestClose={() => setPhotoTarget(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setPhotoTarget(null)}>
          <View style={styles.photoPickerCard} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>
                {photoTarget?.type === 'AFTER' ? '📸 Nachher-Foto hinzufügen' : '📸 Vorher-Foto hinzufügen'}
              </Text>
              <TouchableOpacity onPress={() => setPhotoTarget(null)}>
                <Text style={styles.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Mangel #{photoTarget?.item.item_number} • {photoTarget?.item.trade_or_company || 'Gewerk'}
            </Text>

            <View style={{ gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                style={[styles.pickerChoiceBtn, { backgroundColor: '#0284C7' }]}
                onPress={() => photoTarget && executePhotoUpload(photoTarget.item, true, photoTarget.type)}
              >
                <Text style={{ fontSize: 20 }}>📷</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickerChoiceBtnText}>Kamera öffnen</Text>
                  <Text style={styles.pickerChoiceSubtext}>Neues Foto direkt auf der Baustelle aufnehmen</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.pickerChoiceBtn, { backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155' }]}
                onPress={() => photoTarget && executePhotoUpload(photoTarget.item, false, photoTarget.type)}
              >
                <Text style={{ fontSize: 20 }}>🖼️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickerChoiceBtnText}>Aus Galerie wählen</Text>
                  <Text style={styles.pickerChoiceSubtext}>Bereits vorhandenes Foto aus der Fotomediathek wählen</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* 8. Full Status, Protokoll & Response Edit Modal with User/Admin Permissions */}
      <Modal visible={!!editingItem} transparent animationType="slide" onRequestClose={() => setEditingItem(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setEditingItem(null)}>
          <View style={styles.modalCard} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>📝 Mangel bearbeiten & Protokoll</Text>
              <TouchableOpacity onPress={() => setEditingItem(null)}>
                <Text style={styles.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 460 }}>
              <Text style={styles.modalSubtitle}>
                #{editingItem?.item_number} • {editingItem?.trade_or_company || 'Gewerk'} {editingItem?.location ? `• ${editingItem.location}` : ''}
              </Text>
              <Text style={styles.modalDescPreview} numberOfLines={3}>
                {editingItem?.original_text}
              </Text>

              <Text style={styles.modalFieldLabel}>STATUS DES MANGELS:</Text>
              <View style={styles.statusButtonsGrid}>
                {[
                  { id: 'OPEN', label: '🚨 OFFEN', color: '#EF4444' },
                  { id: 'IN_PROGRESS', label: '⏳ IN BEARBEITUNG', color: '#EAB308' },
                  { id: 'ZU_KLAEREN', label: '❓ ZU KLÄREN', color: '#A855F7' },
                  { id: 'DONE', label: '✅ BEHOBEN', color: '#22C55E' },
                ].map((st) => (
                  <TouchableOpacity
                    key={st.id}
                    style={[
                      styles.statusSelectBtn,
                      selectedNextStatus === st.id && { borderColor: st.color, backgroundColor: `${st.color}25` },
                    ]}
                    onPress={() => setSelectedNextStatus(st.id as any)}
                  >
                    <Text style={[styles.statusSelectBtnText, { color: st.color }]}>{st.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Editable by Worker & Admin */}
              <Text style={styles.modalFieldLabel}>🛠️ RÜCKMELDUNG / PROTOKOLL ZUR BEHEBUNG (MITARBEITER):</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Beschreiben Sie die durchgeführte Mängelbeseitigung..."
                placeholderTextColor="#64748B"
                value={userDocText}
                onChangeText={setUserDocText}
                multiline
              />

              {/* Bauleitung / Admin Documentation: Protected for regular workers! */}
              <Text style={[styles.modalFieldLabel, { color: '#EAB308' }]}>👑 BAULEITUNG / ADMIN NOTIZEN:</Text>
              {isAdmin || isMod ? (
                <TextInput
                  style={[styles.modalInput, { borderColor: '#EAB30860' }]}
                  placeholder="Interne Anweisung der Bauleitung..."
                  placeholderTextColor="#64748B"
                  value={adminDocText}
                  onChangeText={setAdminDocText}
                  multiline
                />
              ) : (
                <View style={styles.protectedDocBox}>
                  <Text style={styles.protectedDocText}>
                    {editingItem?.our_documentation || 'Keine Anweisung durch die Bauleitung hinterlegt.'}
                  </Text>
                  <Text style={styles.protectedDocNotice}>
                    🔒 Schreibgeschützt (Nur für Bauleitung / Admin bearbeitbar)
                  </Text>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalActionsRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setEditingItem(null)}>
                <Text style={styles.modalCancelBtnText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveBtn}
                disabled={updating}
                onPress={() => {
                  if (editingItem) {
                    updateItemDetails(editingItem, selectedNextStatus, userDocText, adminDocText);
                  }
                }}
              >
                <Text style={styles.modalSaveBtnText}>{updating ? 'Speichern...' : '💾 Speichern'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
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
    paddingTop: 8,
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
  tradeFilterBar: {
    backgroundColor: '#0A0F1D',
    paddingHorizontal: 12,
    paddingTop: 6,
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
  tradeChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#0F172A',
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  tradeChipActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    borderColor: '#38BDF8',
  },
  tradeChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  },
  tradeChipTextActive: {
    color: '#38BDF8',
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
    paddingBottom: 50,
  },
  itemCard: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  itemCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    flex: 1,
  },
  itemNumBadge: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  itemNumberText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#38BDF8',
  },
  tradeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  tradeBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  pageBadge: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  pageBadgeText: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    marginLeft: 6,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  locationRow: {
    marginBottom: 8,
  },
  locationBadge: {
    fontSize: 11,
    color: '#38BDF8',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    fontWeight: '700',
    alignSelf: 'flex-start',
  },
  descBox: {
    backgroundColor: '#1E293B50',
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#38BDF8',
  },
  descHeading: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  descText: {
    fontSize: 13,
    color: '#F8FAFC',
    lineHeight: 19,
    fontWeight: '500',
  },
  adminDocBox: {
    backgroundColor: 'rgba(234, 179, 8, 0.08)',
    borderLeftWidth: 3,
    borderLeftColor: '#EAB308',
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
  },
  adminDocHeading: {
    fontSize: 10,
    fontWeight: '800',
    color: '#EAB308',
    letterSpacing: 0.5,
  },
  adminDocText: {
    fontSize: 12,
    color: '#FEF08A',
    lineHeight: 18,
  },
  userDocBox: {
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
    borderLeftWidth: 3,
    borderLeftColor: '#22C55E',
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
  },
  userDocHeading: {
    fontSize: 10,
    fontWeight: '800',
    color: '#22C55E',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  userDocText: {
    fontSize: 12,
    color: '#DCFCE7',
    lineHeight: 18,
  },
  photosContainer: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  photoGroup: {
    marginBottom: 8,
  },
  photoGroupTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  photoThumbList: {
    flexDirection: 'row',
  },
  photoThumbWrapper: {
    marginRight: 8,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#000',
    width: 80,
  },
  photoThumb: {
    width: 80,
    height: 80,
    resizeMode: 'cover',
  },
  photoLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#94A3B8',
    textAlign: 'center',
    paddingVertical: 2,
    backgroundColor: '#0F172A',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  addBeforeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#334155',
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#475569',
    gap: 4,
  },
  addAfterBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#38BDF8',
    gap: 4,
  },
  actionBtnIcon: {
    fontSize: 13,
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  photoPickerCard: {
    backgroundColor: '#0F172A',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#38BDF8',
    padding: 18,
    width: '90%',
    alignSelf: 'center',
  },
  pickerChoiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    gap: 12,
  },
  pickerChoiceBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 2,
  },
  pickerChoiceSubtext: {
    color: '#94A3B8',
    fontSize: 11,
  },
  protectedDocBox: {
    backgroundColor: 'rgba(234, 179, 8, 0.05)',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(234, 179, 8, 0.2)',
    marginBottom: 10,
  },
  protectedDocText: {
    color: '#FEF08A',
    fontSize: 12,
    lineHeight: 18,
  },
  protectedDocNotice: {
    color: '#EAB308',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 6,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  loadingText: {
    marginTop: 12,
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
  },
  emptySubtitle: {
    color: '#64748B',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  lightboxOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxCloseBtn: {
    position: 'absolute',
    top: 50,
    right: 20,
    backgroundColor: '#1E293B',
    paddingHorizontal: 16,
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
    width: '100%',
    height: '85%',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: '#38BDF8',
    padding: 18,
    paddingBottom: 36,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#38BDF8',
  },
  closeBtn: {
    fontSize: 18,
    color: '#94A3B8',
    paddingHorizontal: 6,
  },
  modalSubtitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#E2E8F0',
    marginBottom: 4,
  },
  modalDescPreview: {
    fontSize: 11,
    color: '#94A3B8',
    marginBottom: 12,
    backgroundColor: '#1E293B40',
    padding: 8,
    borderRadius: 6,
  },
  modalFieldLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#38BDF8',
    marginTop: 8,
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  statusButtonsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  statusSelectBtn: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#1E293B',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#334155',
  },
  statusSelectBtnText: {
    fontSize: 11,
    fontWeight: '800',
  },
  modalInput: {
    backgroundColor: '#1E293B',
    borderRadius: 8,
    padding: 10,
    color: '#F8FAFC',
    fontSize: 13,
    minHeight: 70,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 10,
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: '#1E293B',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalCancelBtnText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '800',
  },
  modalSaveBtn: {
    flex: 2,
    backgroundColor: '#0284C7',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalSaveBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
});
