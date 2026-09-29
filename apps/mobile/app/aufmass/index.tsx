import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  Dimensions,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { WebView } from 'react-native-webview';
import { getDatabase } from '../../src/db/database';
import { authSupabase } from '../../src/auth/authClient';
import { useLanguage } from '../../src/i18n/LanguageContext';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://inspecthero.pl';
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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
  projects?: { name: string; company_name?: string } | null;
  plans?: { name: string } | null;
}

interface AufmassMaterial {
  id: string;
  session_id: string;
  name?: string;
  item_name?: string;
  unit: string;
  quantity?: number | null;
  price?: number | null;
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
  company_name?: string;
  address?: string;
  companies?: { name: string } | null;
}

interface PlanOption {
  id: string;
  name: string;
  project_id?: string;
  floor_name?: string;
  building_name?: string;
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

  // Project & Plan Dropdown Pickers
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [projectSearch, setProjectSearch] = useState('');
  const [showPlanPicker, setShowPlanPicker] = useState(false);
  const [planSearch, setPlanSearch] = useState('');

  // Add Item to Session Modal
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [addItemType, setAddItemType] = useState<'material' | 'labor'>('material');
  const [matName, setMatName] = useState('');
  const [matUnit, setMatUnit] = useState('st.');
  const [matQty, setMatQty] = useState('');
  const [laborDesc, setLaborDesc] = useState('');
  const [laborHours, setLaborHours] = useState('');
  const [laborWorkers, setLaborWorkers] = useState('1');
  const [savingItem, setSavingItem] = useState(false);

  // Photo Markup / Editor Modal
  const [editingPhoto, setEditingPhoto] = useState<AufmassPhoto | null>(null);
  const [savingMarkup, setSavingMarkup] = useState(false);
  const editorWebViewRef = useRef<WebView>(null);

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
        const formatted = pList.map((p: any) => ({
          id: p.id,
          name: p.name,
          company_name: p.company_name || p.companies?.name,
          address: p.address,
        }));
        setProjects(formatted);
        if (formatted.length > 0 && !newProjectId) {
          setNewProjectId(formatted[0].id);
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
            const formatted = pList.map((pl: any) => {
              const bName = pl.floors?.buildings?.name || '';
              const fName = pl.floors?.name || '';
              const rawName = pl.name || 'Plan';
              const fullName = [bName, fName, (rawName && rawName !== fName) ? rawName : ''].filter(Boolean).join(' · ') || rawName;
              return {
                id: pl.id,
                name: fullName,
                project_id: pl.project_id,
                floor_name: fName,
                building_name: bName,
              };
            });
            setPlans(formatted);
            if (formatted.length > 0) {
              setNewPlanId(formatted[0].id);
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

  // Create New Session with Auto-Navigation to Plan
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

        const targetPlanId = newPlanId || created.plan_id;
        const createdId = created.id;

        setNewName('');
        setNewClientName('');
        setNewClientPhone('');
        setNewClientEmail('');

        // Natychmiast otwórz rzut w trybie Aufmaß do wstawiania markerów i zdjęć!
        if (targetPlanId) {
          router.push({
            pathname: '/plans/[id]',
            params: { id: targetPlanId, mode: 'aufmass', aufmassId: createdId },
          } as any);
        } else {
          Alert.alert('Utworzono', 'Protokół Aufmaß został utworzony.');
        }
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
          const addRes = await fetch(`${API_BASE_URL}/api/aufmass-photos`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
            },
            body: JSON.stringify({
              session_id: activeSession.id,
              url: photoUrl,
            }),
          });

          if (addRes.ok) {
            const addedJson = await addRes.json();
            const newP = addedJson?.data || addedJson || { id: `p-${Date.now()}`, session_id: activeSession.id, url: photoUrl };
            setSessionPhotos((prev) => [...prev, newP]);
            
            // Otwórz edytor do rysowania wymiarów i oznaczeń na nowym zdjęciu!
            setEditingPhoto(newP);
          }
        }
      }
    } catch (e: any) {
      Alert.alert('Błąd dodawania zdjęcia', e?.message || 'Nie udało się wgrać zdjęcia');
    }
  };

  // Add Material or Labor Item
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
          Alert.alert('Wymagane pole', 'Podaj nazwę materiału');
          return;
        }
        const res = await fetch(`${API_BASE_URL}/api/aufmass/materials`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            session_id: activeSession.id,
            item_name: matName.trim(),
            unit: matUnit || 'st.',
            quantity: parseFloat(matQty) || 1,
          }),
        });
        if (res.ok) {
          const json = await res.json();
          setSessionMaterials((prev) => [...prev, json?.data || json]);
          setShowAddItemModal(false);
        }
      } else {
        if (!laborDesc.trim()) {
          Alert.alert('Wymagane pole', 'Podaj opis wykonanych prac');
          return;
        }
        const res = await fetch(`${API_BASE_URL}/api/aufmass/labor`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            session_id: activeSession.id,
            description: laborDesc.trim(),
            hours: parseFloat(laborHours) || 1,
            worker_count: parseInt(laborWorkers, 10) || 1,
          }),
        });
        if (res.ok) {
          const json = await res.json();
          setSessionLabor((prev) => [...prev, json?.data || json]);
          setShowAddItemModal(false);
        }
      }
    } catch (e: any) {
      Alert.alert('Błąd', e?.message || 'Nie udało się zapisać pozycji.');
    } finally {
      setSavingItem(false);
    }
  };

  // Save Annotated Markup Photo from Editor
  const handleSaveAnnotatedPhoto = async (base64DataUrl: string) => {
    if (!editingPhoto || !activeSession) return;
    try {
      setSavingMarkup(true);
      const { data: { session } } = await authSupabase.auth.getSession();

      // Upload base64 as new version / updated photo
      const upRes = await fetch(`${API_BASE_URL}/api/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          dataUrl: base64DataUrl,
          fileName: `aufmass_markup_${editingPhoto.id}_${Date.now()}.png`,
        }),
      });

      if (upRes.ok) {
        const uJson = await upRes.json();
        const updatedUrl = uJson.url || uJson.file_url || base64DataUrl;

        // Update photo URL in session
        setSessionPhotos((prev) =>
          prev.map((p) => (p.id === editingPhoto.id ? { ...p, url: updatedUrl } : p))
        );
        setEditingPhoto(null);
        Alert.alert('✅ Zapisano', 'Wymiary i oznaczenia zostały zapisane na zdjęciu.');
      } else {
        // Fallback update locally
        setSessionPhotos((prev) =>
          prev.map((p) => (p.id === editingPhoto.id ? { ...p, url: base64DataUrl } : p))
        );
        setEditingPhoto(null);
      }
    } catch (e: any) {
      Alert.alert('Błąd zapisu', e?.message || 'Nie udało się zapisać zaktualizowanego zdjęcia');
    } finally {
      setSavingMarkup(false);
    }
  };

  // Filter Sessions
  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      const matchType = selectedType === 'all' || s.session_type === selectedType;
      const q = search.toLowerCase().trim();
      const matchSearch =
        !q ||
        s.name.toLowerCase().includes(q) ||
        (s.projects?.name && s.projects.name.toLowerCase().includes(q)) ||
        (s.projects?.company_name && s.projects.company_name.toLowerCase().includes(q)) ||
        (s.client_name && s.client_name.toLowerCase().includes(q));
      return matchType && matchSearch;
    });
  }, [sessions, selectedType, search]);

  const selectedProject = projects.find((p) => p.id === newProjectId);
  const selectedPlan = plans.find((pl) => pl.id === newPlanId);

  // Generate Photo Editor HTML (1:1 Web AufmassCanvas Engine)
  const generateEditorHtml = (imgUrl: string) => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <style>
        * { margin:0; padding:0; box-sizing:border-box; user-select:none; -webkit-user-select:none; }
        body, html { width:100%; height:100%; background:#090D16; overflow:hidden; font-family:-apple-system, sans-serif; }
        #canvas-container { position:relative; width:100%; height:calc(100% - 90px); display:flex; align-items:center; justify-content:center; }
        canvas { touch-action:none; background:#0F172A; max-width:100%; max-height:100%; }
        #toolbar { position:absolute; bottom:0; left:0; right:0; height:90px; background:#0F172A; border-top:1px solid #1E293B; display:flex; flex-direction:column; padding:6px 12px; gap:6px; }
        .tool-row { display:flex; gap:6px; overflow-x:auto; align-items:center; }
        .tool-btn { background:#1E293B; border:1px solid #334155; color:#F8FAFC; border-radius:8px; padding:6px 10px; font-size:11px; font-weight:800; white-space:nowrap; }
        .tool-btn.active { background:#0284C7; border-color:#38BDF8; color:#FFF; }
        .color-dot { width:22px; height:22px; border-radius:50%; border:2px solid transparent; }
        .color-dot.active { border-color:#FFF; transform:scale(1.15); }
      </style>
    </head>
    <body>
      <div id="canvas-container">
        <canvas id="paintCanvas"></canvas>
      </div>
      <div id="toolbar">
        <div class="tool-row">
          <button class="tool-btn active" id="btn-measure" onclick="setTool('measure')">📏 Wymiar</button>
          <button class="tool-btn" id="btn-arrow" onclick="setTool('arrow')">↗ Strzałka</button>
          <button class="tool-btn" id="btn-pen" onclick="setTool('pen')">✏️ Ołówek</button>
          <button class="tool-btn" id="btn-rect" onclick="setTool('rect')">▢ Ramka</button>
          <button class="tool-btn" id="btn-marker" onclick="setTool('marker')">📍 Marker</button>
          <button class="tool-btn" id="btn-text" onclick="setTool('text')">💬 Tekst</button>
          <button class="tool-btn" style="background:#DC2626;" onclick="undo()">↩ Cofnij</button>
          <button class="tool-btn" style="background:#16A34A;" onclick="saveImage()">💾 Zapisz</button>
        </div>
        <div class="tool-row" style="gap:10px; padding-top:2px;">
          <div class="color-dot active" style="background:#EF4444;" onclick="setColor('#EF4444')"></div>
          <div class="color-dot" style="background:#3B82F6;" onclick="setColor('#3B82F6')"></div>
          <div class="color-dot" style="background:#22C55E;" onclick="setColor('#22C55E')"></div>
          <div class="color-dot" style="background:#EAB308;" onclick="setColor('#EAB308')"></div>
          <div class="color-dot" style="background:#A855F7;" onclick="setColor('#A855F7')"></div>
          <div class="color-dot" style="background:#FFFFFF;" onclick="setColor('#FFFFFF')"></div>
        </div>
      </div>
      <script>
        const canvas = document.getElementById('paintCanvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = "${imgUrl}";

        let currentTool = 'measure';
        let currentColor = '#EF4444';
        let strokeWidth = 3;
        let isDrawing = false;
        let startX = 0, startY = 0;
        let history = [];
        let markerCount = 1;

        img.onload = () => {
          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);
          saveState();
        };

        function saveState() {
          history.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
          if (history.length > 20) history.shift();
        }

        function undo() {
          if (history.length > 1) {
            history.pop();
            const prevState = history[history.length - 1];
            ctx.putImageData(prevState, 0, 0);
          }
        }

        function setTool(t) {
          currentTool = t;
          document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
          const btn = document.getElementById('btn-' + t);
          if (btn) btn.classList.add('active');
        }

        function setColor(c) {
          currentColor = c;
          document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
          event.target.classList.add('active');
        }

        function getPos(e) {
          const rect = canvas.getBoundingClientRect();
          const scaleX = canvas.width / rect.width;
          const scaleY = canvas.height / rect.height;
          const clientX = e.touches ? e.touches[0].clientX : e.clientX;
          const clientY = e.touches ? e.touches[0].clientY : e.clientY;
          return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
        }

        canvas.addEventListener('touchstart', (e) => {
          e.preventDefault();
          const p = getPos(e);
          startX = p.x;
          startY = p.y;
          isDrawing = true;

          if (currentTool === 'marker') {
            drawMarker(p.x, p.y, 'A' + markerCount++);
            saveState();
            isDrawing = false;
          } else if (currentTool === 'text') {
            const txt = prompt('Wpisz tekst notatki:');
            if (txt) {
              drawText(p.x, p.y, txt);
              saveState();
            }
            isDrawing = false;
          }
        });

        canvas.addEventListener('touchmove', (e) => {
          e.preventDefault();
          if (!isDrawing) return;
          const p = getPos(e);

          if (currentTool === 'pen') {
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(p.x, p.y);
            ctx.strokeStyle = currentColor;
            ctx.lineWidth = strokeWidth * 2;
            ctx.lineCap = 'round';
            ctx.stroke();
            startX = p.x;
            startY = p.y;
          } else {
            // Live preview
            const lastState = history[history.length - 1];
            if (lastState) ctx.putImageData(lastState, 0, 0);

            if (currentTool === 'measure' || currentTool === 'arrow') {
              drawArrow(startX, startY, p.x, p.y, currentTool === 'measure');
            } else if (currentTool === 'rect') {
              ctx.strokeStyle = currentColor;
              ctx.lineWidth = strokeWidth * 2;
              ctx.strokeRect(startX, startY, p.x - startX, p.y - startY);
            }
          }
        });

        canvas.addEventListener('touchend', (e) => {
          if (!isDrawing) return;
          isDrawing = false;
          const p = getPos(e.changedTouches ? { touches: [e.changedTouches[0]] } : e);

          if (currentTool === 'measure') {
            const dim = prompt('Podaj wymiar (np. 150 cm, 2.5 m):', '150 cm');
            if (dim) {
              drawDimension(startX, startY, p.x, p.y, dim);
            }
          }
          saveState();
        });

        function drawArrow(x1, y1, x2, y2, isDouble) {
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.strokeStyle = currentColor;
          ctx.lineWidth = strokeWidth * 2;
          ctx.stroke();

          const angle = Math.atan2(y2 - y1, x2 - x1);
          const headLen = 16;
          // Arrow head at end
          ctx.beginPath();
          ctx.moveTo(x2, y2);
          ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
          ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
          ctx.fillStyle = currentColor;
          ctx.fill();

          if (isDouble) {
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x1 + headLen * Math.cos(angle - Math.PI / 6), y1 + headLen * Math.sin(angle - Math.PI / 6));
            ctx.lineTo(x1 + headLen * Math.cos(angle + Math.PI / 6), y1 + headLen * Math.sin(angle + Math.PI / 6));
            ctx.fill();
          }
        }

        function drawDimension(x1, y1, x2, y2, text) {
          drawArrow(x1, y1, x2, y2, true);
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;
          ctx.font = 'bold 24px sans-serif';
          const textWidth = ctx.measureText(text).width;
          ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
          ctx.fillRect(midX - textWidth / 2 - 8, midY - 18, textWidth + 16, 28);
          ctx.fillStyle = currentColor;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(text, midX, midY - 4);
        }

        function drawMarker(x, y, label) {
          ctx.beginPath();
          ctx.arc(x, y, 22, 0, Math.PI * 2);
          ctx.fillStyle = currentColor;
          ctx.fill();
          ctx.lineWidth = 4;
          ctx.strokeStyle = '#FFFFFF';
          ctx.stroke();

          ctx.font = 'bold 20px sans-serif';
          ctx.fillStyle = '#FFFFFF';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, x, y);
        }

        function drawText(x, y, text) {
          ctx.font = 'bold 22px sans-serif';
          ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
          const textWidth = ctx.measureText(text).width;
          ctx.fillRect(x - 6, y - 20, textWidth + 12, 28);
          ctx.fillStyle = currentColor;
          ctx.fillText(text, x, y);
        }

        function saveImage() {
          const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SAVE_MARKUP', dataUrl: dataUrl }));
          }
        }
      </script>
    </body>
    </html>
  `;

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{
          title: 'Aufmaß & Protokoły',
          headerShown: true,
          headerBackTitle: 'Wstecz',
          headerStyle: { backgroundColor: '#0B0F19' },
          headerTintColor: '#38BDF8',
          headerTitleStyle: { color: '#F8FAFC', fontWeight: '800' },
        }}
      />

      {/* Top Action Bar */}
      <View style={styles.headerBar}>
        <View style={styles.headerTopRow}>
          <Text style={styles.headerTitle}>📏 SESJE AUFMAß I PROTOKOŁY</Text>
          <TouchableOpacity
            style={styles.newBtn}
            onPress={() => {
              loadProjectsAndPlans();
              setShowCreateModal(true);
            }}
          >
            <Text style={styles.newBtnText}>+ Nowy Protokół</Text>
          </TouchableOpacity>
        </View>

        {/* Search */}
        <TextInput
          style={styles.searchInput}
          placeholder="Szukaj protokołu, projektu, klienta..."
          placeholderTextColor="#64748B"
          value={search}
          onChangeText={setSearch}
        />

        {/* Filter Categories */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
          {[
            { id: 'all', label: 'Wszystkie' },
            { id: 'aufmass', label: '📏 Aufmaß' },
            { id: 'zusatz', label: '➕ Zusatz' },
            { id: 'baubehinderung', label: '🚧 Behinderung' },
            { id: 'bestellung', label: '📦 Bestellung' },
            { id: 'fragen', label: '❓ Fragen' },
          ].map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.filterChip, selectedType === item.id && styles.filterChipActive]}
              onPress={() => setSelectedType(item.id)}
            >
              <Text style={[styles.filterChipText, selectedType === item.id && styles.filterChipTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* List of Sessions */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#38BDF8" />
          <Text style={styles.loadingText}>Ładowanie protokołów...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredSessions}
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
              <Text style={styles.emptyTitle}>Brak protokołów Aufmaß</Text>
              <Text style={styles.emptySubtitle}>
                Utwórz pierwszy protokół obmiarowy, usterkę lub prace dodatkowe klikając przycisk powyżej.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.sessionCard}
              activeOpacity={0.75}
              onPress={() => openSessionDetails(item)}
            >
              <View style={styles.sessionCardHeader}>
                <View style={styles.sessionTypeBadge}>
                  <Text style={styles.sessionTypeText}>
                    {item.session_type === 'aufmass'
                      ? '📏 Aufmaß'
                      : item.session_type === 'zusatz'
                      ? '➕ Zusatz'
                      : item.session_type === 'baubehinderung'
                      ? '🚧 Behinderung'
                      : item.session_type === 'bestellung'
                      ? '📦 Bestellung'
                      : '❓ Fragen'}
                  </Text>
                </View>
                <Text style={styles.sessionDate}>
                  {item.created_at ? new Date(item.created_at).toLocaleDateString() : ''}
                </Text>
              </View>

              <Text style={styles.sessionName}>{item.name}</Text>

              <View style={styles.sessionInfoRow}>
                {item.projects?.company_name ? (
                  <View style={styles.miniCompanyBadge}>
                    <Text style={styles.miniCompanyBadgeText}>[{item.projects.company_name}]</Text>
                  </View>
                ) : null}
                <Text style={styles.sessionProject}>
                  🏢 {item.projects?.name || 'Projekt'} {item.plans?.name ? `• 📐 ${item.plans.name}` : ''}
                </Text>
              </View>

              {item.client_name ? (
                <Text style={styles.sessionClient}>👤 Klient: {item.client_name}</Text>
              ) : null}

              {/* Action: Open Map Directly */}
              {item.plan_id ? (
                <TouchableOpacity
                  style={styles.mapDirectBtn}
                  onPress={() => {
                    router.push({
                      pathname: '/plans/[id]',
                      params: { id: item.plan_id, mode: 'aufmass', aufmassId: item.id },
                    } as any);
                  }}
                >
                  <Text style={styles.mapDirectBtnText}>🗺️ Otwórz Rzut 2D z punktami →</Text>
                </TouchableOpacity>
              ) : null}
            </TouchableOpacity>
          )}
        />
      )}

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

            <ScrollView style={{ maxHeight: SCREEN_HEIGHT * 0.65 }}>
              <Text style={styles.inputLabel}>TYP PROTOKOŁU:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
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

              {/* Projekt Budowlany - Dropdown Selector */}
              <Text style={styles.inputLabel}>PROJEKT BUDOWLANY *</Text>
              <TouchableOpacity
                style={styles.dropdownBtn}
                onPress={() => setShowProjectPicker(true)}
              >
                <Text style={styles.dropdownBtnText}>
                  {selectedProject
                    ? `${selectedProject.company_name ? `[${selectedProject.company_name}] ` : ''}${selectedProject.name}`
                    : 'Wybierz projekt budowlany...'}
                </Text>
                <Text style={styles.dropdownArrow}>▼</Text>
              </TouchableOpacity>

              {/* Rzut / Plan - Dropdown Selector */}
              <Text style={styles.inputLabel}>RZUT / PLAN ARCHITEKTONICZNY</Text>
              <TouchableOpacity
                style={styles.dropdownBtn}
                onPress={() => setShowPlanPicker(true)}
              >
                <Text style={styles.dropdownBtnText}>
                  {selectedPlan
                    ? selectedPlan.name
                    : plans.length > 0
                    ? 'Wybierz rzut z listy...'
                    : 'Brak rzutów dla tego projektu'}
                </Text>
                <Text style={styles.dropdownArrow}>▼</Text>
              </TouchableOpacity>

              <Text style={styles.inputLabel}>NAZWA PROTOKOŁU / SESJI *</Text>
              <TextInput
                style={styles.input}
                placeholder="np. Pomiary koryt Halle 4, Prace dodatkowe..."
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

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>TELEFON</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="+49 ..."
                    placeholderTextColor="#64748B"
                    value={newClientPhone}
                    onChangeText={setNewClientPhone}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>EMAIL</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="klient@firma.de"
                    placeholderTextColor="#64748B"
                    value={newClientEmail}
                    onChangeText={setNewClientEmail}
                  />
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setShowCreateModal(false)}
              >
                <Text style={styles.cancelBtnText}>Anuluj</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.saveBtn}
                disabled={creating}
                onPress={handleCreateSession}
              >
                {creating ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.saveBtnText}>Utwórz i Otwórz Plan ➔</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL: PROJECT PICKER DROPDOWN */}
      <Modal
        visible={showProjectPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowProjectPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: SCREEN_HEIGHT * 0.7 }]}>
            <Text style={styles.modalHeading}>🏢 Wybierz Projekt Budowlany</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Szukaj projektu lub firmy [SV], [Listbau]..."
              placeholderTextColor="#64748B"
              value={projectSearch}
              onChangeText={setProjectSearch}
            />
            <ScrollView style={{ marginTop: 10 }}>
              {projects
                .filter((p) => {
                  const q = projectSearch.toLowerCase().trim();
                  return (
                    !q ||
                    p.name.toLowerCase().includes(q) ||
                    (p.company_name && p.company_name.toLowerCase().includes(q)) ||
                    (p.address && p.address.toLowerCase().includes(q))
                  );
                })
                .map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.pickerItem, newProjectId === p.id && styles.pickerItemActive]}
                    onPress={() => {
                      setNewProjectId(p.id);
                      setShowProjectPicker(false);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {p.company_name ? (
                          <View style={styles.miniCompanyBadge}>
                            <Text style={styles.miniCompanyBadgeText}>[{p.company_name}]</Text>
                          </View>
                        ) : null}
                        <Text style={styles.pickerItemTitle}>{p.name}</Text>
                      </View>
                      {p.address ? (
                        <Text style={styles.pickerItemSub}>{p.address}</Text>
                      ) : null}
                    </View>
                    {newProjectId === p.id && <Text style={{ color: '#38BDF8', fontWeight: 'bold' }}>✓</Text>}
                  </TouchableOpacity>
                ))}
            </ScrollView>
            <TouchableOpacity
              style={[styles.cancelBtn, { marginTop: 12 }]}
              onPress={() => setShowProjectPicker(false)}
            >
              <Text style={styles.cancelBtnText}>Zamknij</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL: PLAN PICKER DROPDOWN */}
      <Modal
        visible={showPlanPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPlanPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: SCREEN_HEIGHT * 0.7 }]}>
            <Text style={styles.modalHeading}>📐 Wybierz Rzut / Plan Architektoniczny</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Szukaj rzutu lub kondygnacji..."
              placeholderTextColor="#64748B"
              value={planSearch}
              onChangeText={setPlanSearch}
            />
            <ScrollView style={{ marginTop: 10 }}>
              {plans
                .filter((pl) => {
                  const q = planSearch.toLowerCase().trim();
                  return (
                    !q ||
                    pl.name.toLowerCase().includes(q) ||
                    (pl.floor_name && pl.floor_name.toLowerCase().includes(q))
                  );
                })
                .map((pl) => (
                  <TouchableOpacity
                    key={pl.id}
                    style={[styles.pickerItem, newPlanId === pl.id && styles.pickerItemActive]}
                    onPress={() => {
                      setNewPlanId(pl.id);
                      setShowPlanPicker(false);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pickerItemTitle}>📐 {pl.name}</Text>
                      {pl.floor_name ? (
                        <Text style={styles.pickerItemSub}>Kondygnacja: {pl.floor_name}</Text>
                      ) : null}
                    </View>
                    {newPlanId === pl.id && <Text style={{ color: '#38BDF8', fontWeight: 'bold' }}>✓</Text>}
                  </TouchableOpacity>
                ))}
            </ScrollView>
            <TouchableOpacity
              style={[styles.cancelBtn, { marginTop: 12 }]}
              onPress={() => setShowPlanPicker(false)}
            >
              <Text style={styles.cancelBtnText}>Zamknij</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL: SESSION DETAILS */}
      <Modal
        visible={!!activeSession}
        transparent
        animationType="slide"
        onRequestClose={() => setActiveSession(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: SCREEN_HEIGHT * 0.85 }]}>
            <View style={styles.detailsHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.detailsHeading}>{activeSession?.name}</Text>
                <Text style={styles.detailsSub}>
                  🏢 {activeSession?.projects?.name} {activeSession?.plans?.name ? `• 📐 ${activeSession.plans.name}` : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setActiveSession(null)}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            {detailsLoading ? (
              <ActivityIndicator color="#38BDF8" style={{ marginVertical: 30 }} />
            ) : (
              <ScrollView style={{ maxHeight: SCREEN_HEIGHT * 0.65 }}>
                {/* Plan Link */}
                {activeSession?.plan_id && (
                  <TouchableOpacity
                    style={styles.planNavBtn}
                    onPress={() => {
                      const pId = activeSession.plan_id;
                      setActiveSession(null);
                      router.push({
                        pathname: '/plans/[id]',
                        params: { id: pId, mode: 'aufmass', aufmassId: activeSession.id },
                      } as any);
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
                        setMatName('');
                        setMatQty('');
                        setMatUnit('st.');
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
                        <Text style={styles.itemRowTitle}>{m.item_name || m.name}</Text>
                        <Text style={styles.itemRowValue}>
                          {m.quantity !== null && m.quantity !== undefined ? m.quantity : '-'} {m.unit}
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
                        setLaborDesc('');
                        setLaborHours('');
                        setLaborWorkers('1');
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
                        <TouchableOpacity
                          key={p.id}
                          onPress={() => setEditingPhoto(p)}
                          style={{ position: 'relative' }}
                        >
                          <Image source={{ uri: p.url }} style={styles.photoThumb} />
                          <View style={styles.photoEditBadge}>
                            <Text style={styles.photoEditBadgeText}>✏️ Edytuj</Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* MODAL: PHOTO MARKUP / MEASUREMENT EDITOR */}
      <Modal
        visible={!!editingPhoto}
        animationType="slide"
        onRequestClose={() => setEditingPhoto(null)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: '#090D16' }}>
          <View style={styles.editorTopBar}>
            <TouchableOpacity onPress={() => setEditingPhoto(null)}>
              <Text style={styles.editorCloseText}>✕ Zamknij</Text>
            </TouchableOpacity>
            <Text style={styles.editorTitle}>🎨 Edytor Wymiarów Zdjęcia</Text>
            {savingMarkup ? (
              <ActivityIndicator color="#38BDF8" />
            ) : (
              <View style={{ width: 40 }} />
            )}
          </View>

          {editingPhoto && (
            <WebView
              ref={editorWebViewRef}
              originWhitelist={['*']}
              source={{ html: generateEditorHtml(editingPhoto.url) }}
              style={{ flex: 1, backgroundColor: '#090D16' }}
              onMessage={(event) => {
                try {
                  const msg = JSON.parse(event.nativeEvent.data);
                  if (msg.type === 'SAVE_MARKUP' && msg.dataUrl) {
                    handleSaveAnnotatedPhoto(msg.dataUrl);
                  }
                } catch (e) {}
              }}
            />
          )}
        </SafeAreaView>
      </Modal>

      {/* MODAL: ADD MATERIAL OR LABOR */}
      <Modal
        visible={showAddItemModal}
        transparent
        animationType="fade"
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
                  placeholder="np. Koryto kablowe 200x60, Przewód NYM-J..."
                  placeholderTextColor="#64748B"
                  value={matName}
                  onChangeText={setMatName}
                />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>ILOŚĆ</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="1"
                      keyboardType="numeric"
                      placeholderTextColor="#64748B"
                      value={matQty}
                      onChangeText={setMatQty}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>JEDNOSTKA</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="m, szt, kpl..."
                      placeholderTextColor="#64748B"
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
                  style={styles.input}
                  placeholder="np. Montaż tras kablowych, Przeciąganie kabli..."
                  placeholderTextColor="#64748B"
                  value={laborDesc}
                  onChangeText={setLaborDesc}
                />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>GODZINY (H)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="8"
                      keyboardType="numeric"
                      placeholderTextColor="#64748B"
                      value={laborHours}
                      onChangeText={setLaborHours}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>LICZBA PRACOWNIKÓW</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="1"
                      keyboardType="numeric"
                      placeholderTextColor="#64748B"
                      value={laborWorkers}
                      onChangeText={setLaborWorkers}
                    />
                  </View>
                </View>
              </>
            )}

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setShowAddItemModal(false)}
              >
                <Text style={styles.cancelBtnText}>Anuluj</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveBtn}
                disabled={savingItem}
                onPress={handleSaveItem}
              >
                {savingItem ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.saveBtnText}>Zapisz</Text>
                )}
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
  headerBar: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  headerTitle: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  newBtn: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  newBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  searchInput: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#F8FAFC',
    fontSize: 13,
    marginBottom: 8,
  },
  filterScroll: {
    flexDirection: 'row',
  },
  filterChip: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  filterChipActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    borderColor: '#38BDF8',
  },
  filterChipText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
  },
  filterChipTextActive: {
    color: '#38BDF8',
  },
  list: { padding: 14, paddingBottom: 40 },
  sessionCard: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 10,
  },
  sessionCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  sessionTypeBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  sessionTypeText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '800',
  },
  sessionDate: {
    color: '#64748B',
    fontSize: 11,
  },
  sessionName: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 6,
  },
  sessionInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  miniCompanyBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.4)',
  },
  miniCompanyBadgeText: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: '800',
  },
  sessionProject: {
    color: '#94A3B8',
    fontSize: 12,
  },
  sessionClient: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
  },
  mapDirectBtn: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderWidth: 1,
    borderColor: '#38BDF8',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  mapDirectBtnText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 16,
    width: '100%',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  modalHeading: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 12,
  },
  inputLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 8,
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: '#F8FAFC',
    fontSize: 13,
  },
  dropdownBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#38BDF8',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 4,
  },
  dropdownBtnText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  dropdownArrow: {
    color: '#38BDF8',
    fontSize: 11,
    marginLeft: 6,
  },
  typeChip: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 8,
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
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16,
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#1E293B',
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
  },
  saveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#0284C7',
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  pickerItemActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
  },
  pickerItemTitle: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  pickerItemSub: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
  },
  detailsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  detailsHeading: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '900',
  },
  detailsSub: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  closeBtnText: {
    color: '#94A3B8',
    fontSize: 18,
    fontWeight: 'bold',
    padding: 4,
  },
  planNavBtn: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderWidth: 1,
    borderColor: '#38BDF8',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 14,
  },
  planNavBtnText: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: '800',
  },
  sectionBlock: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '900',
  },
  addMiniBtnText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '800',
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  itemRowTitle: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '600',
  },
  itemRowSub: {
    color: '#64748B',
    fontSize: 10,
  },
  itemRowValue: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
  },
  noItemsText: {
    color: '#64748B',
    fontSize: 11,
    fontStyle: 'italic',
    paddingVertical: 4,
  },
  photoThumb: {
    width: 80,
    height: 80,
    borderRadius: 8,
    marginRight: 8,
    backgroundColor: '#0B0F19',
  },
  photoEditBadge: {
    position: 'absolute',
    bottom: 4,
    right: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  photoEditBadgeText: {
    color: '#38BDF8',
    fontSize: 9,
    fontWeight: '800',
  },
  editorTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0F172A',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  editorCloseText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '800',
  },
  editorTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '800',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    marginTop: 40,
  },
  loadingText: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 12,
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
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
});
