import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  Alert,
  Dimensions,
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import * as ImagePicker from 'expo-image-picker';
import { getDatabase, withTransaction } from '../../src/db/database';
import { useLanguage } from '../../src/i18n/LanguageContext';
import { useAuth } from '../../src/auth/useAuth';
import { TileCacheService } from '../../src/features/tiles/TileCacheService';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface PlanInfo {
  id: string;
  name: string;
  project_id?: string;
  floor_id?: string;
  width: number;
  height: number;
  image_url?: string;
  pdf_url?: string;
}

interface TaskPin {
  id: string;
  title: string;
  description?: string;
  pos_x: number;
  pos_y: number;
  status: 'open' | 'in_progress' | 'closed';
  priority?: string;
  version: number;
}

interface CircuitPin {
  id: string;
  circuit_name: string;
  circuit_code?: string;
  short_label?: string;
  full_name?: string;
  type?: string;
  marker_shape?: string;
  color?: string;
  phase?: number;
  breaker_current?: number;
  fuse_type?: string;
  pos_x: number;
  pos_y: number;
}

interface CablePin {
  id: string;
  cable_number: string;
  cable_type: string;
  length?: number;
  status?: string;
  points_json?: string;
}

interface PlanSymbolPin {
  id: string;
  symbol_type: string;
  x_norm: number;
  y_norm: number;
  pos_x: number;
  pos_y: number;
  label?: string;
  loop_number?: string;
  address?: string;
  description?: string;
  parsed_desc?: any;
}

interface FloorOption {
  id: string;
  name: string;
  plan_id?: string;
}

export type SymbolCategory = 'tasks' | 'heating' | 'circuits' | 'lighting' | 'bma' | 'notlicht' | 'cables' | 'klappen';

export interface SymbolDefinition {
  id: string;
  category: SymbolCategory;
  name: string;
  emoji: string;
  color: string;
  defaultLabel?: string;
}

export const ALL_SYMBOLS: SymbolDefinition[] = [
  // 1. Tasks & Photo Pins
  { id: 'task', category: 'tasks', name: 'Zadanie montażowe', emoji: '📌', color: '#0284C7', defaultLabel: 'Zadanie' },
  { id: 'photo_pin', category: 'tasks', name: 'Foto-Pin (Zdjęcie punktu)', emoji: '📷', color: '#0284C7', defaultLabel: 'Foto' },
  { id: 'montage_doku', category: 'tasks', name: 'Montage-Doku (Montaż)', emoji: '🛠️', color: '#8B5CF6', defaultLabel: 'Montaż' },
  { id: 'damage', category: 'tasks', name: 'Beschädigung (Uszkodzenie)', emoji: '⚠️', color: '#EF4444', defaultLabel: 'Uszkodzenie' },

  // 2. Heating & Wärmepumpen / Pompy Ciepła
  { id: 'warmepumpe_aussen', category: 'heating', name: 'Wärmepumpe Außen (Jedn. zewn.)', emoji: '❄️', color: '#0284C7', defaultLabel: 'WP Außen' },
  { id: 'warmepumpe_innen', category: 'heating', name: 'Wärmepumpe Innen (Hydrobox)', emoji: '🏠', color: '#0EA5E9', defaultLabel: 'WP Innen' },
  { id: 'infrarotheizung', category: 'heating', name: 'Infrarotheizung (Promiennik)', emoji: '♨️', color: '#F97316', defaultLabel: 'Infrarot' },
  { id: 'geraet_box', category: 'heating', name: 'Gerät / Steuerung (Sterowanie)', emoji: '🎛️', color: '#6366F1', defaultLabel: 'Gerät' },
  { id: 'temperaturfuehler', category: 'heating', name: 'Temperaturfühler (Czujnik T)', emoji: '🌡️', color: '#10B981', defaultLabel: 'Temp' },
  { id: 'heizkreisverteiler', category: 'heating', name: 'Heizkreisverteiler (Rozdzielacz CO)', emoji: '🚰', color: '#0284C7', defaultLabel: 'HKV' },
  { id: 'pufferspeicher', category: 'heating', name: 'Pufferspeicher (Zasobnik)', emoji: '🛢️', color: '#64748B', defaultLabel: 'Speicher' },

  // 3. Elektro & Gniazda
  { id: 'socket', category: 'circuits', name: 'Gniazdo 230V 1-faz', emoji: '🔌', color: '#3B82F6', defaultLabel: 'Gniazdo' },
  { id: 'socket_2x', category: 'circuits', name: 'Gniazdo podwójne 2x', emoji: '🔌', color: '#2563EB', defaultLabel: 'Gniazdo 2x' },
  { id: 'cee', category: 'circuits', name: 'Gniazdo siłowe CEE 16A/32A', emoji: '⚡', color: '#EF4444', defaultLabel: 'CEE' },
  { id: 'edv', category: 'circuits', name: 'Gniazdo EDV / LAN RJ45', emoji: '🌐', color: '#10B981', defaultLabel: 'EDV' },
  { id: 'kabelauslass', category: 'circuits', name: 'Kabelauslass (Wypust)', emoji: '⚡', color: '#475569', defaultLabel: 'Wypust' },
  { id: 'verteiler', category: 'circuits', name: 'Verteiler (Rozdzielnica UV/SV)', emoji: '📦', color: '#8B5CF6', defaultLabel: 'UV' },

  // 4. Oświetlenie
  { id: 'light', category: 'lighting', name: 'Lampa sufitowa (Licht)', emoji: '💡', color: '#EAB308', defaultLabel: 'Lampa' },
  { id: 'wandleuchte', category: 'lighting', name: 'Kinkiet ścienny', emoji: '💡', color: '#CA8A04', defaultLabel: 'Kinkiet' },
  { id: 'led_stripe', category: 'lighting', name: 'LED Stripe (Pasek LED)', emoji: '✨', color: '#FACC15', defaultLabel: 'LED' },
  { id: 'switch', category: 'lighting', name: 'Włącznik / Przełącznik', emoji: '🔘', color: '#EAB308', defaultLabel: 'Włącznik' },

  // 5. BMA & Brandschutz
  { id: 'detector_blue', category: 'bma', name: 'D-Melder (Optyczna dymu)', emoji: '🚨', color: '#EF4444', defaultLabel: 'D-Melder' },
  { id: 'detector_red', category: 'bma', name: 'ZWD-Melder (Dwuprzetwornikowa OT)', emoji: '🚨', color: '#DC2626', defaultLabel: 'ZWD-Melder' },
  { id: 'thermo_melder', category: 'bma', name: 'Thermo-Melder (Termiczna T)', emoji: '🔥', color: '#B91C1C', defaultLabel: 'T-Melder' },
  { id: 'handmelder', category: 'bma', name: 'Handmelder (ROP / Przycisk)', emoji: '🛑', color: '#EF4444', defaultLabel: 'ROP' },
  { id: 'sirene', category: 'bma', name: 'Sirene / Sygnalizator', emoji: '📢', color: '#F97316', defaultLabel: 'Sirene' },
  { id: 'koppler', category: 'bma', name: 'Linienkoppler / Moduł', emoji: '🔲', color: '#991B1B', defaultLabel: 'Koppler' },
  { id: 'bmz', category: 'bma', name: 'BMA-Zentrale (Centrala BMZ)', emoji: '🏢', color: '#7F1D1D', defaultLabel: 'BMZ' },

  // 6. Notlicht & Pikto
  { id: 'notleuchte', category: 'notlicht', name: 'Notbeleuchtung (Awaryjna)', emoji: '🟢', color: '#16A34A', defaultLabel: 'Notlicht' },
  { id: 'notlicht_pikto_right', category: 'notlicht', name: 'Pikto Wyjście w prawo ➡️', emoji: '➡️', color: '#16A34A', defaultLabel: 'Pikto ➡️' },
  { id: 'notlicht_pikto_left', category: 'notlicht', name: 'Pikto Wyjście w lewo ⬅️', emoji: '⬅️', color: '#16A34A', defaultLabel: 'Pikto ⬅️' },
  { id: 'notlicht_pikto_down', category: 'notlicht', name: 'Pikto Wyjście w dół ⬇️', emoji: '⬇️', color: '#16A34A', defaultLabel: 'Pikto ⬇️' },
  { id: 'notlicht_pikto_up', category: 'notlicht', name: 'Pikto Wyjście w górę ⬆️', emoji: '⬆️', color: '#16A34A', defaultLabel: 'Pikto ⬆️' },

  // 7. Kable & Trasy kablowe
  { id: 'kabeltrasse', category: 'cables', name: 'Kabeltrasse (Trasa / Drabinka)', emoji: '🪜', color: '#059669', defaultLabel: 'Trasa' },
  { id: 'kabelzug', category: 'cables', name: 'Kabelzug (Linia kablowa)', emoji: '〰️', color: '#38BDF8', defaultLabel: 'Kabel' },
  { id: 'freie_leitung', category: 'cables', name: 'Freie Leitung (Wolny przewód)', emoji: '🔌', color: '#06B6D4', defaultLabel: 'Przewód' },

  // 8. Klapy rewizyjne & Inne
  { id: 'revisionsklappe', category: 'klappen', name: 'Revisionsklappe (Klapa rewizyjna)', emoji: '🔲', color: '#D97706', defaultLabel: 'Klapa' },
  { id: 'abdeckung', category: 'klappen', name: 'Abdeckung (Maska tła)', emoji: '⬜', color: '#64748B', defaultLabel: 'Abdeckung' },
  { id: 'anderungen', category: 'klappen', name: 'Änderungen / Rewizja', emoji: '☁️', color: '#DC2626', defaultLabel: 'Rewizja' },
];

export default function InteractivePlanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const webViewRef = useRef<WebView>(null);
  const { t } = useLanguage();
  const { isAdmin, session } = useAuth();

  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [isLocalTileCached, setIsLocalTileCached] = useState(false);
  const [floors, setFloors] = useState<FloorOption[]>([]);
  const [currentFloorId, setCurrentFloorId] = useState<string | null>(null);

  // Entities
  const [tasks, setTasks] = useState<TaskPin[]>([]);
  const [circuits, setCircuits] = useState<CircuitPin[]>([]);
  const [cables, setCables] = useState<CablePin[]>([]);
  const [symbols, setSymbols] = useState<PlanSymbolPin[]>([]);

  // Layers Visibility (1:1 with Web)
  const [layers, setLayers] = useState<Record<SymbolCategory, boolean>>({
    tasks: true,
    heating: true,
    circuits: true,
    lighting: true,
    bma: true,
    notlicht: true,
    cables: true,
    klappen: true,
  });
  const [showLayersModal, setShowLayersModal] = useState(false);

  // Selected Entity for Bottom Inspection Drawer
  const [selectedTask, setSelectedTask] = useState<TaskPin | null>(null);
  const [selectedCircuit, setSelectedCircuit] = useState<CircuitPin | null>(null);
  const [selectedCable, setSelectedCable] = useState<CablePin | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<PlanSymbolPin | null>(null);

  // Add Object Modal (via Map Click)
  const [newPinCoords, setNewPinCoords] = useState<{ x: number; y: number } | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<SymbolCategory>('tasks');
  const [selectedSymbolType, setSelectedSymbolType] = useState<string>('task');
  const [objectTitle, setObjectTitle] = useState('');
  const [objectDesc, setObjectDesc] = useState('');
  const [objectPowerKw, setObjectPowerKw] = useState('');
  const [objectZuleitung, setObjectZuleitung] = useState('');
  const [objectKlappeSize, setObjectKlappeSize] = useState('40x40');
  const [objectTrasseSize, setObjectTrasseSize] = useState('200x60mm');
  const [attachedPhotoUrl, setAttachedPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const toggleLayer = (cat: SymbolCategory) => {
    setLayers((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  const loadPlan = useCallback(async () => {
    try {
      setLoading(true);
      const db = await getDatabase();
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://inspecthero.pl';
      const token = session?.access_token;
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      // 1. Fetch Plan from SQLite
      let planRow: PlanInfo | null = null;
      if (id) {
        planRow = await db.getFirstAsync<PlanInfo>(
          'SELECT id, project_id, floor_id, name, width, height, image_url, pdf_url FROM plans WHERE id = ? AND deleted_at IS NULL;',
          [id]
        );
      }

      if (!planRow && !id) {
        planRow = await db.getFirstAsync<PlanInfo>(
          'SELECT id, project_id, floor_id, name, width, height, image_url, pdf_url FROM plans WHERE deleted_at IS NULL LIMIT 1;'
        );
      }

      const activePlanId = id || planRow?.id || 'pln-sample-001';

      // 2. Fetch metadata from server
      let fetchedWidth = planRow?.width || 1920;
      let fetchedHeight = planRow?.height || 1080;
      let activeProjectId = planRow?.project_id || '';

      try {
        const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
        const metaRes = await fetch(`${apiUrl}/api/tiles/${activePlanId}/meta${tokenParam}`);
        if (metaRes.ok) {
          const meta = await metaRes.json();
          if (meta.imageWidth && meta.imageHeight) {
            fetchedWidth = meta.imageWidth;
            fetchedHeight = meta.imageHeight;
          } else if (meta.gridW && meta.gridH && meta.tileSize) {
            fetchedWidth = meta.gridW * meta.tileSize;
            fetchedHeight = meta.gridH * meta.tileSize;
          }
        }
      } catch (e) {
        // offline fallback
      }

      if (!activeProjectId && token) {
        try {
          const pRes = await fetch(`${apiUrl}/api/plans?id=${activePlanId}`, { headers });
          if (pRes.ok) {
            const pJson = await pRes.json();
            const pData = Array.isArray(pJson) ? pJson[0] : (pJson?.data?.[0] || pJson?.data || pJson);
            if (pData?.project_id) {
              activeProjectId = pData.project_id;
            }
          }
        } catch {}
      }

      const activePlan: PlanInfo = {
        id: activePlanId,
        name: planRow?.name || `Plan architektoniczny (${activePlanId.slice(0, 8)})`,
        project_id: activeProjectId || planRow?.project_id,
        floor_id: planRow?.floor_id,
        width: fetchedWidth,
        height: fetchedHeight,
        image_url: planRow?.image_url,
        pdf_url: planRow?.pdf_url,
      };

      setPlan(activePlan);
      setCurrentFloorId(activePlan.floor_id || null);

      const isCached = await TileCacheService.isPlanCachedLocally(activePlanId);
      setIsLocalTileCached(isCached);

      // 3. Fetch Tasks on Plan (SQLite fallback + live API sync)
      let loadedTasks: TaskPin[] = [];
      const localTaskRows = await db.getAllAsync<TaskPin>(
        'SELECT id, title, description, pos_x, pos_y, status, priority, version FROM tasks WHERE plan_id = ? AND deleted_at IS NULL;',
        [activePlanId]
      );
      loadedTasks = localTaskRows || [];

      if (token) {
        try {
          const taskUrl = `${apiUrl}/api/tasks?planId=${activePlanId}${activeProjectId ? `&projectId=${activeProjectId}` : ''}&limit=500`;
          const tRes = await fetch(taskUrl, { headers });
          if (tRes.ok) {
            const tJson = await tRes.json();
            const taskData = Array.isArray(tJson) ? tJson : (tJson?.data || []);
            if (Array.isArray(taskData) && taskData.length > 0) {
              loadedTasks = taskData.map((t: any) => {
                const normX = t.render_x ?? t.x_norm;
                const normY = t.render_y ?? t.y_norm;
                const px = normX != null ? Math.round(normX * fetchedWidth) : (t.pos_x || 100);
                const py = normY != null ? Math.round(normY * fetchedHeight) : (t.pos_y || 100);
                return {
                  id: t.id,
                  title: t.title || 'Zadanie',
                  description: t.description || undefined,
                  pos_x: px,
                  pos_y: py,
                  status: t.status || 'open',
                  priority: t.priority || 'normal',
                  version: t.version || 1,
                };
              });
            }
          }
        } catch (taskErr) {
          console.warn('[InteractivePlan] Tasks sync error:', taskErr);
        }
      }
      setTasks(loadedTasks);

      // 4. Fetch Stromkreise (Circuits)
      let loadedCircuits: CircuitPin[] = [];
      const localCircuitRows = await db.getAllAsync<CircuitPin>(
        'SELECT id, circuit_name, fuse_type, pos_x, pos_y FROM stromkreise WHERE plan_id = ? AND deleted_at IS NULL;',
        [activePlanId]
      );
      loadedCircuits = localCircuitRows || [];

      if (token && activeProjectId) {
        try {
          const circUrl = `${apiUrl}/api/stromkreise?projectId=${activeProjectId}&planId=${activePlanId}`;
          const cRes = await fetch(circUrl, { headers });
          if (cRes.ok) {
            const cJson = await cRes.json();
            const circData = Array.isArray(cJson) ? cJson : (cJson?.data || []);
            if (Array.isArray(circData) && circData.length > 0) {
              loadedCircuits = circData.map((c: any) => {
                const px = c.x_norm != null ? Math.round(c.x_norm * fetchedWidth) : (c.pos_x || 200);
                const py = c.y_norm != null ? Math.round(c.y_norm * fetchedHeight) : (c.pos_y || 200);
                return {
                  id: c.id,
                  circuit_name: c.circuit_code || c.short_label || c.full_name || 'Obwód',
                  circuit_code: c.circuit_code || c.short_label,
                  short_label: c.short_label,
                  full_name: c.full_name,
                  type: c.type || 'socket',
                  marker_shape: c.marker_shape || 'circle',
                  color: c.color,
                  phase: c.phase,
                  breaker_current: c.breaker_current,
                  fuse_type: c.breaker_current ? `${c.breaker_curve || 'B'}${c.breaker_current}A` : (c.fuse_type || 'B16'),
                  pos_x: px,
                  pos_y: py,
                };
              });
            }
          }
        } catch (circErr) {
          console.warn('[InteractivePlan] Circuits sync error:', circErr);
        }
      }
      setCircuits(loadedCircuits);

      // 5. Fetch Cables
      const cableRows = await db.getAllAsync<CablePin>(
        'SELECT id, cable_number, cable_type, length, status, points_json FROM cables WHERE plan_id = ? AND deleted_at IS NULL;',
        [activePlanId]
      );
      setCables(cableRows || []);

      // 6. Fetch Plan Symbols (Wärmepumpen, Heizung, BMA, Notlicht, Klappen, Foto-Pins, etc.)
      let loadedSymbols: PlanSymbolPin[] = [];
      const localSymbolRows = (await db.getAllAsync(
        'SELECT id, symbol_type, x_norm, y_norm, label, loop_number, address, description FROM plan_bma_symbols WHERE plan_id = ? AND deleted_at IS NULL;',
        [activePlanId]
      )) as any[];

      if (localSymbolRows && localSymbolRows.length > 0) {
        loadedSymbols = localSymbolRows.map((s) => {
          const px = Math.round(s.x_norm * fetchedWidth);
          const py = Math.round(s.y_norm * fetchedHeight);
          let parsed: any = {};
          try {
            if (s.description && s.description.startsWith('{')) {
              parsed = JSON.parse(s.description);
            }
          } catch {}
          return {
            id: s.id,
            symbol_type: s.symbol_type,
            x_norm: s.x_norm,
            y_norm: s.y_norm,
            pos_x: px,
            pos_y: py,
            label: s.label,
            loop_number: s.loop_number,
            address: s.address,
            description: s.description,
            parsed_desc: parsed,
          };
        });
      }

      if (token) {
        try {
          const symRes = await fetch(`${apiUrl}/api/plans/${activePlanId}/bma-symbols`, { headers });
          if (symRes.ok) {
            const symJson = await symRes.json();
            const symList = symJson.symbols || [];
            if (Array.isArray(symList) && symList.length > 0) {
              loadedSymbols = symList.map((s: any) => {
                const px = Math.round(s.x_norm * fetchedWidth);
                const py = Math.round(s.y_norm * fetchedHeight);
                let parsed: any = {};
                try {
                  if (s.description && s.description.startsWith('{')) {
                    parsed = JSON.parse(s.description);
                  }
                } catch {}

                // Store in local SQLite
                db.runAsync(
                  `INSERT INTO plan_bma_symbols (id, plan_id, symbol_type, x_norm, y_norm, label, loop_number, address, description, version)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                   ON CONFLICT(id) DO UPDATE SET symbol_type = excluded.symbol_type, x_norm = excluded.x_norm, y_norm = excluded.y_norm, label = excluded.label, description = excluded.description;`,
                  [s.id, activePlanId, s.symbol_type, s.x_norm, s.y_norm, s.label || null, s.loop_number || null, s.address || null, s.description || null]
                ).catch(() => {});

                return {
                  id: s.id,
                  symbol_type: s.symbol_type,
                  x_norm: s.x_norm,
                  y_norm: s.y_norm,
                  pos_x: px,
                  pos_y: py,
                  label: s.label,
                  loop_number: s.loop_number,
                  address: s.address,
                  description: s.description,
                  parsed_desc: parsed,
                };
              });
            }
          }
        } catch (symErr) {
          console.warn('[InteractivePlan] Symbols API sync error:', symErr);
        }
      }
      setSymbols(loadedSymbols);

      // 7. Fetch Floors
      if (activePlan.project_id) {
        const floorRows = await db.getAllAsync<FloorOption>(`
          SELECT f.id, f.name, (SELECT p.id FROM plans p WHERE p.floor_id = f.id AND p.deleted_at IS NULL LIMIT 1) as plan_id
          FROM floors f
          JOIN buildings b ON f.building_id = b.id
          WHERE b.project_id = ? AND f.deleted_at IS NULL
          ORDER BY f.level_number ASC;
        `, [activePlan.project_id]);
        setFloors(floorRows);
      }
    } catch (err) {
      console.error('[InteractivePlan] Load error:', err);
    } finally {
      setLoading(false);
    }
  }, [id, session?.access_token]);

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  const handleWebViewMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === 'TASK_CLICK') {
        const found = tasks.find((t) => t.id === data.id);
        if (found) {
          setSelectedTask(found);
          setSelectedCircuit(null);
          setSelectedCable(null);
          setSelectedSymbol(null);
        }
      } else if (data.type === 'CIRCUIT_CLICK') {
        const found = circuits.find((c) => c.id === data.id);
        if (found) {
          setSelectedCircuit(found);
          setSelectedTask(null);
          setSelectedCable(null);
          setSelectedSymbol(null);
        }
      } else if (data.type === 'CABLE_CLICK') {
        const found = cables.find((c) => c.id === data.id);
        if (found) {
          setSelectedCable(found);
          setSelectedTask(null);
          setSelectedCircuit(null);
          setSelectedSymbol(null);
        }
      } else if (data.type === 'SYMBOL_CLICK') {
        const found = symbols.find((s) => s.id === data.id);
        if (found) {
          setSelectedSymbol(found);
          setSelectedTask(null);
          setSelectedCircuit(null);
          setSelectedCable(null);
        }
      } else if (data.type === 'MAP_CLICK') {
        setNewPinCoords({ x: Math.round(data.x), y: Math.round(data.y) });
        const def = ALL_SYMBOLS.find((s) => s.id === selectedSymbolType) || ALL_SYMBOLS[0];
        setObjectTitle(def.defaultLabel || '');
        setObjectDesc('');
        setAttachedPhotoUrl(null);
      }
    } catch (e) {
      console.warn('[InteractivePlan] Parse message error:', e);
    }
  };

  const pickImage = async (useCamera = false) => {
    try {
      let result;
      if (useCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Brak uprawnień', 'Wymagany dostęp do aparatu');
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          quality: 0.8,
          allowsEditing: false,
        });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({
          quality: 0.8,
          allowsEditing: false,
        });
      }

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const localUri = result.assets[0].uri;
        setUploadingPhoto(true);

        // Upload to server
        const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://inspecthero.pl';
        const token = session?.access_token;
        const formData = new FormData();
        formData.append('file', {
          uri: localUri,
          name: `symbol_photo_${Date.now()}.jpg`,
          type: 'image/jpeg',
        } as any);

        const uploadRes = await fetch(`${apiUrl}/api/upload`, {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        });

        if (uploadRes.ok) {
          const uJson = await uploadRes.json();
          const photoUrl = uJson.url || uJson.file_url || localUri;
          setAttachedPhotoUrl(photoUrl);
        } else {
          setAttachedPhotoUrl(localUri);
        }
      }
    } catch (err: any) {
      Alert.alert('Błąd zdjęcia', err?.message || 'Nie udało się dołączyć zdjęcia');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const createObjectOnPlan = async () => {
    if (!newPinCoords || !plan) return;
    try {
      const db = await getDatabase();
      const now = new Date().toISOString();
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://inspecthero.pl';
      const token = session?.access_token;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const x_norm = Number((newPinCoords.x / (plan.width || 1920)).toFixed(4));
      const y_norm = Number((newPinCoords.y / (plan.height || 1080)).toFixed(4));
      const def = ALL_SYMBOLS.find((s) => s.id === selectedSymbolType) || ALL_SYMBOLS[0];
      const title = objectTitle.trim() || def.name;

      if (selectedSymbolType === 'task') {
        const newTaskId = `tsk-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const newTask: TaskPin = {
          id: newTaskId,
          title: title,
          description: objectDesc.trim() || undefined,
          pos_x: newPinCoords.x,
          pos_y: newPinCoords.y,
          status: 'open',
          priority: 'normal',
          version: 1,
        };

        await db.runAsync(`
          INSERT INTO tasks (
            id, plan_id, title, description, status, priority, pos_x, pos_y, version, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?);
        `, [
          newTask.id,
          plan.id,
          newTask.title,
          newTask.description || null,
          newTask.status,
          newTask.priority || 'normal',
          newTask.pos_x,
          newTask.pos_y,
          now,
          now,
        ]);

        setTasks((prev) => [...prev, newTask]);
        webViewRef.current?.injectJavaScript(`
          if (window.addTaskMarker) {
            window.addTaskMarker(${JSON.stringify(newTask)});
          }
          true;
        `);
      } else if (def.category === 'circuits' && ['socket', 'socket_2x', 'cee', 'edv', 'kabelauslass', 'verteiler'].includes(selectedSymbolType)) {
        const newCircId = `circ-${Date.now()}`;
        const newCirc: CircuitPin = {
          id: newCircId,
          circuit_name: title,
          circuit_code: title,
          full_name: objectDesc.trim() || undefined,
          type: selectedSymbolType,
          fuse_type: 'B16',
          pos_x: newPinCoords.x,
          pos_y: newPinCoords.y,
        };

        await db.runAsync(`
          INSERT INTO stromkreise (id, plan_id, circuit_name, fuse_type, pos_x, pos_y, version)
          VALUES (?, ?, ?, ?, ?, ?, 1);
        `, [newCirc.id, plan.id, newCirc.circuit_name, newCirc.fuse_type || 'B16', newCirc.pos_x, newCirc.pos_y]);

        setCircuits((prev) => [...prev, newCirc]);
        webViewRef.current?.injectJavaScript(`
          if (window.addCircuitMarker) {
            window.addCircuitMarker(${JSON.stringify(newCirc)});
          }
          true;
        `);
      } else {
        // Generic Plan Symbol (Heizung/Wärmepumpen, BMA, Notlicht, Klappen, Foto-Pins, etc.)
        const newSymId = `sym-${Date.now()}`;
        const descData: any = {};
        if (objectDesc.trim()) descData.notes = objectDesc.trim();
        if (objectPowerKw.trim()) descData.powerKw = objectPowerKw.trim();
        if (objectZuleitung.trim()) descData.zuleitung = objectZuleitung.trim();
        if (selectedSymbolType === 'revisionsklappe') descData.size = objectKlappeSize;
        if (selectedSymbolType === 'kabeltrasse') descData.trasseSize = objectTrasseSize;
        if (attachedPhotoUrl) descData.photos = [attachedPhotoUrl];

        const descString = Object.keys(descData).length > 0 ? JSON.stringify(descData) : null;

        const newSym: PlanSymbolPin = {
          id: newSymId,
          symbol_type: selectedSymbolType,
          x_norm: x_norm,
          y_norm: y_norm,
          pos_x: newPinCoords.x,
          pos_y: newPinCoords.y,
          label: title,
          description: descString || undefined,
          parsed_desc: descData,
        };

        await db.runAsync(`
          INSERT INTO plan_bma_symbols (id, plan_id, symbol_type, x_norm, y_norm, label, description, version)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1);
        `, [newSym.id, plan.id, newSym.symbol_type, newSym.x_norm, newSym.y_norm, newSym.label || null, newSym.description || null]);

        // Push to server API
        if (token) {
          fetch(`${apiUrl}/api/plans/${plan.id}/bma-symbols`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              id: newSym.id,
              symbol_type: newSym.symbol_type,
              x_norm: newSym.x_norm,
              y_norm: newSym.y_norm,
              label: newSym.label,
              description: newSym.description,
            }),
          }).catch((err) => console.warn('[InteractivePlan] Symbol post error:', err));
        }

        setSymbols((prev) => [...prev, newSym]);
        webViewRef.current?.injectJavaScript(`
          if (window.addPlanSymbolMarker) {
            window.addPlanSymbolMarker(${JSON.stringify(newSym)});
          }
          true;
        `);
      }

      setNewPinCoords(null);
      setObjectTitle('');
      setObjectDesc('');
      setObjectPowerKw('');
      setObjectZuleitung('');
      setAttachedPhotoUrl(null);
    } catch (err: any) {
      Alert.alert('Błąd', err?.message || 'Nie udało się wstawić obiektu');
    }
  };

  // Layer Counts
  const layerCounts = useMemo(() => {
    const counts: Record<SymbolCategory, number> = {
      tasks: tasks.length + symbols.filter((s) => ['photo_pin', 'montage_doku', 'damage'].includes(s.symbol_type)).length,
      heating: symbols.filter((s) => ['warmepumpe_aussen', 'warmepumpe_innen', 'infrarotheizung', 'geraet_box', 'temperaturfuehler', 'heizkreisverteiler', 'pufferspeicher'].includes(s.symbol_type)).length,
      circuits: circuits.length + symbols.filter((s) => ['socket', 'socket_2x', 'cee', 'edv', 'kabelauslass', 'verteiler'].includes(s.symbol_type)).length,
      lighting: symbols.filter((s) => ['light', 'wandleuchte', 'led_stripe', 'switch'].includes(s.symbol_type)).length,
      bma: symbols.filter((s) => ['detector_blue', 'detector_red', 'thermo_melder', 'handmelder', 'sirene', 'koppler', 'bmz'].includes(s.symbol_type)).length,
      notlicht: symbols.filter((s) => s.symbol_type.startsWith('notlicht') || s.symbol_type === 'notleuchte').length,
      cables: cables.length + symbols.filter((s) => ['kabeltrasse', 'kabelzug', 'freie_leitung'].includes(s.symbol_type)).length,
      klappen: symbols.filter((s) => ['revisionsklappe', 'abdeckung', 'anderungen'].includes(s.symbol_type)).length,
    };
    return counts;
  }, [tasks, circuits, cables, symbols]);

  const generateLeafletHtml = () => {
    const width = plan?.width || 1920;
    const height = plan?.height || 1080;
    const planId = plan?.id || id || '';
    const token = session?.access_token || '';
    const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://inspecthero.pl';

    const visibleTasks = layers.tasks ? tasks : [];
    const visibleCircuits = layers.circuits ? circuits : [];
    const visibleCables = layers.cables ? cables : [];

    const visibleSymbols = symbols.filter((s) => {
      const def = ALL_SYMBOLS.find((d) => d.id === s.symbol_type);
      const cat = def?.category || 'klappen';
      return layers[cat] ?? true;
    });

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes, viewport-fit=cover" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          * {
            -webkit-tap-highlight-color: transparent;
            box-sizing: border-box;
          }
          html, body, #map {
            width: 100%;
            height: 100%;
            margin: 0;
            padding: 0;
            background-color: #030712;
            overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            touch-action: pan-x pan-y pinch-zoom;
            user-select: none;
          }
          .custom-pin {
            width: 28px;
            height: 28px;
            border-radius: 50% !important;
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #ffffff;
            font-weight: 800;
            font-size: 11px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
            border: 2px solid #ffffff;
            cursor: pointer;
            transition: transform 0.15s ease;
          }
          .custom-pin:hover {
            transform: scale(1.2);
          }
          .pin-open { background-color: #38BDF8; }
          .pin-in_progress { background-color: #EAB308; }
          .pin-closed { background-color: #22C55E; }
          .pin-label {
            position: absolute;
            bottom: -18px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(15, 23, 42, 0.94);
            color: #F8FAFC;
            font-size: 9px;
            font-weight: 700;
            padding: 1px 5px;
            border-radius: 4px;
            white-space: nowrap;
            border: 1px solid #334155;
            pointer-events: none;
            box-shadow: 0 1px 4px rgba(0,0,0,0.5);
          }
          .leaflet-container {
            background-color: #030712 !important;
          }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          const width = ${width};
          const height = ${height};
          const planId = "${planId}";
          const token = "${token}";
          const apiUrl = "${apiUrl}";
          const maxZoom = 5;
          const minZoom = 1;
          const tileSize = 256;

          const gridW = Math.ceil(width / tileSize);
          const gridH = Math.ceil(height / tileSize);
          const worldPxW = gridW * tileSize;
          const worldPxH = gridH * tileSize;

          const sw = [-worldPxH / Math.pow(2, maxZoom), 0];
          const ne = [0, worldPxW / Math.pow(2, maxZoom)];
          const bounds = [sw, ne];

          const map = L.map('map', {
            crs: L.CRS.Simple,
            minZoom: minZoom,
            maxZoom: maxZoom + 1,
            zoomSnap: 0.25,
            zoomDelta: 0.5,
            attributionControl: false,
            maxBounds: bounds,
            maxBoundsViscosity: 0.8,
          });

          function escapeHtml(str) {
            if (str === null || str === undefined) return '';
            return String(str)
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;');
          }

          function send(obj) {
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify(obj));
            }
          }

          const symbolMeta = ${JSON.stringify(ALL_SYMBOLS)};

          window.addTaskMarker = function(t) {
            if (!t) return;
            const lat = -(t.pos_y || 400) / Math.pow(2, maxZoom);
            const lng = (t.pos_x || 400) / Math.pow(2, maxZoom);
            const statusClass = 'pin-' + (t.status || 'open');
            const safeTitle = escapeHtml(t.title || 'Zadanie').substring(0, 20);

            const icon = L.divIcon({
              className: '',
              html: '<div class="custom-pin ' + statusClass + '" style="width: 28px; height: 28px;">📌<span class="pin-label">' + safeTitle + '</span></div>',
              iconSize: [28, 28],
              iconAnchor: [14, 14],
            });

            const marker = L.marker([lat, lng], { icon: icon }).addTo(map);
            marker.on('click', function(e) {
              L.DomEvent.stopPropagation(e);
              send({ type: 'TASK_CLICK', id: t.id });
            });
          };

          window.addCircuitMarker = function(c) {
            if (!c) return;
            const lat = -(c.pos_y || 500) / Math.pow(2, maxZoom);
            const lng = (c.pos_x || 500) / Math.pow(2, maxZoom);
            const safeName = escapeHtml(c.circuit_code || c.short_label || c.circuit_name || 'Obwód').substring(0, 15);

            let emoji = '⚡';
            let bgCol = '#3B82F6';
            if (c.type === 'light') { emoji = '💡'; bgCol = '#EAB308'; }
            else if (c.type === 'cee') { emoji = '⚡'; bgCol = '#EF4444'; }
            else if (c.type === 'edv') { emoji = '🌐'; bgCol = '#10B981'; }

            const icon = L.divIcon({
              className: '',
              html: '<div class="custom-pin" style="width: 26px; height: 26px; background-color: ' + bgCol + ';">' + emoji + '<span class="pin-label">' + safeName + '</span></div>',
              iconSize: [26, 26],
              iconAnchor: [13, 13],
            });

            const marker = L.marker([lat, lng], { icon: icon }).addTo(map);
            marker.on('click', function(e) {
              L.DomEvent.stopPropagation(e);
              send({ type: 'CIRCUIT_CLICK', id: c.id });
            });
          };

          window.addPlanSymbolMarker = function(s) {
            if (!s) return;
            const lat = -(s.pos_y || (s.y_norm * height)) / Math.pow(2, maxZoom);
            const lng = (s.pos_x || (s.x_norm * width)) / Math.pow(2, maxZoom);
            const def = symbolMeta.find(function(d) { return d.id === s.symbol_type; }) || { emoji: '📍', color: '#38BDF8' };
            const safeLabel = escapeHtml(s.label || s.symbol_type).substring(0, 18);

            const icon = L.divIcon({
              className: '',
              html: '<div class="custom-pin" style="width: 28px; height: 28px; background-color: ' + def.color + ';">' + def.emoji + '<span class="pin-label">' + safeLabel + '</span></div>',
              iconSize: [28, 28],
              iconAnchor: [14, 14],
            });

            const marker = L.marker([lat, lng], { icon: icon }).addTo(map);
            marker.on('click', function(e) {
              L.DomEvent.stopPropagation(e);
              send({ type: 'SYMBOL_CLICK', id: s.id });
            });
          };

          window.addCablePolyline = function(c) {
            if (!c) return;
            let pts = [];
            try {
              if (c.points_json) pts = JSON.parse(c.points_json);
            } catch(e) {}

            if (pts && pts.length >= 2) {
              const latlngs = pts.map(function(p) {
                return [-p.y / Math.pow(2, maxZoom), p.x / Math.pow(2, maxZoom)];
              });
              const poly = L.polyline(latlngs, {
                color: c.cable_type && c.cable_type.includes('E30') ? '#F97316' : '#38BDF8',
                weight: 4,
                opacity: 0.85,
                dashArray: c.status === 'planned' ? '6, 6' : undefined,
              }).addTo(map);

              poly.on('click', function(e) {
                L.DomEvent.stopPropagation(e);
                send({ type: 'CABLE_CLICK', id: c.id });
              });
            }
          };

          // Tile Layer
          if (planId) {
            const tokenParam = token ? '?token=' + encodeURIComponent(token) : '';
            const localTileDir = "${isLocalTileCached ? TileCacheService.getPlanTilesDir(planId) : ''}";
            const tileUrl = localTileDir
              ? localTileDir + '{z}/{x}/{y}.png'
              : apiUrl + '/api/tiles/' + planId + '/{z}/{x}/{y}.png' + tokenParam;

            L.tileLayer(tileUrl, {
              minZoom: minZoom,
              maxZoom: maxZoom + 1,
              maxNativeZoom: maxZoom,
              tileSize: tileSize,
              noWrap: true,
              bounds: bounds,
              detectRetina: false,
              updateWhenZooming: false,
              keepBuffer: 6,
            }).addTo(map);
          }

          map.fitBounds(bounds);

          map.on('click', function(e) {
            const x = Math.round(e.latlng.lng * Math.pow(2, maxZoom));
            const y = Math.round(-e.latlng.lat * Math.pow(2, maxZoom));
            if (x >= 0 && x <= width && y >= 0 && y <= height) {
              send({ type: 'MAP_CLICK', x: x, y: y });
            }
          });

          // Render Active Elements
          ${JSON.stringify(visibleTasks)}.forEach(function(t) { window.addTaskMarker(t); });
          ${JSON.stringify(visibleCircuits)}.forEach(function(c) { window.addCircuitMarker(c); });
          ${JSON.stringify(visibleSymbols)}.forEach(function(s) { window.addPlanSymbolMarker(s); });
          ${JSON.stringify(visibleCables)}.forEach(function(c) { window.addCablePolyline(c); });
        </script>
      </body>
      </html>
    `;
  };

  const selectedCategorySymbols = ALL_SYMBOLS.filter((s) => s.category === selectedCategory);

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{
          title: plan?.name || 'Rzut Architektoniczny (Leaflet)',
          headerShown: true,
          headerBackTitle: 'Wróć',
          headerStyle: { backgroundColor: '#0B0F19' },
          headerTintColor: '#38BDF8',
          headerTitleStyle: { color: '#F8FAFC', fontWeight: '800' },
          headerRight: () => (
            <TouchableOpacity
              style={styles.headerLayersBtn}
              onPress={() => setShowLayersModal(true)}
            >
              <Text style={styles.headerLayersBtnText}>🗂️ Warstwy</Text>
            </TouchableOpacity>
          ),
        }}
      />

      {/* 1. Floor Quick Switcher Bar */}
      {floors.length > 0 && (
        <View style={styles.floorBar}>
          <Text style={styles.floorBarLabel}>KONDYGNACJA:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.floorScroll}>
            {floors.map((f) => (
              <TouchableOpacity
                key={f.id}
                style={[styles.floorChip, currentFloorId === f.id && styles.floorChipActive]}
                onPress={() => {
                  if (f.plan_id && f.plan_id !== id) {
                    router.push({ pathname: '/plans/[id]', params: { id: f.plan_id } } as any);
                  }
                }}
              >
                <Text style={[styles.floorChipText, currentFloorId === f.id && styles.floorChipTextActive]}>
                  {f.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* 2. Interactive Layer Switcher Toolbar */}
      <View style={styles.toolbarContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolbarScroll}>
          <TouchableOpacity
            style={[styles.toolChip, layers.tasks && styles.toolChipActive]}
            onPress={() => toggleLayer('tasks')}
          >
            <Text style={[styles.toolChipText, layers.tasks && styles.toolChipTextActive]}>
              📌 Zadania ({layerCounts.tasks})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.toolChip, layers.heating && styles.toolChipActive]}
            onPress={() => toggleLayer('heating')}
          >
            <Text style={[styles.toolChipText, layers.heating && styles.toolChipTextActive]}>
              ❄️ Pompy Ciepła ({layerCounts.heating})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.toolChip, layers.circuits && styles.toolChipActive]}
            onPress={() => toggleLayer('circuits')}
          >
            <Text style={[styles.toolChipText, layers.circuits && styles.toolChipTextActive]}>
              ⚡ Obwody ({layerCounts.circuits})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.toolChip, layers.lighting && styles.toolChipActive]}
            onPress={() => toggleLayer('lighting')}
          >
            <Text style={[styles.toolChipText, layers.lighting && styles.toolChipTextActive]}>
              💡 Oświetlenie ({layerCounts.lighting})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.toolChip, layers.bma && styles.toolChipActive]}
            onPress={() => toggleLayer('bma')}
          >
            <Text style={[styles.toolChipText, layers.bma && styles.toolChipTextActive]}>
              🚨 BMA ({layerCounts.bma})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.toolChip, layers.notlicht && styles.toolChipActive]}
            onPress={() => toggleLayer('notlicht')}
          >
            <Text style={[styles.toolChipText, layers.notlicht && styles.toolChipTextActive]}>
              🟢 Notlicht ({layerCounts.notlicht})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.toolChip, layers.cables && styles.toolChipActive]}
            onPress={() => toggleLayer('cables')}
          >
            <Text style={[styles.toolChipText, layers.cables && styles.toolChipTextActive]}>
              🪜 Trasy ({layerCounts.cables})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.toolChip, layers.klappen && styles.toolChipActive]}
            onPress={() => toggleLayer('klappen')}
          >
            <Text style={[styles.toolChipText, layers.klappen && styles.toolChipTextActive]}>
              🔲 Klapy ({layerCounts.klappen})
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* 3. Main Leaflet WebView Map */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#38BDF8" />
          <Text style={styles.loadingText}>Ładowanie kafelków PDF i obiektów Leaflet...</Text>
        </View>
      ) : (
        <View style={styles.mapWrapper}>
          <WebView
            ref={webViewRef}
            originWhitelist={['*']}
            source={{ html: generateLeafletHtml() }}
            style={styles.webView}
            onMessage={handleWebViewMessage}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            allowFileAccess={true}
            allowFileAccessFromFileURLs={true}
            allowUniversalAccessFromFileURLs={true}
            scalesPageToFit={false}
            scrollEnabled={false}
            bounces={false}
            overScrollMode="never"
            mixedContentMode="always"
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
          />
        </View>
      )}

      {/* 4. Bottom Task Inspection Drawer */}
      {selectedTask && (
        <View style={styles.drawer}>
          <View style={styles.drawerHandle} />
          <View style={styles.drawerHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.drawerTitle}>📌 {selectedTask.title}</Text>
              {selectedTask.description ? (
                <Text style={styles.drawerDesc}>{selectedTask.description}</Text>
              ) : null}
            </View>
            <TouchableOpacity onPress={() => setSelectedTask(null)} style={styles.drawerClose}>
              <Text style={styles.drawerCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.fullDetailsBtn}
            onPress={() => router.push(`/tasks/${selectedTask.id}` as any)}
          >
            <Text style={styles.fullDetailsBtnText}>📸 Szczegóły zadania & Zdjęcia →</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 5. Bottom Generic Symbol Drawer (Wärmepumpen, BMA, Notlicht, Klappen, Foto-Pins) */}
      {selectedSymbol && (
        <View style={styles.drawer}>
          <View style={styles.drawerHandle} />
          <View style={styles.drawerHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.drawerTitle, { color: '#38BDF8' }]}>
                {ALL_SYMBOLS.find((s) => s.id === selectedSymbol.symbol_type)?.emoji || '📍'} {selectedSymbol.label || selectedSymbol.symbol_type}
              </Text>
              <Text style={styles.drawerDesc}>
                Typ: {ALL_SYMBOLS.find((s) => s.id === selectedSymbol.symbol_type)?.name || selectedSymbol.symbol_type}
              </Text>
              {selectedSymbol.parsed_desc?.powerKw && (
                <Text style={[styles.drawerDesc, { color: '#F97316', marginTop: 2 }]}>
                  ⚡ Moc: {selectedSymbol.parsed_desc.powerKw} kW {selectedSymbol.parsed_desc.zuleitung ? `• Zasilanie: ${selectedSymbol.parsed_desc.zuleitung}` : ''}
                </Text>
              )}
              {selectedSymbol.parsed_desc?.size && (
                <Text style={[styles.drawerDesc, { color: '#D97706', marginTop: 2 }]}>
                  🔲 Wymiary klapy: {selectedSymbol.parsed_desc.size}
                </Text>
              )}
              {selectedSymbol.parsed_desc?.trasseSize && (
                <Text style={[styles.drawerDesc, { color: '#059669', marginTop: 2 }]}>
                  🪜 Rozmiar trasy: {selectedSymbol.parsed_desc.trasseSize}
                </Text>
              )}
              {selectedSymbol.parsed_desc?.notes && (
                <Text style={[styles.drawerDesc, { marginTop: 4 }]}>
                  {selectedSymbol.parsed_desc.notes}
                </Text>
              )}
              {selectedSymbol.parsed_desc?.photos?.[0] && (
                <Image
                  source={{ uri: selectedSymbol.parsed_desc.photos[0] }}
                  style={styles.drawerPhoto}
                  resizeMode="cover"
                />
              )}
            </View>
            <TouchableOpacity onPress={() => setSelectedSymbol(null)} style={styles.drawerClose}>
              <Text style={styles.drawerCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 6. Bottom Circuit Drawer */}
      {selectedCircuit && (
        <View style={styles.drawer}>
          <View style={styles.drawerHandle} />
          <View style={styles.drawerHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.drawerTitle, { color: '#A855F7' }]}>
                ⚡ {selectedCircuit.circuit_code || selectedCircuit.circuit_name}
              </Text>
              <Text style={styles.drawerDesc}>
                Typ: {selectedCircuit.type || 'Gniazdo'} • Zabezpieczenie: {selectedCircuit.fuse_type || 'B16'}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setSelectedCircuit(null)} style={styles.drawerClose}>
              <Text style={styles.drawerCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 7. Bottom Cable Drawer */}
      {selectedCable && (
        <View style={styles.drawer}>
          <View style={styles.drawerHandle} />
          <View style={styles.drawerHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.drawerTitle, { color: '#38BDF8' }]}>🔌 Kabel: {selectedCable.cable_number}</Text>
              <Text style={styles.drawerDesc}>Typ: {selectedCable.cable_type} • Długość: {selectedCable.length || 0}m</Text>
            </View>
            <TouchableOpacity onPress={() => setSelectedCable(null)} style={styles.drawerClose}>
              <Text style={styles.drawerCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 8. Modal: Layers Filter Sheet */}
      <Modal
        visible={showLayersModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLayersModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.layersModalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalHeading}>🗂️ Zarządzanie Warstwami Planu</Text>
              <TouchableOpacity onPress={() => setShowLayersModal(false)}>
                <Text style={styles.drawerCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: SCREEN_HEIGHT * 0.6 }}>
              {[
                { key: 'tasks', label: '📌 Zadania & Usterki', desc: 'Punkty zadań, usterki, foto-pins', count: layerCounts.tasks },
                { key: 'heating', label: '❄️ Pompy Ciepła & Heizung', desc: 'Wärmepumpen (Innen/Außen), promienniki, sterowniki', count: layerCounts.heating },
                { key: 'circuits', label: '⚡ Elektro & Obwody', desc: 'Gniazda 230V, CEE, EDV, rozdzielnice', count: layerCounts.circuits },
                { key: 'lighting', label: '💡 Oświetlenie & LED', desc: 'Oprawy, kinkiety, paski LED, włączniki', count: layerCounts.lighting },
                { key: 'bma', label: '🚨 BMA & Pożarówka', desc: 'Czujki dymu, ROP, syreny, centrale', count: layerCounts.bma },
                { key: 'notlicht', label: '🟢 Notbeleuchtung & Pikto', desc: 'Oprawy awaryjne, piktogramy ewakuacyjne', count: layerCounts.notlicht },
                { key: 'cables', label: '🪜 Kable & Trasy Kablowe', desc: 'Trasy, korytka, drabinki, odcinki kabli', count: layerCounts.cables },
                { key: 'klappen', label: '🔲 Klapy Rewizyjne & Maski', desc: 'Revisionsklappen, maski tła, chmurki zmian', count: layerCounts.klappen },
              ].map((item) => {
                const isActive = layers[item.key as SymbolCategory];
                return (
                  <TouchableOpacity
                    key={item.key}
                    style={[styles.layerItemRow, isActive && styles.layerItemRowActive]}
                    onPress={() => toggleLayer(item.key as SymbolCategory)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.layerItemTitle, isActive && styles.layerItemTitleActive]}>
                        {item.label} ({item.count})
                      </Text>
                      <Text style={styles.layerItemDesc}>{item.desc}</Text>
                    </View>
                    <View style={[styles.toggleCheckbox, isActive && styles.toggleCheckboxActive]}>
                      {isActive && <Text style={styles.toggleCheckMark}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              style={styles.savePinBtn}
              onPress={() => setShowLayersModal(false)}
            >
              <Text style={styles.savePinBtnText}>Gotowe</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 9. Modal: Add Pin / Object Placement Dialog */}
      <Modal
        visible={!!newPinCoords}
        transparent
        animationType="slide"
        onRequestClose={() => setNewPinCoords(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.createPinModal}>
            <Text style={styles.modalHeading}>📍 Wstaw Symbol / Obiekt na Planie</Text>
            <Text style={styles.coordsText}>
              Współrzędne: X={newPinCoords?.x}, Y={newPinCoords?.y}
            </Text>

            {/* Category Switcher Tabs */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
              {[
                { id: 'tasks', label: '📌 Zadania' },
                { id: 'heating', label: '❄️ Pompy Ciepła' },
                { id: 'circuits', label: '🔌 Elektro' },
                { id: 'lighting', label: '💡 Światło' },
                { id: 'bma', label: '🚨 BMA' },
                { id: 'notlicht', label: '🟢 Notlicht' },
                { id: 'cables', label: '🪜 Trasy' },
                { id: 'klappen', label: '🔲 Klapy' },
              ].map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.categoryTab, selectedCategory === cat.id && styles.categoryTabActive]}
                  onPress={() => {
                    setSelectedCategory(cat.id as SymbolCategory);
                    const firstInCat = ALL_SYMBOLS.find((s) => s.category === cat.id);
                    if (firstInCat) {
                      setSelectedSymbolType(firstInCat.id);
                      setObjectTitle(firstInCat.defaultLabel || firstInCat.name);
                    }
                  }}
                >
                  <Text style={[styles.categoryTabText, selectedCategory === cat.id && styles.categoryTabTextActive]}>
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Symbol Type Selector */}
            <Text style={styles.typeSelectorLabel}>WYBIERZ ELEMENT:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.symbolScroll}>
              {selectedCategorySymbols.map((sym) => (
                <TouchableOpacity
                  key={sym.id}
                  style={[styles.symbolCard, selectedSymbolType === sym.id && styles.symbolCardActive]}
                  onPress={() => {
                    setSelectedSymbolType(sym.id);
                    setObjectTitle(sym.defaultLabel || sym.name);
                  }}
                >
                  <Text style={styles.symbolCardEmoji}>{sym.emoji}</Text>
                  <Text style={[styles.symbolCardText, selectedSymbolType === sym.id && styles.symbolCardTextActive]}>
                    {sym.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Inputs Form */}
            <ScrollView style={{ maxHeight: 220 }}>
              <TextInput
                style={styles.input}
                placeholder="Etykieta / Tytuł / Oznaczenie..."
                placeholderTextColor="#64748B"
                value={objectTitle}
                onChangeText={setObjectTitle}
              />

              {/* Special Inputs for Heating / Pompy Ciepła */}
              {selectedCategory === 'heating' && (
                <View style={styles.rowInputs}>
                  <TextInput
                    style={[styles.input, { flex: 1, marginRight: 6 }]}
                    placeholder="Moc kW (np. 12)"
                    placeholderTextColor="#64748B"
                    keyboardType="numeric"
                    value={objectPowerKw}
                    onChangeText={setObjectPowerKw}
                  />
                  <TextInput
                    style={[styles.input, { flex: 1, marginLeft: 6 }]}
                    placeholder="Zasilanie (np. 400V 3x16A)"
                    placeholderTextColor="#64748B"
                    value={objectZuleitung}
                    onChangeText={setObjectZuleitung}
                  />
                </View>
              )}

              {/* Special Inputs for Klapy Rewizyjne */}
              {selectedSymbolType === 'revisionsklappe' && (
                <TextInput
                  style={styles.input}
                  placeholder="Wymiary klapy (np. 30x30, 40x40, 60x60)"
                  placeholderTextColor="#64748B"
                  value={objectKlappeSize}
                  onChangeText={setObjectKlappeSize}
                />
              )}

              {/* Special Inputs for Trasy Kablowe */}
              {selectedSymbolType === 'kabeltrasse' && (
                <TextInput
                  style={styles.input}
                  placeholder="Wymiary korytka / trasy (np. 200x60mm)"
                  placeholderTextColor="#64748B"
                  value={objectTrasseSize}
                  onChangeText={setObjectTrasseSize}
                />
              )}

              <TextInput
                style={[styles.input, { height: 60, textAlignVertical: 'top' }]}
                placeholder="Dodatkowy opis / specyfikacja techniczna..."
                placeholderTextColor="#64748B"
                value={objectDesc}
                onChangeText={setObjectDesc}
                multiline
              />

              {/* Photo Attachment Section */}
              <View style={styles.photoActionRow}>
                <TouchableOpacity
                  style={styles.photoBtn}
                  onPress={() => pickImage(true)}
                  disabled={uploadingPhoto}
                >
                  <Text style={styles.photoBtnText}>📷 Zrób zdjęcie</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.photoBtn}
                  onPress={() => pickImage(false)}
                  disabled={uploadingPhoto}
                >
                  <Text style={styles.photoBtnText}>🖼️ Z galerii</Text>
                </TouchableOpacity>

                {uploadingPhoto && <ActivityIndicator size="small" color="#38BDF8" />}
              </View>

              {attachedPhotoUrl && (
                <View style={styles.previewContainer}>
                  <Image source={{ uri: attachedPhotoUrl }} style={styles.attachedPreview} />
                  <TouchableOpacity
                    style={styles.removePhotoBadge}
                    onPress={() => setAttachedPhotoUrl(null)}
                  >
                    <Text style={styles.removePhotoText}>✕</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setNewPinCoords(null)}
              >
                <Text style={styles.cancelBtnText}>Anuluj</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.savePinBtn}
                onPress={createObjectOnPlan}
              >
                <Text style={styles.savePinBtnText}>Wstaw na plan</Text>
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
  headerLayersBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#1E293B',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#38BDF8',
    marginRight: 8,
  },
  headerLayersBtnText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '800',
  },
  floorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B0F19',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  floorBarLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '800',
    marginRight: 8,
  },
  floorScroll: {
    flexDirection: 'row',
  },
  floorChip: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  floorChipActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    borderColor: '#38BDF8',
  },
  floorChipText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
  },
  floorChipTextActive: {
    color: '#38BDF8',
  },
  toolbarContainer: {
    backgroundColor: '#0F172A',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  toolbarScroll: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  toolChip: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  toolChipActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderColor: '#38BDF8',
  },
  toolChipText: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
  },
  toolChipTextActive: {
    color: '#38BDF8',
  },
  mapWrapper: {
    flex: 1,
  },
  webView: {
    flex: 1,
    backgroundColor: '#030712',
  },
  drawer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: '#38BDF8',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 12,
  },
  drawerHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#334155',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 10,
  },
  drawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  drawerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 4,
  },
  drawerDesc: {
    fontSize: 13,
    color: '#94A3B8',
  },
  drawerPhoto: {
    width: '100%',
    height: 140,
    borderRadius: 8,
    marginTop: 8,
  },
  drawerClose: {
    padding: 6,
  },
  drawerCloseText: {
    color: '#94A3B8',
    fontSize: 18,
    fontWeight: '700',
  },
  fullDetailsBtn: {
    backgroundColor: '#1E293B',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#38BDF8',
    marginTop: 8,
  },
  fullDetailsBtnText: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.78)',
    justifyContent: 'center',
    padding: 16,
  },
  layersModalCard: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  layerItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#1E293B',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  layerItemRowActive: {
    borderColor: '#38BDF8',
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
  },
  layerItemTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#94A3B8',
  },
  layerItemTitleActive: {
    color: '#F8FAFC',
  },
  layerItemDesc: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  toggleCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#64748B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleCheckboxActive: {
    backgroundColor: '#38BDF8',
    borderColor: '#38BDF8',
  },
  toggleCheckMark: {
    color: '#0F172A',
    fontWeight: '900',
    fontSize: 13,
  },
  createPinModal: {
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
    marginBottom: 2,
  },
  coordsText: {
    fontSize: 11,
    color: '#38BDF8',
    marginBottom: 8,
    fontWeight: '700',
  },
  categoryScroll: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  categoryTab: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#1E293B',
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  categoryTabActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    borderColor: '#38BDF8',
  },
  categoryTabText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },
  categoryTabTextActive: {
    color: '#38BDF8',
  },
  typeSelectorLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  symbolScroll: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  symbolCard: {
    backgroundColor: '#1E293B',
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#334155',
    minWidth: 80,
  },
  symbolCardActive: {
    borderColor: '#38BDF8',
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
  },
  symbolCardEmoji: {
    fontSize: 18,
    marginBottom: 4,
  },
  symbolCardText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
    textAlign: 'center',
  },
  symbolCardTextActive: {
    color: '#38BDF8',
  },
  rowInputs: {
    flexDirection: 'row',
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
  photoActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  photoBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  photoBtnText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
  },
  previewContainer: {
    position: 'relative',
    marginBottom: 10,
    width: 80,
    height: 80,
  },
  attachedPreview: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  removePhotoBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#EF4444',
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removePhotoText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
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
  savePinBtn: {
    backgroundColor: '#38BDF8',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  savePinBtnText: {
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
});
