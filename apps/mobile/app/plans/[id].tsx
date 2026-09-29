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
import { getDatabase } from '../../src/db/database';
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
  gridW: number;
  gridH: number;
  tileSize: number;
  maxZoom: number;
  worldPxW: number;
  worldPxH: number;
  image_url?: string;
  pdf_url?: string;
}

interface TaskPin {
  id: string;
  title: string;
  description?: string;
  x_norm: number;
  y_norm: number;
  status: 'OPEN' | 'IN_PROGRESS' | 'DONE_WAITING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'open' | 'in_progress' | 'closed';
  priority?: string;
  version: number;
}

interface CircuitPin {
  id: string;
  circuit_name: string;
  circuit_code: string;
  short_label?: string;
  full_name?: string;
  type: string;
  fuse_type?: string;
  cable_type?: string;
  status?: string;
  orientation?: 'horizontal' | 'vertical';
  rotation?: number;
  metadata?: any;
  description?: string;
  x_norm: number;
  y_norm: number;
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

  // 3. Elektro & Gniazda (Stromkreise)
  { id: 'socket', category: 'circuits', name: 'Gniazdo 230V', emoji: '🔌', color: '#EF4444', defaultLabel: 'Gniazdo' },
  { id: 'socket_2x', category: 'circuits', name: 'Gniazdo 2x', emoji: '🔌', color: '#EF4444', defaultLabel: 'Gniazdo 2x' },
  { id: 'cee', category: 'circuits', name: 'CEE Siłowe', emoji: '⚡', color: '#A855F7', defaultLabel: 'CEE' },
  { id: 'edv', category: 'circuits', name: 'EDV / LAN RJ45', emoji: '🌐', color: '#EF4444', defaultLabel: 'EDV' },
  { id: 'kabelauslass', category: 'circuits', name: 'Kabelauslass (Wypust)', emoji: '⚡', color: '#64748B', defaultLabel: 'Wypust' },

  // 4. Oświetlenie
  { id: 'light', category: 'lighting', name: 'Lampa / Oprawa', emoji: '💡', color: '#F59E0B', defaultLabel: 'Lampa' },
  { id: 'wandleuchte', category: 'lighting', name: 'Kinkiet ścienny', emoji: '💡', color: '#D97706', defaultLabel: 'Kinkiet' },
  { id: 'led_stripe', category: 'lighting', name: 'LED Stripe (Pasek LED)', emoji: '✨', color: '#EAB308', defaultLabel: 'LED' },
  { id: 'switch', category: 'lighting', name: 'Włącznik / Przełącznik', emoji: '🔘', color: '#F59E0B', defaultLabel: 'Włącznik' },

  // 5. BMA & Brandschutz
  { id: 'detector_blue', category: 'bma', name: 'ZWD-Melder (Dwuprzetwornikowa OT)', emoji: '🚨', color: '#0284C7', defaultLabel: 'ZWD-Melder' },
  { id: 'detector_red', category: 'bma', name: 'D-Melder (Optyczna dymu)', emoji: '🚨', color: '#DC2626', defaultLabel: 'D-Melder' },
  { id: 'thermo_melder', category: 'bma', name: 'Thermo-Melder (Termiczna T)', emoji: '🔥', color: '#EA580C', defaultLabel: 'T-Melder' },
  { id: 'handmelder', category: 'bma', name: 'Handmelder (ROP / Przycisk)', emoji: '🛑', color: '#DC2626', defaultLabel: 'ROP' },
  { id: 'sirene', category: 'bma', name: 'Sirene / Sygnalizator', emoji: '📢', color: '#EA580C', defaultLabel: 'Sirene' },
  { id: 'koppler', category: 'bma', name: 'Linienkoppler / Moduł', emoji: '🔲', color: '#991B1B', defaultLabel: 'Koppler' },
  { id: 'bmz', category: 'bma', name: 'BMA-Zentrale (Centrala BMZ)', emoji: '🏢', color: '#7F1D1D', defaultLabel: 'BMZ' },

  // 6. Notlicht & Pikto
  { id: 'notlicht_lampe', category: 'notlicht', name: 'Notbeleuchtung (Awaryjna)', emoji: '🟢', color: '#16A34A', defaultLabel: 'Notlicht' },
  { id: 'notlicht_pikto_right', category: 'notlicht', name: 'Rettungszeichen ➡️', emoji: '➡️', color: '#16A34A', defaultLabel: 'Pikto ➡️' },
  { id: 'notlicht_pikto_left', category: 'notlicht', name: 'Rettungszeichen ⬅️', emoji: '⬅️', color: '#16A34A', defaultLabel: 'Pikto ⬅️' },
  { id: 'notlicht_pikto_down', category: 'notlicht', name: 'Rettungszeichen ⬇️', emoji: '⬇️', color: '#16A34A', defaultLabel: 'Pikto ⬇️' },
  { id: 'notlicht_pikto_up', category: 'notlicht', name: 'Rettungszeichen ⬆️', emoji: '⬆️', color: '#16A34A', defaultLabel: 'Pikto ⬆️' },

  // 7. Kable & Trasy kablowe
  { id: 'kabeltrasse', category: 'cables', name: 'Kabeltrasse (Trasa / Drabinka)', emoji: '🪜', color: '#059669', defaultLabel: 'Trasa' },
  { id: 'kabelzug', category: 'cables', name: 'Kabelzug (Linia kablowa)', emoji: '〰️', color: '#38BDF8', defaultLabel: 'Kabel' },

  // 8. Klapy rewizyjne & Inne
  { id: 'revisionsklappe', category: 'klappen', name: 'Revisionsklappe (Klapa rewizyjna)', emoji: '🔲', color: '#D97706', defaultLabel: 'Klapa' },
  { id: 'abdeckung', category: 'klappen', name: 'Abdeckung (Maska tła)', emoji: '⬜', color: '#64748B', defaultLabel: 'Abdeckung' },
  { id: 'anderungen', category: 'klappen', name: 'Änderungen / Rewizja', emoji: '☁️', color: '#DC2626', defaultLabel: 'Rewizja' },
];

export function getSymbolCategory(symbolType: string): SymbolCategory {
  const t = (symbolType || '').toLowerCase();
  if (
    t.includes('bma') ||
    t.includes('detector') ||
    t.includes('melder') ||
    t.includes('siren') ||
    t.includes('sirene') ||
    t.includes('koppler') ||
    t.includes('bmz') ||
    t.includes('smoke') ||
    t.includes('heat') ||
    t.includes('handmelder') ||
    t.includes('rop') ||
    t.includes('brand') ||
    t.includes('feu')
  ) {
    return 'bma';
  }
  if (
    t.includes('notlicht') ||
    t.includes('pikto') ||
    t.includes('rettung') ||
    t.includes('exit') ||
    t.includes('emergency')
  ) {
    return 'notlicht';
  }
  if (
    t.includes('warmepumpe') ||
    t.includes('wärmepumpe') ||
    t.includes('heating') ||
    t.includes('heiz') ||
    t.includes('speicher') ||
    t.includes('infrarot') ||
    t.includes('thermostat') ||
    t.includes('pumpe') ||
    t.includes('hkv')
  ) {
    return 'heating';
  }
  if (
    t.includes('socket') ||
    t.includes('steckdose') ||
    t.includes('cee') ||
    t.includes('edv') ||
    t.includes('circuit') ||
    t.includes('stromkreis') ||
    t.includes('kabelauslass')
  ) {
    return 'circuits';
  }
  if (
    t.includes('light') ||
    t.includes('leuchte') ||
    t.includes('lampe') ||
    t.includes('led') ||
    t.includes('switch') ||
    t.includes('schalter') ||
    t.includes('beleuchtung')
  ) {
    return 'lighting';
  }
  if (
    t.includes('kabel') ||
    t.includes('cable') ||
    t.includes('trasse') ||
    t.includes('kabelzug')
  ) {
    return 'cables';
  }
  if (
    t.includes('klappe') ||
    t.includes('abdeckung') ||
    t.includes('revis') ||
    t.includes('anderung') ||
    t.includes('revision')
  ) {
    return 'klappen';
  }

  const def = ALL_SYMBOLS.find((d) => d.id.toLowerCase() === t);
  if (def) return def.category;

  return 'klappen';
}

interface AufmassMarkerPin {
  id: string;
  session_id: string;
  session_type?: string;
  label?: string;
  color?: string;
  x_norm: number;
  y_norm: number;
  created_at?: string;
}

export default function InteractivePlanScreen() {
  const { id, mode, aufmassId } = useLocalSearchParams<{ id: string; mode?: string; aufmassId?: string }>();
  const router = useRouter();
  const webViewRef = useRef<WebView>(null);
  const { t } = useLanguage();
  const { isAdmin, isMod, session } = useAuth();

  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [isLocalTileCached, setIsLocalTileCached] = useState(false);
  const [planCacheBytes, setPlanCacheBytes] = useState(0);
  const [downloadingOffline, setDownloadingOffline] = useState(false);
  const [floors, setFloors] = useState<FloorOption[]>([]);
  const [currentFloorId, setCurrentFloorId] = useState<string | null>(null);

  // Entities
  const [tasks, setTasks] = useState<TaskPin[]>([]);
  const [circuits, setCircuits] = useState<CircuitPin[]>([]);
  const [cables, setCables] = useState<CablePin[]>([]);
  const [symbols, setSymbols] = useState<PlanSymbolPin[]>([]);
  const [aufmassMarkers, setAufmassMarkers] = useState<AufmassMarkerPin[]>([]);

  // Layers Visibility filtered by initial mode
  const initialLayers = useMemo<Record<SymbolCategory, boolean>>(() => {
    if (mode === 'circuits') {
      return { tasks: false, heating: false, circuits: true, lighting: false, bma: false, notlicht: false, cables: false, klappen: false };
    }
    if (mode === 'bma') {
      return { tasks: false, heating: false, circuits: false, lighting: false, bma: true, notlicht: false, cables: false, klappen: false };
    }
    if (mode === 'tasks' || mode === 'maengel') {
      return { tasks: true, heating: false, circuits: false, lighting: false, bma: false, notlicht: false, cables: false, klappen: false };
    }
    if (mode === 'cables') {
      return { tasks: false, heating: false, circuits: false, lighting: false, bma: false, notlicht: false, cables: true, klappen: false };
    }
    if (mode === 'aufmass') {
      return { tasks: false, heating: false, circuits: false, lighting: false, bma: false, notlicht: false, cables: false, klappen: false };
    }
    return {
      tasks: true,
      heating: true,
      circuits: true,
      lighting: true,
      bma: true,
      notlicht: true,
      cables: true,
      klappen: true,
    };
  }, [mode]);

  const [layers, setLayers] = useState<Record<SymbolCategory, boolean>>(initialLayers);

  useEffect(() => {
    setLayers(initialLayers);
  }, [initialLayers]);

  const [showLayersModal, setShowLayersModal] = useState(false);

  // Selected Entity for Bottom Inspection Drawer
  const [selectedTask, setSelectedTask] = useState<TaskPin | null>(null);
  const [selectedCircuit, setSelectedCircuit] = useState<CircuitPin | null>(null);
  const [selectedCable, setSelectedCable] = useState<CablePin | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<PlanSymbolPin | null>(null);

  // Add Object Modal (via Map Click)
  const [newPinNorm, setNewPinNorm] = useState<{ x_norm: number; y_norm: number } | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<SymbolCategory>('tasks');
  const [selectedSymbolType, setSelectedSymbolType] = useState<string>('task');
  const [objectTitle, setObjectTitle] = useState('');
  const [objectDesc, setObjectDesc] = useState('');
  const [objectPowerKw, setObjectPowerKw] = useState('');
  const [objectZuleitung, setObjectZuleitung] = useState('');
  const [objectKlappeSize, setObjectKlappeSize] = useState('40x40');
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
      let planRow: any = null;
      if (id) {
        planRow = await db.getFirstAsync(
          'SELECT id, project_id, floor_id, name, width, height, image_url, pdf_url FROM plans WHERE id = ? AND deleted_at IS NULL;',
          [id]
        );
      }

      if (!planRow && !id) {
        planRow = await db.getFirstAsync(
          'SELECT id, project_id, floor_id, name, width, height, image_url, pdf_url FROM plans WHERE deleted_at IS NULL LIMIT 1;'
        );
      }

      const activePlanId = id || planRow?.id || 'pln-sample-001';

      // 2. Fetch metadata (Check local meta.json first for instant offline rendering)
      let tileSize = 256;
      let maxZoom = 5;
      let gridW = 9;
      let gridH = 6;
      let fetchedWidth = planRow?.width || 1920;
      let fetchedHeight = planRow?.height || 1080;
      let activeProjectId = planRow?.project_id || '';

      const localMeta = await TileCacheService.getLocalMeta(activePlanId);
      if (localMeta) {
        if (localMeta.tileSize) tileSize = localMeta.tileSize;
        if (localMeta.maxZoom) maxZoom = localMeta.maxZoom;
        if (localMeta.gridW) gridW = localMeta.gridW;
        if (localMeta.gridH) gridH = localMeta.gridH;
        if (localMeta.imageWidth) fetchedWidth = localMeta.imageWidth;
        if (localMeta.imageHeight) fetchedHeight = localMeta.imageHeight;
      }

      try {
        const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
        const metaRes = await fetch(`${apiUrl}/api/tiles/${activePlanId}/meta${tokenParam}`);
        if (metaRes.ok) {
          const meta = await metaRes.json();
          if (meta.tileSize) tileSize = meta.tileSize;
          if (meta.maxZoom) maxZoom = meta.maxZoom;
          if (meta.gridW) gridW = meta.gridW;
          if (meta.gridH) gridH = meta.gridH;
          if (meta.imageWidth) fetchedWidth = meta.imageWidth;
          if (meta.imageHeight) fetchedHeight = meta.imageHeight;
        }
      } catch (e) {}

      const worldPxW = gridW * tileSize;
      const worldPxH = gridH * tileSize;

      const activePlan: PlanInfo = {
        id: activePlanId,
        name: planRow?.name || `Plan architektoniczny (${activePlanId.slice(0, 8)})`,
        project_id: activeProjectId || planRow?.project_id,
        floor_id: planRow?.floor_id,
        width: fetchedWidth,
        height: fetchedHeight,
        gridW,
        gridH,
        tileSize,
        maxZoom,
        worldPxW,
        worldPxH,
        image_url: planRow?.image_url,
        pdf_url: planRow?.pdf_url,
      };

      setPlan(activePlan);
      setCurrentFloorId(activePlan.floor_id || null);

      const isCached = await TileCacheService.isPlanCachedLocally(activePlanId);
      setIsLocalTileCached(isCached);
      const cacheBytes = await TileCacheService.getPlanCacheSize(activePlanId);
      setPlanCacheBytes(cacheBytes);

      // 3. Fetch Tasks on Plan
      let loadedTasks: TaskPin[] = [];
      const localTaskRows = (await db.getAllAsync(
        'SELECT id, title, description, x_norm, y_norm, pos_x, pos_y, status, priority, version FROM tasks WHERE plan_id = ? AND deleted_at IS NULL;',
        [activePlanId]
      )) as any[];

      if (localTaskRows && localTaskRows.length > 0) {
        loadedTasks = localTaskRows.map((t) => ({
          id: t.id,
          title: t.title || 'Zadanie',
          description: t.description || undefined,
          x_norm: t.x_norm ?? (t.pos_x ? t.pos_x / worldPxW : 0.1),
          y_norm: t.y_norm ?? (t.pos_y ? t.pos_y / worldPxH : 0.1),
          status: t.status || 'open',
          priority: t.priority || 'normal',
          version: t.version || 1,
        }));
      }

      if (token) {
        try {
          const taskUrl = `${apiUrl}/api/tasks?planId=${activePlanId}${activeProjectId ? `&projectId=${activeProjectId}` : ''}&limit=500`;
          const tRes = await fetch(taskUrl, { headers });
          if (tRes.ok) {
            const tJson = await tRes.json();
            const taskData = Array.isArray(tJson) ? tJson : (tJson?.data || []);
            if (Array.isArray(taskData) && taskData.length > 0) {
              loadedTasks = taskData.map((t: any) => {
                const normX = t.render_x ?? t.x_norm ?? 0.1;
                const normY = t.render_y ?? t.y_norm ?? 0.1;
                return {
                  id: t.id,
                  title: t.title || 'Zadanie',
                  description: t.description || undefined,
                  x_norm: normX,
                  y_norm: normY,
                  status: t.status || 'open',
                  priority: t.priority || 'normal',
                  version: t.version || 1,
                };
              });
            }
          }
        } catch {}
      }
      setTasks(loadedTasks);

      // 4. Fetch Stromkreise (Circuits)
      let loadedCircuits: CircuitPin[] = [];
      const localCircuitRows = (await db.getAllAsync(
        'SELECT id, circuit_name, circuit_code, short_label, full_name, type, fuse_type, x_norm, y_norm, pos_x, pos_y, status, metadata FROM stromkreise WHERE plan_id = ? AND deleted_at IS NULL;',
        [activePlanId]
      )) as any[];

      if (localCircuitRows && localCircuitRows.length > 0) {
        loadedCircuits = localCircuitRows.map((c) => {
          let metaObj: any = {};
          try {
            if (typeof c.metadata === 'string') metaObj = JSON.parse(c.metadata);
            else if (c.metadata && typeof c.metadata === 'object') metaObj = c.metadata;
          } catch {}

          const orient = metaObj.orientation || (metaObj.rotation === 270 ? 'vertical' : 'horizontal');
          const rot = metaObj.rotation != null ? metaObj.rotation : (orient === 'vertical' ? 270 : 0);
          const kabel = metaObj.kabeltyp || metaObj.cable_type || metaObj.cable || c.cable_type || c.kabeltyp || '';

          return {
            id: c.id,
            circuit_name: c.circuit_code || c.short_label || c.circuit_name || '1',
            circuit_code: c.circuit_code || c.short_label || c.circuit_name || '1',
            short_label: c.short_label || c.circuit_code,
            full_name: c.full_name || c.circuit_name,
            type: c.type || 'socket',
            fuse_type: c.fuse_type || 'B16',
            cable_type: kabel,
            status: c.status || 'open',
            orientation: orient,
            rotation: rot,
            metadata: metaObj,
            x_norm: c.x_norm ?? (c.pos_x ? c.pos_x / worldPxW : 0.2),
            y_norm: c.y_norm ?? (c.pos_y ? c.pos_y / worldPxH : 0.2),
          };
        });
      }

      if (token && activeProjectId) {
        try {
          const circUrl = `${apiUrl}/api/stromkreise?projectId=${activeProjectId}&planId=${activePlanId}`;
          const cRes = await fetch(circUrl, { headers });
          if (cRes.ok) {
            const cJson = await cRes.json();
            const circData = Array.isArray(cJson) ? cJson : (cJson?.data || []);
            if (Array.isArray(circData) && circData.length > 0) {
              loadedCircuits = circData.map((c: any) => {
                let metaObj: any = {};
                try {
                  if (typeof c.metadata === 'string') metaObj = JSON.parse(c.metadata);
                  else if (c.metadata && typeof c.metadata === 'object') metaObj = c.metadata;
                } catch {}

                const orient = metaObj.orientation || c.orientation || (metaObj.rotation === 270 ? 'vertical' : 'horizontal');
                const rot = metaObj.rotation != null ? metaObj.rotation : (orient === 'vertical' ? 270 : 0);
                const kabel = metaObj.kabeltyp || metaObj.cable_type || metaObj.cable || c.cable_type || c.kabeltyp || '';

                db.runAsync(
                  `INSERT INTO stromkreise (id, plan_id, circuit_name, circuit_code, short_label, full_name, type, fuse_type, x_norm, y_norm, status, metadata, version)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                   ON CONFLICT(id) DO UPDATE SET 
                    circuit_name = excluded.circuit_name,
                    circuit_code = excluded.circuit_code,
                    short_label = excluded.short_label,
                    full_name = excluded.full_name,
                    type = excluded.type,
                    x_norm = excluded.x_norm,
                    y_norm = excluded.y_norm,
                    status = excluded.status,
                    metadata = excluded.metadata;`,
                  [
                    c.id,
                    activePlanId,
                    c.circuit_code || c.short_label || '1',
                    c.circuit_code || c.short_label || '1',
                    c.short_label || c.circuit_code || '1',
                    c.full_name || null,
                    c.type || 'socket',
                    c.breaker_current ? `${c.breaker_curve || 'B'}${c.breaker_current}A` : (c.fuse_type || 'B16'),
                    c.x_norm ?? 0.2,
                    c.y_norm ?? 0.2,
                    c.status || 'open',
                    JSON.stringify(metaObj),
                  ]
                ).catch(() => {});

                return {
                  id: c.id,
                  circuit_name: c.circuit_code || c.short_label || c.full_name || '1',
                  circuit_code: c.circuit_code || c.short_label || '1',
                  short_label: c.short_label || c.circuit_code,
                  full_name: c.full_name || c.circuit_name,
                  type: c.type || 'socket',
                  fuse_type: c.breaker_current ? `${c.breaker_curve || 'B'}${c.breaker_current}A` : (c.fuse_type || 'B16'),
                  cable_type: kabel,
                  status: c.status || 'open',
                  orientation: orient,
                  rotation: rot,
                  metadata: metaObj,
                  description: c.description || c.notes,
                  x_norm: c.x_norm ?? 0.2,
                  y_norm: c.y_norm ?? 0.2,
                };
              });
            }
          }
        } catch {}
      }
      setCircuits(loadedCircuits);

      // 5. Fetch Cables
      let loadedCables: CablePin[] = [];
      const cableRows = (await db.getAllAsync(
        'SELECT id, cable_number, cable_type, length, status, points_json FROM cables WHERE plan_id = ? AND deleted_at IS NULL;',
        [activePlanId]
      )) as any[];
      loadedCables = cableRows || [];

      if (token) {
        try {
          const cabRes = await fetch(`${apiUrl}/api/cables?planId=${activePlanId}`, { headers });
          if (cabRes.ok) {
            const cabJson = await cabRes.json();
            const cabList = Array.isArray(cabJson) ? cabJson : (cabJson?.data || []);
            if (Array.isArray(cabList) && cabList.length > 0) {
              loadedCables = cabList.map((c: any) => ({
                id: c.id,
                cable_number: c.cable_number || c.label || 'Kabel',
                cable_type: c.cable_type || 'NYM-J 3x1.5',
                length: c.length || 0,
                status: c.status || 'planned',
                points_json: typeof c.points_json === 'string' ? c.points_json : JSON.stringify(c.points || c.path || []),
              }));
            }
          }
        } catch {}
      }
      setCables(loadedCables);

      // 6. Fetch Plan Symbols (BMA, Wärmepumpen, Notlicht, Klappen, etc.)
      let loadedSymbols: PlanSymbolPin[] = [];
      const localSymbolRows = (await db.getAllAsync(
        'SELECT id, symbol_type, x_norm, y_norm, label, loop_number, address, description FROM plan_bma_symbols WHERE plan_id = ? AND deleted_at IS NULL;',
        [activePlanId]
      )) as any[];

      if (localSymbolRows && localSymbolRows.length > 0) {
        loadedSymbols = localSymbolRows.map((s) => {
          let parsed: any = {};
          try {
            if (s.description && s.description.startsWith('{')) parsed = JSON.parse(s.description);
          } catch {}
          return {
            id: s.id,
            symbol_type: s.symbol_type,
            x_norm: s.x_norm,
            y_norm: s.y_norm,
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
                let parsed: any = {};
                try {
                  if (s.description && s.description.startsWith('{')) parsed = JSON.parse(s.description);
                } catch {}

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
                  label: s.label,
                  loop_number: s.loop_number,
                  address: s.address,
                  description: s.description,
                  parsed_desc: parsed,
                };
              });
            }
          }
        } catch {}
      }
      setSymbols(loadedSymbols);

      // 7. Fetch Floors
      if (activeProjectId) {
        const floorRows = await db.getAllAsync<FloorOption>(
          'SELECT f.id, f.name, (SELECT p.id FROM plans p WHERE p.floor_id = f.id AND p.deleted_at IS NULL LIMIT 1) as plan_id FROM floors f WHERE f.deleted_at IS NULL ORDER BY f.level_number ASC;'
        );
        setFloors(floorRows || []);
      }

      // 8. Fetch Aufmass markers if in aufmass mode
      let loadedAufmass: AufmassMarkerPin[] = [];
      if (token && (mode === 'aufmass' || aufmassId)) {
        try {
          const aUrl = aufmassId ? `${apiUrl}/api/aufmass/markers?sessionId=${aufmassId}` : `${apiUrl}/api/aufmass/markers?planId=${activePlanId}`;
          const aRes = await fetch(aUrl, { headers });
          if (aRes.ok) {
            const aJson = await aRes.json();
            const aList = Array.isArray(aJson) ? aJson : (aJson?.data || []);
            loadedAufmass = aList.filter((m: any) => m.x_norm != null && m.y_norm != null).map((m: any) => ({
              id: m.id,
              session_id: m.session_id,
              session_type: m.session_type || 'aufmass',
              label: m.label,
              color: m.color,
              x_norm: m.x_norm,
              y_norm: m.y_norm,
              created_at: m.created_at,
            }));
          }
        } catch {}
      }
      setAufmassMarkers(loadedAufmass);
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
        setNewPinNorm({ x_norm: Number(data.x_norm.toFixed(4)), y_norm: Number(data.y_norm.toFixed(4)) });
        const def = ALL_SYMBOLS.find((s) => s.id === selectedSymbolType) || ALL_SYMBOLS[0];
        setObjectTitle(def.defaultLabel || '');
        setObjectDesc('');
        setAttachedPhotoUrl(null);
      }
    } catch (e) {
      console.warn('[InteractivePlan] Parse message error:', e);
    }
  };

  // Execution actions for Circuit Pin
  const updateCircuitStatus = async (circuitId: string, newStatus: string) => {
    try {
      const db = await getDatabase();
      await db.runAsync('UPDATE stromkreise SET status = ? WHERE id = ?;', [newStatus, circuitId]);

      setCircuits((prev) =>
        prev.map((c) => (c.id === circuitId ? { ...c, status: newStatus } : c))
      );
      if (selectedCircuit?.id === circuitId) {
        setSelectedCircuit((prev) => (prev ? { ...prev, status: newStatus } : null));
      }

      // Sync to API
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://inspecthero.pl';
      const token = session?.access_token;
      if (token) {
        fetch(`${apiUrl}/api/stromkreise/execute`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ markerId: circuitId, status: newStatus }),
        }).catch(() => {});
      }

      Alert.alert('Status zaktualizowany', `Nowy status obwodu: ${newStatus}`);
    } catch (e: any) {
      Alert.alert('Błąd', e?.message || 'Nie udało się zaktualizować statusu');
    }
  };

  const toggleCircuitOrientation = async (circuitId: string) => {
    try {
      const current = circuits.find((c) => c.id === circuitId);
      if (!current) return;
      const isCurrentlyVertical = current.orientation === 'vertical' || current.rotation === 270;
      const newOrientation: 'horizontal' | 'vertical' = isCurrentlyVertical ? 'horizontal' : 'vertical';
      const newRotation = isCurrentlyVertical ? 0 : 270;

      const db = await getDatabase();
      const currentMeta = current.metadata || {};
      const updatedMeta = { ...currentMeta, orientation: newOrientation, rotation: newRotation };

      await db.runAsync(
        'UPDATE stromkreise SET metadata = ? WHERE id = ?;',
        [JSON.stringify(updatedMeta), circuitId]
      );

      const updatedList = circuits.map((c) =>
        c.id === circuitId
          ? { ...c, orientation: newOrientation, rotation: newRotation, metadata: updatedMeta }
          : c
      );
      setCircuits(updatedList);

      if (selectedCircuit?.id === circuitId) {
        setSelectedCircuit((prev) =>
          prev ? { ...prev, orientation: newOrientation, rotation: newRotation, metadata: updatedMeta } : null
        );
      }

      // Reload Leaflet webview to reflect new rotation angle
      webViewRef.current?.injectJavaScript(`
        if (window.map) {
          window.location.reload();
        }
        true;
      `);

      // Sync to API
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://inspecthero.pl';
      const token = session?.access_token;
      if (token) {
        fetch(`${apiUrl}/api/stromkreise`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ id: circuitId, metadata: updatedMeta }),
        }).catch(() => {});
      }
    } catch (err: any) {
      Alert.alert('Błąd', err?.message || 'Nie udało się zmienić orientacji');
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
        result = await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: false });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8, allowsEditing: false });
      }

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const localUri = result.assets[0].uri;
        setUploadingPhoto(true);

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
          setAttachedPhotoUrl(uJson.url || uJson.file_url || localUri);
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
    if (!newPinNorm || !plan) return;
    try {
      const db = await getDatabase();
      const now = new Date().toISOString();
      const def = ALL_SYMBOLS.find((s) => s.id === selectedSymbolType) || ALL_SYMBOLS[0];
      const title = objectTitle.trim() || def.name;

      if (selectedSymbolType === 'task') {
        const newTaskId = `tsk-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const newTask: TaskPin = {
          id: newTaskId,
          title: title,
          description: objectDesc.trim() || undefined,
          x_norm: newPinNorm.x_norm,
          y_norm: newPinNorm.y_norm,
          status: 'open',
          priority: 'normal',
          version: 1,
        };

        await db.runAsync(`
          INSERT INTO tasks (
            id, plan_id, title, description, status, priority, x_norm, y_norm, pos_x, pos_y, version, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?);
        `, [
          newTask.id,
          plan.id,
          newTask.title,
          newTask.description || null,
          newTask.status,
          newTask.priority || 'normal',
          newTask.x_norm,
          newTask.y_norm,
          Math.round(newTask.x_norm * plan.worldPxW),
          Math.round(newTask.y_norm * plan.worldPxH),
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
      } else if (def.category === 'circuits') {
        const newCircId = `circ-${Date.now()}`;
        const newCirc: CircuitPin = {
          id: newCircId,
          circuit_name: title,
          circuit_code: title,
          full_name: objectDesc.trim() || undefined,
          type: selectedSymbolType,
          fuse_type: 'B16',
          status: 'open',
          x_norm: newPinNorm.x_norm,
          y_norm: newPinNorm.y_norm,
        };

        await db.runAsync(`
          INSERT INTO stromkreise (id, plan_id, circuit_name, circuit_code, short_label, full_name, type, fuse_type, x_norm, y_norm, status, version)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', 1);
        `, [newCirc.id, plan.id, newCirc.circuit_name, newCirc.circuit_code, newCirc.circuit_code, newCirc.full_name || null, newCirc.type, newCirc.fuse_type || 'B16', newCirc.x_norm, newCirc.y_norm]);

        setCircuits((prev) => [...prev, newCirc]);
        webViewRef.current?.injectJavaScript(`
          if (window.addCircuitMarker) {
            window.addCircuitMarker(${JSON.stringify(newCirc)});
          }
          true;
        `);
      } else {
        const newSymId = `sym-${Date.now()}`;
        const descData: any = {};
        if (objectDesc.trim()) descData.notes = objectDesc.trim();
        if (objectPowerKw.trim()) descData.powerKw = objectPowerKw.trim();
        if (objectZuleitung.trim()) descData.zuleitung = objectZuleitung.trim();
        if (selectedSymbolType === 'revisionsklappe') descData.size = objectKlappeSize;
        if (attachedPhotoUrl) descData.photos = [attachedPhotoUrl];

        const newSym: PlanSymbolPin = {
          id: newSymId,
          symbol_type: selectedSymbolType,
          x_norm: newPinNorm.x_norm,
          y_norm: newPinNorm.y_norm,
          label: title,
          description: JSON.stringify(descData),
          parsed_desc: descData,
        };

        await db.runAsync(`
          INSERT INTO plan_bma_symbols (id, plan_id, symbol_type, x_norm, y_norm, label, description, version)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1);
        `, [newSym.id, plan.id, newSym.symbol_type, newSym.x_norm, newSym.y_norm, newSym.label || null, newSym.description || null]);

        setSymbols((prev) => [...prev, newSym]);
        webViewRef.current?.injectJavaScript(`
          if (window.addPlanSymbolMarker) {
            window.addPlanSymbolMarker(${JSON.stringify(newSym)});
          }
          true;
        `);
      }

      setNewPinNorm(null);
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
      circuits: circuits.length + symbols.filter((s) => ['socket', 'socket_2x', 'cee', 'edv', 'kabelauslass'].includes(s.symbol_type)).length,
      lighting: symbols.filter((s) => ['light', 'wandleuchte', 'led_stripe', 'switch'].includes(s.symbol_type)).length,
      bma: symbols.filter((s) => ['detector_blue', 'detector_red', 'thermo_melder', 'handmelder', 'sirene', 'koppler', 'bmz'].includes(s.symbol_type)).length,
      notlicht: symbols.filter((s) => s.symbol_type.startsWith('notlicht')).length,
      cables: cables.length + symbols.filter((s) => ['kabeltrasse', 'kabelzug'].includes(s.symbol_type)).length,
      klappen: symbols.filter((s) => ['revisionsklappe', 'abdeckung', 'anderungen'].includes(s.symbol_type)).length,
    };
    return counts;
  }, [tasks, circuits, cables, symbols]);

  const generateLeafletHtml = () => {
    const worldPxW = plan?.worldPxW || 2304;
    const worldPxH = plan?.worldPxH || 1536;
    const maxZoom = plan?.maxZoom || 5;
    const minZoom = 1;
    const tileSize = plan?.tileSize || 256;
    const planId = plan?.id || id || '';
    const token = session?.access_token || '';
    const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://inspecthero.pl';

    let visibleTasks: TaskPin[] = [];
    let visibleCircuits: CircuitPin[] = [];
    let visibleCables: CablePin[] = [];
    let visibleSymbols: PlanSymbolPin[] = [];
    let visibleAufmass: AufmassMarkerPin[] = [];

    if (mode === 'circuits') {
      visibleCircuits = circuits;
    } else if (mode === 'bma') {
      visibleSymbols = symbols.filter((s) => getSymbolCategory(s.symbol_type) === 'bma');
    } else if (mode === 'tasks' || mode === 'maengel') {
      visibleTasks = tasks;
    } else if (mode === 'cables') {
      visibleCables = cables;
      visibleSymbols = symbols.filter((s) => getSymbolCategory(s.symbol_type) === 'cables');
    } else if (mode === 'aufmass') {
      visibleAufmass = aufmassId
        ? aufmassMarkers.filter((m) => m.session_id === aufmassId)
        : aufmassMarkers;
    } else {
      visibleTasks = layers.tasks ? tasks : [];
      visibleCircuits = layers.circuits ? circuits : [];
      visibleCables = layers.cables ? cables : [];
      visibleSymbols = symbols.filter((s) => {
        const cat = getSymbolCategory(s.symbol_type);
        return layers[cat] ?? true;
      });
      visibleAufmass = aufmassMarkers;
    }

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
            width: 32px;
            height: 32px;
            border-radius: 50% !important;
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #ffffff;
            font-weight: 800;
            font-size: 12px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.6);
            border: 2px solid #ffffff;
            cursor: pointer;
            transition: transform 0.15s ease;
          }
          .pin-OPEN, .pin-open { background-color: #0284C7; border-color: #38BDF8; }
          .pin-IN_PROGRESS, .pin-in_progress { background-color: #D97706; border-color: #FBBF24; }
          .pin-DONE_WAITING_APPROVAL, .pin-done_waiting_approval {
            background-color: #7C3AED;
            border-color: #C084FC;
            box-shadow: 0 0 0 4px rgba(168, 85, 247, 0.45), 0 2px 12px rgba(124, 58, 237, 0.8);
          }
          .pin-APPROVED, .pin-approved, .pin-closed { background-color: #059669; border-color: #34D399; }
          .pin-REJECTED, .pin-rejected { background-color: #DC2626; border-color: #F87171; }
          
          /* Web 1:1 Rectangular Stromkreis Badge */
          .stromkreis-badge-container {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            background-color: #FFFFFF;
            color: #0F172A;
            border-radius: 4px;
            padding: 1px 6px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.5);
            font-weight: 900;
            font-size: 11px;
            white-space: nowrap;
            cursor: pointer;
            transition: transform 0.15s ease;
            box-sizing: border-box;
          }
          .stromkreis-badge-container:hover, .stromkreis-badge-container:active {
            transform: scale(1.2);
          }
          .sk-approved {
            background-color: #16A34A !important;
            color: #FFFFFF !important;
            border: 1.5px solid #15803D !important;
          }
          .sk-pending {
            background-color: #FEF08A !important;
            color: #854D0E !important;
            border: 1.5px solid #EAB308 !important;
          }
          .sk-socket { border: 2px solid #EF4444; color: #DC2626; }
          .sk-light { border: 2px solid #F59E0B; color: #D97706; }
          .sk-edv { border: 2px solid #EF4444; color: #DC2626; }
          .sk-cee { border: 2px solid #A855F7; color: #7E22CE; }
          .sk-special { border: 2px solid #8B5CF6; color: #6D28D9; }

          .svg-marker-container {
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            height: 100%;
            cursor: pointer;
            transition: transform 0.15s ease;
          }
          .svg-marker-container:hover, .svg-marker-container:active {
            transform: scale(1.2);
          }
          .svg-marker-box {
            width: 100%;
            height: 100%;
            background: rgba(15, 23, 42, 0.85);
            border-radius: 6px;
            padding: 3px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
            border: 1.5px solid rgba(255, 255, 255, 0.2);
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .pin-label {
            position: absolute;
            bottom: -20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(15, 23, 42, 0.95);
            color: #F8FAFC;
            font-size: 9px;
            font-weight: 800;
            padding: 2px 6px;
            border-radius: 4px;
            white-space: nowrap;
            border: 1px solid #334155;
            pointer-events: none;
            box-shadow: 0 1px 4px rgba(0,0,0,0.6);
            z-index: 10;
          }
          .cable-badge {
            background: rgba(15, 23, 42, 0.95);
            color: #F8FAFC;
            font-size: 9px;
            font-weight: 800;
            padding: 2px 6px;
            border-radius: 4px;
            white-space: nowrap;
            border: 1.5px solid #38BDF8;
            box-shadow: 0 2px 6px rgba(0,0,0,0.6);
            display: inline-block;
          }
          .plan-tooltip {
            background-color: #0F172A !important;
            border: 1px solid #38BDF8 !important;
            color: #F8FAFC !important;
            font-size: 11px !important;
            font-weight: 600 !important;
            border-radius: 6px !important;
            padding: 4px 8px !important;
            box-shadow: 0 4px 12px rgba(0,0,0,0.7) !important;
          }
          .leaflet-container {
            background-color: #030712 !important;
          }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          const worldPxW = ${worldPxW};
          const worldPxH = ${worldPxH};
          const maxZoom = ${maxZoom};
          const minZoom = ${minZoom};
          const tileSize = ${tileSize};
          const planId = "${planId}";
          const token = "${token}";
          const apiUrl = "${apiUrl}";

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

          function normToLatLng(x_norm, y_norm) {
            const lat = -(y_norm * worldPxH) / Math.pow(2, maxZoom);
            const lng = (x_norm * worldPxW) / Math.pow(2, maxZoom);
            return [lat, lng];
          }

          function latLngToNorm(lat, lng) {
            const x_norm = (lng * Math.pow(2, maxZoom)) / worldPxW;
            const y_norm = (-lat * Math.pow(2, maxZoom)) / worldPxH;
            return { x_norm: x_norm, y_norm: y_norm };
          }

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

          // DIN / CAD Vector SVG Symbol Generator
          function getVectorSvgHtml(type, color, rotation) {
            const rot = rotation || 0;
            const rotStyle = rot ? 'transform: rotate(' + rot + 'deg); transform-origin: center;' : '';
            const c = color || '#38BDF8';
            const tLow = (type || '').toLowerCase();

            if (type === 'detector_blue' || type === 'bma_smoke' || tLow.includes('smoke') || tLow.includes('ot') || tLow.includes('zwd') || tLow.includes('optical')) {
              return '<svg viewBox="0 0 100 100" style="width:100%;height:100%;' + rotStyle + '"><circle cx="50" cy="50" r="42" fill="rgba(56,189,248,0.2)" stroke="#0284C7" stroke-width="8"/><circle cx="50" cy="50" r="22" fill="none" stroke="#0284C7" stroke-width="6"/><circle cx="50" cy="50" r="8" fill="#0284C7"/></svg>';
            }
            if (type === 'detector_red' || type === 'bma_dual' || (tLow.includes('detector') && !tLow.includes('heat') && !tLow.includes('thermo')) || tLow === 'bma' || tLow.includes('melder')) {
              return '<svg viewBox="0 0 100 100" style="width:100%;height:100%;' + rotStyle + '"><circle cx="50" cy="50" r="42" fill="rgba(239,68,68,0.2)" stroke="#DC2626" stroke-width="8"/><circle cx="50" cy="50" r="28" fill="none" stroke="#DC2626" stroke-width="6"/><circle cx="50" cy="50" r="14" fill="none" stroke="#DC2626" stroke-width="4"/><circle cx="50" cy="50" r="6" fill="#DC2626"/></svg>';
            }
            if (type === 'thermo_melder' || type === 'bma_heat' || tLow.includes('heat') || tLow.includes('thermo') || tLow.includes('temp')) {
              return '<svg viewBox="0 0 100 100" style="width:100%;height:100%;' + rotStyle + '"><circle cx="50" cy="50" r="42" fill="rgba(249,115,22,0.2)" stroke="#EA580C" stroke-width="8"/><path d="M 50 24 L 50 62 M 42 66 A 10 10 0 1 0 58 66 A 10 10 0 0 0 42 66" fill="#EA580C" stroke="#EA580C" stroke-width="4"/></svg>';
            }
            if (type === 'handmelder' || type === 'bma_rop' || tLow.includes('hand') || tLow.includes('rop') || tLow.includes('call_point')) {
              return '<svg viewBox="0 0 100 100" style="width:100%;height:100%;' + rotStyle + '"><rect x="15" y="15" width="70" height="70" rx="8" fill="rgba(220,38,38,0.2)" stroke="#DC2626" stroke-width="8"/><circle cx="50" cy="50" r="16" fill="#DC2626"/><text x="50" y="80" fill="#DC2626" font-size="14" font-weight="900" text-anchor="middle">BMA</text></svg>';
            }
            if (type === 'sirene' || type === 'sirene_up' || type === 'bma_siren' || tLow.includes('siren')) {
              return '<svg viewBox="0 0 100 100" style="width:100%;height:100%;' + rotStyle + '"><polygon points="30,35 60,15 60,85 30,65" fill="#F97316" stroke="#C2410C" stroke-width="6"/><rect x="18" y="38" width="14" height="24" fill="#C2410C"/><path d="M 70 30 A 25 25 0 0 1 70 70" fill="none" stroke="#EA580C" stroke-width="6" stroke-linecap="round"/></svg>';
            }
            if (type === 'sirene_right') {
              return '<svg viewBox="0 0 100 100" style="width:100%;height:100%;transform: rotate(90deg);"><polygon points="30,35 60,15 60,85 30,65" fill="#F97316" stroke="#C2410C" stroke-width="6"/><rect x="18" y="38" width="14" height="24" fill="#C2410C"/><path d="M 70 30 A 25 25 0 0 1 70 70" fill="none" stroke="#EA580C" stroke-width="6" stroke-linecap="round"/></svg>';
            }
            if (type === 'sirene_down') {
              return '<svg viewBox="0 0 100 100" style="width:100%;height:100%;transform: rotate(180deg);"><polygon points="30,35 60,15 60,85 30,65" fill="#F97316" stroke="#C2410C" stroke-width="6"/><rect x="18" y="38" width="14" height="24" fill="#C2410C"/><path d="M 70 30 A 25 25 0 0 1 70 70" fill="none" stroke="#EA580C" stroke-width="6" stroke-linecap="round"/></svg>';
            }
            if (type === 'sirene_left') {
              return '<svg viewBox="0 0 100 100" style="width:100%;height:100%;transform: rotate(270deg);"><polygon points="30,35 60,15 60,85 30,65" fill="#F97316" stroke="#C2410C" stroke-width="6"/><rect x="18" y="38" width="14" height="24" fill="#C2410C"/><path d="M 70 30 A 25 25 0 0 1 70 70" fill="none" stroke="#EA580C" stroke-width="6" stroke-linecap="round"/></svg>';
            }
            if (type === 'koppler' || tLow.includes('koppl') || tLow.includes('module')) {
              return '<svg viewBox="0 0 100 100" style="width:100%;height:100%;' + rotStyle + '"><rect x="20" y="20" width="60" height="60" rx="6" fill="#991B1B" stroke="#7F1D1D" stroke-width="8"/><circle cx="50" cy="50" r="14" fill="#FFFFFF"/></svg>';
            }
            if (type === 'bmz' || tLow.includes('bmz') || tLow.includes('zentrale')) {
              return '<svg viewBox="0 0 100 100" style="width:100%;height:100%;' + rotStyle + '"><rect x="12" y="12" width="76" height="76" rx="8" fill="#B91C1C" stroke="#7F1D1D" stroke-width="8"/><text x="50" y="60" fill="#FFFFFF" font-size="24" font-weight="900" font-family="sans-serif" text-anchor="middle">BMZ</text></svg>';
            }
            if (type === 'warmepumpe_aussen') {
              return '<svg viewBox="0 0 100 100" style="width:100%;height:100%;' + rotStyle + '"><rect x="15" y="15" width="70" height="70" rx="10" fill="rgba(2,132,199,0.15)" stroke="#0284C7" stroke-width="7"/><circle cx="50" cy="50" r="26" fill="none" stroke="#0284C7" stroke-width="5"/><path d="M 50 24 L 50 76 M 24 50 L 76 50 M 32 32 L 68 68 M 32 68 L 68 32" stroke="#0284C7" stroke-width="4"/></svg>';
            }
            if (type === 'warmepumpe_innen') {
              return '<svg viewBox="0 0 100 100" style="width:100%;height:100%;' + rotStyle + '"><rect x="20" y="12" width="60" height="76" rx="8" fill="rgba(14,165,233,0.15)" stroke="#0284C7" stroke-width="7"/><line x1="30" y1="35" x2="70" y2="35" stroke="#0284C7" stroke-width="5"/><circle cx="50" cy="60" r="14" fill="none" stroke="#0284C7" stroke-width="4"/></svg>';
            }
            if (type === 'infrarotheizung') {
              return '<svg viewBox="0 0 100 100" style="width:100%;height:100%;' + rotStyle + '"><rect x="15" y="25" width="70" height="50" rx="8" fill="rgba(249,115,22,0.18)" stroke="#F97316" stroke-width="7"/><path d="M 30 40 Q 40 30 50 40 T 70 40 M 30 55 Q 40 45 50 55 T 70 55" fill="none" stroke="#F97316" stroke-width="5"/></svg>';
            }
            if (type === 'geraet_box') {
              return '<svg viewBox="0 0 100 100" style="width:100%;height:100%;' + rotStyle + '"><rect x="15" y="15" width="70" height="70" rx="8" fill="rgba(99,102,241,0.2)" stroke="#6366F1" stroke-width="7"/><circle cx="35" cy="40" r="8" fill="#6366F1"/><circle cx="65" cy="40" r="8" fill="#6366F1"/><rect x="30" y="62" width="40" height="10" rx="3" fill="#6366F1"/></svg>';
            }
            if (type === 'temperaturfuehler') {
              return '<svg viewBox="0 0 100 100" style="width:100%;height:100%;' + rotStyle + '"><circle cx="50" cy="50" r="38" fill="rgba(16,185,129,0.18)" stroke="#10B981" stroke-width="7"/><path d="M 50 25 L 50 58 M 44 64 A 8 8 0 1 0 56 64 A 8 8 0 0 0 44 64" fill="#10B981" stroke="#10B981" stroke-width="4"/></svg>';
            }
            if (type === 'heizkreisverteiler') {
              return '<svg viewBox="0 0 100 100" style="width:100%;height:100%;' + rotStyle + '"><rect x="15" y="25" width="70" height="50" rx="6" fill="rgba(2,132,199,0.18)" stroke="#0284C7" stroke-width="7"/><circle cx="32" cy="50" r="6" fill="#0284C7"/><circle cx="50" cy="50" r="6" fill="#0284C7"/><circle cx="68" cy="50" r="6" fill="#0284C7"/></svg>';
            }
            if (type === 'pufferspeicher') {
              return '<svg viewBox="0 0 100 100" style="width:100%;height:100%;' + rotStyle + '"><rect x="25" y="20" width="50" height="60" rx="14" fill="rgba(100,116,139,0.25)" stroke="#64748B" stroke-width="7"/><line x1="25" y1="40" x2="75" y2="40" stroke="#64748B" stroke-width="5"/><line x1="25" y1="60" x2="75" y2="60" stroke="#64748B" stroke-width="5"/></svg>';
            }
            if (type === 'light') {
              return '<svg viewBox="0 0 100 100" style="width:100%;height:100%;' + rotStyle + '"><circle cx="50" cy="50" r="34" fill="rgba(234,179,8,0.18)" stroke="#EAB308" stroke-width="8"/><line x1="26" y1="26" x2="74" y2="74" stroke="#EAB308" stroke-width="8" stroke-linecap="round"/><line x1="74" y1="26" x2="26" y2="74" stroke="#EAB308" stroke-width="8" stroke-linecap="round"/></svg>';
            }
            if (type === 'wandleuchte') {
              return '<svg viewBox="0 0 100 100" style="width:100%;height:100%;' + rotStyle + '"><line x1="15" y1="50" x2="85" y2="50" stroke="#CA8A04" stroke-width="8" stroke-linecap="round"/><circle cx="50" cy="30" r="22" fill="rgba(234,179,8,0.25)" stroke="#CA8A04" stroke-width="7"/><line x1="36" y1="16" x2="64" y2="44" stroke="#CA8A04" stroke-width="6"/><line x1="64" y1="16" x2="36" y2="44" stroke="#CA8A04" stroke-width="6"/></svg>';
            }
            if (type === 'led_stripe') {
              return '<svg viewBox="0 0 100 100" style="width:100%;height:100%;' + rotStyle + '"><rect x="15" y="40" width="70" height="20" rx="4" fill="rgba(250,204,21,0.25)" stroke="#FACC15" stroke-width="6"/><circle cx="28" cy="50" r="4" fill="#FACC15"/><circle cx="50" cy="50" r="4" fill="#FACC15"/><circle cx="72" cy="50" r="4" fill="#FACC15"/></svg>';
            }
            if (type === 'switch') {
              return '<svg viewBox="0 0 100 100" style="width:100%;height:100%;' + rotStyle + '"><circle cx="50" cy="50" r="32" fill="none" stroke="#F59E0B" stroke-width="8"/><line x1="50" y1="50" x2="78" y2="22" stroke="#F59E0B" stroke-width="8" stroke-linecap="round"/><circle cx="78" cy="22" r="5" fill="#F59E0B"/></svg>';
            }
            if (type === 'notlicht_lampe') {
              return '<svg viewBox="0 0 100 100" style="width:100%;height:100%;' + rotStyle + '"><circle cx="50" cy="50" r="36" fill="rgba(22,163,74,0.2)" stroke="#16A34A" stroke-width="8"/><circle cx="50" cy="50" r="14" fill="#16A34A"/></svg>';
            }
            if (type === 'notlicht_pikto_right') {
              return '<svg viewBox="0 0 100 100" style="width:100%;height:100%;' + rotStyle + '"><rect x="10" y="20" width="80" height="60" rx="6" fill="#16A34A" stroke="#15803D" stroke-width="6"/><path d="M 30 50 L 55 30 L 55 42 L 75 42 L 75 58 L 55 58 L 55 70 Z" fill="#FFFFFF"/></svg>';
            }
            if (type === 'notlicht_pikto_left') {
              return '<svg viewBox="0 0 100 100" style="width:100%;height:100%;' + rotStyle + '"><rect x="10" y="20" width="80" height="60" rx="6" fill="#16A34A" stroke="#15803D" stroke-width="6"/><path d="M 70 50 L 45 30 L 45 42 L 25 42 L 25 58 L 45 58 L 45 70 Z" fill="#FFFFFF"/></svg>';
            }
            if (type === 'notlicht_pikto_down') {
              return '<svg viewBox="0 0 100 100" style="width:100%;height:100%;' + rotStyle + '"><rect x="10" y="20" width="80" height="60" rx="6" fill="#16A34A" stroke="#15803D" stroke-width="6"/><path d="M 50 70 L 30 45 L 42 45 L 42 25 L 58 25 L 58 45 L 70 45 Z" fill="#FFFFFF"/></svg>';
            }
            if (type === 'notlicht_pikto_up') {
              return '<svg viewBox="0 0 100 100" style="width:100%;height:100%;' + rotStyle + '"><rect x="10" y="20" width="80" height="60" rx="6" fill="#16A34A" stroke="#15803D" stroke-width="6"/><path d="M 50 25 L 30 50 L 42 50 L 42 70 L 58 70 L 58 50 L 70 50 Z" fill="#FFFFFF"/></svg>';
            }
            if (type === 'revisionsklappe') {
              return '<svg viewBox="0 0 100 100" style="width:100%;height:100%;' + rotStyle + '"><rect x="15" y="15" width="70" height="70" fill="rgba(245,158,11,0.15)" stroke="#D97706" stroke-width="7"/><line x1="15" y1="15" x2="85" y2="85" stroke="#D97706" stroke-width="6"/><line x1="15" y1="85" x2="85" y2="15" stroke="#D97706" stroke-width="6"/></svg>';
            }
            if (type === 'abdeckung') {
              return '<svg viewBox="0 0 100 100" style="width:100%;height:100%;' + rotStyle + '"><rect x="15" y="15" width="70" height="70" fill="rgba(100,116,139,0.3)" stroke="#64748B" stroke-width="6" stroke-dasharray="8,8"/></svg>';
            }
            if (type === 'anderungen') {
              return '<svg viewBox="0 0 100 100" style="width:100%;height:100%;' + rotStyle + '"><path d="M 20 50 A 15 15 0 0 1 40 30 A 20 20 0 0 1 70 30 A 15 15 0 0 1 85 50 A 15 15 0 0 1 70 70 A 20 20 0 0 1 35 70 A 15 15 0 0 1 20 50 Z" fill="rgba(220,38,38,0.2)" stroke="#DC2626" stroke-width="6"/></svg>';
            }

            return '<svg viewBox="0 0 100 100" style="width:100%;height:100%;' + rotStyle + '"><circle cx="50" cy="50" r="38" fill="none" stroke="' + c + '" stroke-width="8"/><circle cx="50" cy="50" r="12" fill="' + c + '"/></svg>';
          }

          function makeStrictOrthoPolyline(pts) {
            if (!pts || pts.length < 2) return pts;
            const res = [pts[0]];
            for (let i = 0; i < pts.length - 1; i++) {
              const pA = res[res.length - 1];
              const pB = pts[i + 1];
              const dx = pB.x_norm - pA.x_norm;
              const dy = pB.y_norm - pA.y_norm;
              if (Math.abs(dx) < 0.0001 || Math.abs(dy) < 0.0001) {
                res.push(pB);
                continue;
              }
              const corner = Math.abs(dx) >= Math.abs(dy)
                ? { x_norm: pB.x_norm, y_norm: pA.y_norm }
                : { x_norm: pA.x_norm, y_norm: pB.y_norm };
              res.push(corner, pB);
            }
            return res;
          }

          const symbolMeta = ${JSON.stringify(ALL_SYMBOLS)};

          window.addTaskMarker = function(t) {
            if (!t) return;
            const ll = normToLatLng(t.x_norm || 0.1, t.y_norm || 0.1);
            const statusClass = 'pin-' + (t.status || 'OPEN');
            const safeTitle = escapeHtml(t.title || 'Zadanie');

            let statusIcon = '📌';
            const st = (t.status || '').toUpperCase();
            if (st === 'IN_PROGRESS') statusIcon = '⚙️';
            else if (st === 'DONE_WAITING_APPROVAL') statusIcon = '⏳';
            else if (st === 'APPROVED' || st === 'CLOSED') statusIcon = '✓';
            else if (st === 'REJECTED') statusIcon = '✕';

            const icon = L.divIcon({
              className: '',
              html: '<div class="custom-pin ' + statusClass + '">' + statusIcon + '<span class="pin-label">' + safeTitle + '</span></div>',
              iconSize: [32, 32],
              iconAnchor: [16, 16],
            });

            const marker = L.marker(ll, { icon: icon }).addTo(map);
            marker.bindTooltip('<b>' + safeTitle + '</b><br/>Status: ' + st, { direction: 'top', className: 'plan-tooltip' });
            marker.on('click', function(e) {
              L.DomEvent.stopPropagation(e);
              send({ type: 'TASK_CLICK', id: t.id });
            });
          };

          // 1:1 Web Stromkreise Marker Generator (Podłużny badge bez błyskawicy, rotacja pion/poziom i pełna nazwa w chmurce)
          window.addCircuitMarker = function(c) {
            if (!c) return;
            const ll = normToLatLng(c.x_norm || 0.2, c.y_norm || 0.2);
            const title = escapeHtml(c.circuit_code || c.circuit_name || c.short_label || '1');
            const fullName = escapeHtml(c.full_name || '');
            const st = (c.status || 'open').toUpperCase();
            const type = c.type || 'socket';

            let metaObj = {};
            try {
              if (typeof c.metadata === 'string') metaObj = JSON.parse(c.metadata);
              else if (c.metadata && typeof c.metadata === 'object') metaObj = c.metadata;
            } catch(e) {}

            const orientation = c.orientation || metaObj.orientation || (metaObj.rotation === 270 ? 'vertical' : 'horizontal');
            const isVertical = orientation === 'vertical' || orientation === 'senkrecht';
            const rotation = c.rotation != null ? c.rotation : (metaObj.rotation != null ? metaObj.rotation : (isVertical ? 270 : 0));

            let skClass = 'sk-socket';
            if (st === 'APPROVED' || st === 'DONE' || st === 'CLOSED') {
              skClass = 'sk-approved';
            } else if (st === 'PENDING_APPROVAL' || st === 'GEMELDET ZUR AUSFÜHRUNG') {
              skClass = 'sk-pending';
            } else if (type === 'light') {
              skClass = 'sk-light';
            } else if (type === 'edv') {
              skClass = 'sk-edv';
            } else if (type === 'cee') {
              skClass = 'sk-cee';
            } else if (type === 'special') {
              skClass = 'sk-special';
            }

            const rotStyle = rotation ? 'transform: rotate(' + rotation + 'deg); transform-origin: center;' : '';

            const icon = L.divIcon({
              className: '',
              html: '<div class="stromkreis-badge-container ' + skClass + '" style="' + rotStyle + '">' + title + '</div>',
              iconSize: [title.length > 3 ? 38 : 28, 20],
              iconAnchor: [(title.length > 3 ? 38 : 28) / 2, 10],
            });

            const marker = L.marker(ll, { icon: icon }).addTo(map);

            let tooltipHtml = '<div style="font-weight: 800; font-size: 11px;">Stromkreis ' + title + '</div>';
            if (fullName) {
              tooltipHtml += '<div style="font-size: 10px; color: #38BDF8; font-weight: 700; margin-top: 2px;">🏷️ ' + fullName + '</div>';
            }
            const cableType = escapeHtml(c.cable_type || metaObj.kabeltyp || metaObj.cable_type || metaObj.cable || '');
            if (cableType) {
              tooltipHtml += '<div style="font-size: 10px; color: #F59E0B; font-weight: 600; margin-top: 2px;">🔌 ' + cableType + '</div>';
            }
            tooltipHtml += '<div style="font-size: 9px; opacity: 0.8; margin-top: 2px;">Status: ' + st + '</div>';

            marker.bindTooltip(tooltipHtml, { direction: 'top', className: 'plan-tooltip' });
            marker.on('click', function(e) {
              L.DomEvent.stopPropagation(e);
              send({ type: 'CIRCUIT_CLICK', id: c.id });
            });
          };

          window.addPlanSymbolMarker = function(s) {
            if (!s) return;
            const ll = normToLatLng(s.x_norm || 0.3, s.y_norm || 0.3);
            const def = symbolMeta.find(function(d) { return d.id === s.symbol_type; }) || { emoji: '📍', color: '#38BDF8' };
            const mainLabel = escapeHtml(s.label || def.name || s.symbol_type);
            const subLabel = s.loop_number ? 'P' + s.loop_number + (s.address ? '/' + s.address : '') : (s.address || '');
            const displayLabel = subLabel ? mainLabel + ' ' + subLabel : mainLabel;
            const rot = s.parsed_desc?.rotation || 0;
            const svgHtml = getVectorSvgHtml(s.symbol_type, def.color || '#38BDF8', rot);

            const icon = L.divIcon({
              className: '',
              html: '<div class="svg-marker-container"><div class="svg-marker-box" style="border-color: ' + def.color + 'aa;">' + svgHtml + '</div><span class="pin-label">' + displayLabel + '</span></div>',
              iconSize: [36, 36],
              iconAnchor: [18, 18],
            });

            const marker = L.marker(ll, { icon: icon }).addTo(map);
            let tooltipContent = '<b>' + mainLabel + '</b>';
            if (s.loop_number) tooltipContent += '<br/>Pętla: ' + escapeHtml(s.loop_number);
            if (s.address) tooltipContent += '<br/>Adres: ' + escapeHtml(s.address);
            marker.bindTooltip(tooltipContent, { direction: 'top', className: 'plan-tooltip' });

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
              const orthoPts = makeStrictOrthoPolyline(pts);
              const latlngs = orthoPts.map(function(p) {
                const xn = p.x_norm != null ? p.x_norm : (p.x / worldPxW);
                const yn = p.y_norm != null ? p.y_norm : (p.y / worldPxH);
                return normToLatLng(xn, yn);
              });

              const isE30 = c.cable_type && (c.cable_type.includes('E30') || c.cable_type.includes('E90') || c.cable_type.includes('FE180'));
              const cableColor = isE30 ? '#F97316' : '#38BDF8';
              const poly = L.polyline(latlngs, {
                color: cableColor,
                weight: 5,
                opacity: 0.9,
                dashArray: c.status === 'planned' ? '8, 8' : undefined,
              }).addTo(map);

              const cableTitle = escapeHtml(c.cable_number || 'Kabel');
              const cableType = escapeHtml(c.cable_type || '');
              const lengthText = c.length ? c.length + 'm' : '';
              const fullLabel = cableTitle + (cableType ? ' • ' + cableType : '') + (lengthText ? ' • ' + lengthText : '');

              poly.bindTooltip('<b>' + cableTitle + '</b><br/>Typ: ' + cableType + (lengthText ? '<br/>Długość: ' + lengthText : ''), {
                sticky: true,
                className: 'plan-tooltip'
              });

              // Add text badge at midpoint
              const midIdx = Math.floor(latlngs.length / 2);
              const midPoint = latlngs[midIdx];
              if (midPoint) {
                const labelIcon = L.divIcon({
                  className: '',
                  html: '<span class="cable-badge" style="border-color:' + cableColor + ';">' + fullLabel + '</span>',
                  iconSize: [120, 20],
                  iconAnchor: [60, 10],
                });
                L.marker(midPoint, { icon: labelIcon, interactive: false }).addTo(map);
              }

              poly.on('click', function(e) {
                L.DomEvent.stopPropagation(e);
                send({ type: 'CABLE_CLICK', id: c.id });
              });
            }
          };

          // Tile Layer with Local Cache First and Remote Fallback
          if (planId) {
            const tokenParam = token ? '?token=' + encodeURIComponent(token) : '';
            const localTileDir = "${isLocalTileCached ? TileCacheService.getPlanTilesDir(planId) : ''}";
            const remoteUrl = apiUrl + '/api/tiles/' + planId + '/{z}/{x}/{y}.png' + tokenParam;
            const tileUrl = localTileDir ? localTileDir + '{z}/{x}/{y}.png' : remoteUrl;

            const tileLayer = L.tileLayer(tileUrl, {
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

            if (localTileDir) {
              tileLayer.on('tileerror', function(error) {
                if (error && error.tile && error.coords) {
                  error.tile.src = apiUrl + '/api/tiles/' + planId + '/' + error.coords.z + '/' + error.coords.x + '/' + error.coords.y + '.png' + tokenParam;
                }
              });
            }
          }

          map.fitBounds(bounds);

          map.on('click', function(e) {
            const norm = latLngToNorm(e.latlng.lat, e.latlng.lng);
            if (norm.x_norm >= 0 && norm.x_norm <= 1.05 && norm.y_norm >= 0 && norm.y_norm <= 1.05) {
              send({ type: 'MAP_CLICK', x_norm: norm.x_norm, y_norm: norm.y_norm });
            }
          });

          window.addAufmassMarker = function(am) {
            if (!am) return;
            const ll = normToLatLng(am.x_norm, am.y_norm);
            const color = am.color || (am.session_type === 'baubehinderung' ? '#ef4444' : am.session_type === 'zusatz' ? '#f59e0b' : am.session_type === 'bestellung' ? '#8b5cf6' : am.session_type === 'fragen' ? '#ec4899' : '#3b82f6');
            const prefix = am.session_type === 'zusatz' ? 'Z' : am.session_type === 'baubehinderung' ? 'B' : am.session_type === 'bestellung' ? 'Bs' : am.session_type === 'fragen' ? 'F' : 'A';
            const label = escapeHtml(am.label || prefix);
            const iconHtml = '<div style="background-color: ' + color + '; border: 2px solid white; border-radius: 12px; min-width: 24px; height: 24px; padding: 0 4px; display: flex; align-items: center; justify-content: center; color: white; font-size: 11px; font-weight: 800; box-shadow: 0 2px 8px rgba(0,0,0,0.6); cursor: pointer;">' + label + '</div>';
            const icon = L.divIcon({ className: '', html: iconHtml, iconSize: [24, 24], iconAnchor: [12, 12] });
            const marker = L.marker(ll, { icon: icon }).addTo(map);
            marker.bindTooltip('<b>Punkt Aufmaß ' + label + '</b><br/>Typ: ' + escapeHtml(am.session_type || 'Aufmaß'), { direction: 'top', className: 'plan-tooltip' });
          };

          // Render Active Elements
          ${JSON.stringify(visibleTasks)}.forEach(function(t) { window.addTaskMarker(t); });
          ${JSON.stringify(visibleCircuits)}.forEach(function(c) { window.addCircuitMarker(c); });
          ${JSON.stringify(visibleSymbols)}.forEach(function(s) { window.addPlanSymbolMarker(s); });
          ${JSON.stringify(visibleCables)}.forEach(function(c) { window.addCablePolyline(c); });
          ${JSON.stringify(visibleAufmass)}.forEach(function(a) { window.addAufmassMarker(a); });
        </script>
      </body>
      </html>
    `;
  };

  const handleDownloadOffline = async () => {
    if (!plan?.id || downloadingOffline) return;
    try {
      setDownloadingOffline(true);
      const res = await TileCacheService.prefetchPlanTiles(plan.id, 4);
      if (res.success) {
        setIsLocalTileCached(true);
        const b = await TileCacheService.getPlanCacheSize(plan.id);
        setPlanCacheBytes(b);
        Alert.alert('✅ Pomyślnie pobrano', `Plan został zapisany offline (${TileCacheService.formatBytes(b)}).`);
      } else {
        Alert.alert('Uwaga', 'Nie udało się pobrać wszystkich kafelków planu.');
      }
    } catch (e: any) {
      Alert.alert('Błąd', e?.message || 'Wystąpił błąd podczas pobierania planu.');
    } finally {
      setDownloadingOffline(false);
    }
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <TouchableOpacity
                style={[styles.headerOfflineBtn, isLocalTileCached && styles.headerOfflineBtnCached]}
                onPress={handleDownloadOffline}
                disabled={downloadingOffline}
              >
                {downloadingOffline ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.headerOfflineBtnText}>
                    {isLocalTileCached ? `💾 ${TileCacheService.formatBytes(planCacheBytes)}` : '⬇️ Offline'}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.headerLayersBtn}
                onPress={() => setShowLayersModal(true)}
              >
                <Text style={styles.headerLayersBtnText}>🗂️ Warstwy</Text>
              </TouchableOpacity>
            </View>
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
            style={[styles.toolChip, layers.circuits && styles.toolChipActive]}
            onPress={() => toggleLayer('circuits')}
          >
            <Text style={[styles.toolChipText, layers.circuits && styles.toolChipTextActive]}>
              ⚡ Obwody ({layerCounts.circuits})
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
              🪜 Kable ({layerCounts.cables})
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
          <Text style={styles.loadingText}>Ładowanie kafelków i obiektów Leaflet...</Text>
        </View>
      ) : (
        <View style={styles.mapWrapper}>
          <WebView
            ref={webViewRef}
            originWhitelist={['*']}
            source={{ html: generateLeafletHtml(), baseUrl: 'file:///' }}
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

      {/* 5. Bottom Stromkreis Drawer (1:1 Web with Execution / Approval Buttons, Full Name and Orientation Controls) */}
      {selectedCircuit && (
        <View style={styles.drawer}>
          <View style={styles.drawerHandle} />
          <View style={styles.drawerHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.circuitDrawerTitle}>
                Stromkreis: {selectedCircuit.circuit_code || selectedCircuit.circuit_name}
              </Text>
              {selectedCircuit.full_name ? (
                <View style={styles.circuitFullNameBadge}>
                  <Text style={styles.circuitFullNameText}>🏷️ {selectedCircuit.full_name}</Text>
                </View>
              ) : null}
              <Text style={styles.circuitDrawerSubtitle}>
                Typ: {ALL_SYMBOLS.find((s) => s.id === selectedCircuit.type)?.name || selectedCircuit.type}
                {selectedCircuit.cable_type ? ` • ${selectedCircuit.cable_type}` : ''}
              </Text>
              <View style={styles.statusBadgeRow}>
                <Text style={styles.statusBadgeLabel}>
                  Status: <Text style={styles.statusBadgeValue}>{selectedCircuit.status || 'Offen'}</Text>
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => setSelectedCircuit(null)} style={styles.drawerClose}>
              <Text style={styles.drawerCloseText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Orientation Toggle Button */}
          <TouchableOpacity
            style={styles.orientationBtn}
            onPress={() => toggleCircuitOrientation(selectedCircuit.id)}
          >
            <Text style={styles.orientationBtnText}>
              📐 Orientacja: {selectedCircuit.orientation === 'vertical' || selectedCircuit.rotation === 270 ? '↕️ Pionowo (270°)' : '↔️ Poziomo (0°)'} — Dotknij, aby zmienić
            </Text>
          </TouchableOpacity>

          {/* User Execution and Admin Action Buttons */}
          <View style={styles.circuitActionButtonsRow}>
            {selectedCircuit.status !== 'APPROVED' && (
              <TouchableOpacity
                style={styles.executeBtn}
                onPress={() => updateCircuitStatus(selectedCircuit.id, 'PENDING_APPROVAL')}
              >
                <Text style={styles.executeBtnText}>✓ Ausführung melden</Text>
              </TouchableOpacity>
            )}

            {selectedCircuit.status === 'PENDING_APPROVAL' && (
              <TouchableOpacity
                style={styles.undoBtn}
                onPress={() => updateCircuitStatus(selectedCircuit.id, 'open')}
              >
                <Text style={styles.undoBtnText}>↩ Zurückziehen</Text>
              </TouchableOpacity>
            )}

            {(isAdmin || isMod) && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <TouchableOpacity
                  style={styles.approveBtn}
                  onPress={() => updateCircuitStatus(selectedCircuit.id, 'APPROVED')}
                >
                  <Text style={styles.approveBtnText}>✓ Freigeben (Zatwierdź)</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.rejectBtn}
                  onPress={() => updateCircuitStatus(selectedCircuit.id, 'REJECTED')}
                >
                  <Text style={styles.rejectBtnText}>✕ Ablehnen</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      )}

      {/* 6. Bottom Generic Symbol Drawer (Pompy ciepła, BMA, Notlicht, Klapy) */}
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
              {selectedSymbol.parsed_desc?.notes && (
                <Text style={[styles.drawerDesc, { marginTop: 4 }]}>
                  {selectedSymbol.parsed_desc.notes}
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={() => setSelectedSymbol(null)} style={styles.drawerClose}>
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
                { key: 'circuits', label: '⚡ Elektro & Obwody', desc: 'Gniazda 230V, CEE, EDV, wypusty', count: layerCounts.circuits },
                { key: 'heating', label: '❄️ Pompy Ciepła & Heizung', desc: 'Wärmepumpen, promienniki, sterowniki', count: layerCounts.heating },
                { key: 'lighting', label: '💡 Oświetlenie & LED', desc: 'Oprawy, kinkiety, paski LED, włączniki', count: layerCounts.lighting },
                { key: 'bma', label: '🚨 BMA & Pożarówka', desc: 'Czujki dymu, ROP, syreny, centrale', count: layerCounts.bma },
                { key: 'notlicht', label: '🟢 Notbeleuchtung & Pikto', desc: 'Oprawy awaryjne, piktogramy ewakuacyjne', count: layerCounts.notlicht },
                { key: 'cables', label: '🪜 Kable & Trasy Kablowe', desc: 'Trasy, korytka, odcinki kabli', count: layerCounts.cables },
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

      {/* 9. Modal: Add Pin Dialog */}
      <Modal
        visible={!!newPinNorm}
        transparent
        animationType="slide"
        onRequestClose={() => setNewPinNorm(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.addModalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalHeading}>➕ Wstaw Obiekt na Planie</Text>
              <TouchableOpacity onPress={() => setNewPinNorm(null)}>
                <Text style={styles.drawerCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Category Pills */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryPillsScroll}>
              {[
                { id: 'tasks', name: 'Zadania', emoji: '📌' },
                { id: 'circuits', name: 'Obwody', emoji: '⚡' },
                { id: 'heating', name: 'Pompy Ciepła', emoji: '❄️' },
                { id: 'lighting', name: 'Światło', emoji: '💡' },
                { id: 'bma', name: 'BMA', emoji: '🚨' },
                { id: 'notlicht', name: 'Notlicht', emoji: '🟢' },
                { id: 'klappen', name: 'Klapy', emoji: '🔲' },
              ].map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.categoryPill, selectedCategory === c.id && styles.categoryPillActive]}
                  onPress={() => {
                    setSelectedCategory(c.id as SymbolCategory);
                    const first = ALL_SYMBOLS.find((s) => s.category === c.id);
                    if (first) {
                      setSelectedSymbolType(first.id);
                      setObjectTitle(first.defaultLabel || first.name);
                    }
                  }}
                >
                  <Text style={[styles.categoryPillText, selectedCategory === c.id && styles.categoryPillTextActive]}>
                    {c.emoji} {c.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Symbols Horizontal Grid */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.symbolsGridScroll}>
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
                    style={[styles.input, { flex: 1 }]}
                    placeholder="Zasilanie (np. 400V)"
                    placeholderTextColor="#64748B"
                    value={objectZuleitung}
                    onChangeText={setObjectZuleitung}
                  />
                </View>
              )}

              {selectedSymbolType === 'revisionsklappe' && (
                <View style={styles.klappeSizeRow}>
                  {['30x30', '40x40', '50x50', '60x60'].map((sz) => (
                    <TouchableOpacity
                      key={sz}
                      style={[styles.klappeSizeChip, objectKlappeSize === sz && styles.klappeSizeChipActive]}
                      onPress={() => setObjectKlappeSize(sz)}
                    >
                      <Text style={[styles.klappeSizeText, objectKlappeSize === sz && styles.klappeSizeTextActive]}>
                        {sz}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <TextInput
                style={[styles.input, { height: 60, textAlignVertical: 'top' }]}
                placeholder="Dodatkowy opis..."
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
                onPress={() => setNewPinNorm(null)}
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
  headerOfflineBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: '#0284C7',
    borderRadius: 6,
  },
  headerOfflineBtnCached: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  headerOfflineBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
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
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    borderColor: '#38BDF8',
  },
  toolChipText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
  },
  toolChipTextActive: {
    color: '#38BDF8',
  },
  mapWrapper: {
    flex: 1,
    backgroundColor: '#030712',
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
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 16,
    paddingBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 20,
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
  },
  drawerTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  circuitDrawerTitle: {
    color: '#38BDF8',
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 2,
  },
  circuitFullNameBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.4)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    marginVertical: 4,
  },
  circuitFullNameText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '800',
  },
  circuitDrawerSubtitle: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  orientationBtn: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#38BDF8',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    marginVertical: 6,
  },
  orientationBtnText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '800',
  },
  statusBadgeRow: {
    marginTop: 2,
  },
  statusBadgeLabel: {
    color: '#94A3B8',
    fontSize: 12,
  },
  statusBadgeValue: {
    color: '#34D399',
    fontWeight: '800',
  },
  circuitActionButtonsRow: {
    marginTop: 12,
  },
  executeBtn: {
    backgroundColor: '#0284C7',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 6,
  },
  executeBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  undoBtn: {
    backgroundColor: '#334155',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 6,
  },
  undoBtnText: {
    color: '#F8FAFC',
    fontWeight: '700',
    fontSize: 12,
  },
  approveBtn: {
    flex: 1,
    backgroundColor: '#16A34A',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  approveBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },
  rejectBtn: {
    flex: 1,
    backgroundColor: '#DC2626',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  rejectBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },
  drawerDesc: {
    color: '#94A3B8',
    fontSize: 12,
  },
  drawerClose: {
    padding: 6,
  },
  drawerCloseText: {
    color: '#94A3B8',
    fontSize: 16,
    fontWeight: '800',
  },
  fullDetailsBtn: {
    backgroundColor: '#0284C7',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  fullDetailsBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    padding: 16,
  },
  layersModalCard: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 16,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalHeading: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '800',
  },
  layerItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E293B',
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  layerItemRowActive: {
    borderColor: '#38BDF8',
    backgroundColor: '#162238',
  },
  layerItemTitle: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '700',
  },
  layerItemTitleActive: {
    color: '#38BDF8',
  },
  layerItemDesc: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
  },
  toggleCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#64748B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleCheckboxActive: {
    backgroundColor: '#0284C7',
    borderColor: '#38BDF8',
  },
  toggleCheckMark: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  addModalCard: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 16,
  },
  categoryPillsScroll: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  categoryPill: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  categoryPillActive: {
    backgroundColor: '#0284C7',
    borderColor: '#38BDF8',
  },
  categoryPillText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
  },
  categoryPillTextActive: {
    color: '#FFFFFF',
  },
  symbolsGridScroll: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  symbolCard: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
    minWidth: 80,
  },
  symbolCardActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    borderColor: '#38BDF8',
  },
  symbolCardEmoji: {
    fontSize: 20,
    marginBottom: 4,
  },
  symbolCardText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  symbolCardTextActive: {
    color: '#38BDF8',
    fontWeight: '800',
  },
  input: {
    backgroundColor: '#1E293B',
    color: '#F8FAFC',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  rowInputs: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  klappeSizeRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  klappeSizeChip: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  klappeSizeChipActive: {
    backgroundColor: '#D97706',
    borderColor: '#F59E0B',
  },
  klappeSizeText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
  },
  klappeSizeTextActive: {
    color: '#FFFFFF',
  },
  photoActionRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  photoBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  photoBtnText: {
    color: '#38BDF8',
    fontSize: 11,
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
