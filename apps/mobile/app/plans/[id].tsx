import React, { useState, useEffect, useCallback, useRef } from 'react';
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
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
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

interface BmaPin {
  id: string;
  device_number: string;
  device_type: string;
  pos_x: number;
  pos_y: number;
  status: string;
}

interface CablePin {
  id: string;
  cable_number: string;
  cable_type: string;
  length?: number;
  status?: string;
  points_json?: string;
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

interface FloorOption {
  id: string;
  name: string;
  plan_id?: string;
}

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
  const [bmaDevices, setBmaDevices] = useState<BmaPin[]>([]);
  const [cables, setCables] = useState<CablePin[]>([]);
  const [circuits, setCircuits] = useState<CircuitPin[]>([]);

  // Active Layers
  const [layerTasks, setLayerTasks] = useState(true);
  const [layerCables, setLayerCables] = useState(true);
  const [layerCircuits, setLayerCircuits] = useState(true);
  const [layerBma, setLayerBma] = useState(true);

  // Selected Entity for Bottom Drawer
  const [selectedTask, setSelectedTask] = useState<TaskPin | null>(null);
  const [selectedBma, setSelectedBma] = useState<BmaPin | null>(null);
  const [selectedCable, setSelectedCable] = useState<CablePin | null>(null);
  const [selectedCircuit, setSelectedCircuit] = useState<CircuitPin | null>(null);

  // Add Task Modal (via Map Click)
  const [newPinCoords, setNewPinCoords] = useState<{ x: number; y: number } | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');

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
        // Only if NO id is provided at all, fallback to first plan in SQLite
        planRow = await db.getFirstAsync<PlanInfo>(
          'SELECT id, project_id, floor_id, name, width, height, image_url, pdf_url FROM plans WHERE deleted_at IS NULL LIMIT 1;'
        );
      }

      const activePlanId = id || planRow?.id || 'pln-sample-001';

      // 2. Fetch real metadata from server if online
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

      // If activeProjectId is missing locally, attempt to fetch plan info from backend
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
        } catch {
          // ignore
        }
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

      // Check if tiles for this plan exist offline in FileSystem
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
          console.warn('[InteractivePlan] Tasks API sync error:', taskErr);
        }
      }
      setTasks(loadedTasks);

      // 4. Fetch Stromkreise (Circuits) on Plan (Live API + SQLite)
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
          console.warn('[InteractivePlan] Circuits API sync error:', circErr);
        }
      }
      setCircuits(loadedCircuits);

      // 5. Fetch BMA Devices (Live API + SQLite)
      let loadedBma: BmaPin[] = [];
      const localBmaRows = await db.getAllAsync<BmaPin>(
        'SELECT id, device_number, device_type, pos_x, pos_y, status FROM bma_devices WHERE plan_id = ? AND deleted_at IS NULL;',
        [activePlanId]
      );
      loadedBma = localBmaRows || [];

      if (token && activeProjectId) {
        try {
          const bmaUrl = `${apiUrl}/api/bma/devices?projectId=${activeProjectId}&planId=${activePlanId}`;
          const bRes = await fetch(bmaUrl, { headers });
          if (bRes.ok) {
            const bJson = await bRes.json();
            const bmaData = Array.isArray(bJson) ? bJson : (bJson?.data || []);
            if (Array.isArray(bmaData) && bmaData.length > 0) {
              loadedBma = bmaData.map((b: any) => {
                const px = b.x_norm != null ? Math.round(b.x_norm * fetchedWidth) : (b.pos_x || 150);
                const py = b.y_norm != null ? Math.round(b.y_norm * fetchedHeight) : (b.pos_y || 150);
                const label = b.device_number || (b.loop_number && b.address ? `${b.loop_number}/${b.address}` : (b.label || 'BMA'));
                return {
                  id: b.id || `bma-${Math.random()}`,
                  device_number: label,
                  device_type: b.device_type || b.symbol_type || 'Melder',
                  pos_x: px,
                  pos_y: py,
                  status: b.status || 'OK',
                };
              });
            }
          }
        } catch (bmaErr) {
          console.warn('[InteractivePlan] BMA API sync error:', bmaErr);
        }
      }
      setBmaDevices(loadedBma);

      // 6. Fetch Cables
      const cableRows = await db.getAllAsync<CablePin>(
        'SELECT id, cable_number, cable_type, length, status, points_json FROM cables WHERE plan_id = ? AND deleted_at IS NULL;',
        [activePlanId]
      );
      setCables(cableRows || []);

      // 7. Fetch Sibling Floors
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
          setSelectedBma(null);
          setSelectedCable(null);
          setSelectedCircuit(null);
        }
      } else if (data.type === 'BMA_CLICK') {
        const found = bmaDevices.find((b) => b.id === data.id);
        if (found) {
          setSelectedBma(found);
          setSelectedTask(null);
          setSelectedCable(null);
          setSelectedCircuit(null);
        }
      } else if (data.type === 'CABLE_CLICK') {
        const found = cables.find((c) => c.id === data.id);
        if (found) {
          setSelectedCable(found);
          setSelectedTask(null);
          setSelectedBma(null);
          setSelectedCircuit(null);
        }
      } else if (data.type === 'CIRCUIT_CLICK') {
        const found = circuits.find((c) => c.id === data.id);
        if (found) {
          setSelectedCircuit(found);
          setSelectedTask(null);
          setSelectedBma(null);
          setSelectedCable(null);
        }
      } else if (data.type === 'MAP_CLICK') {
        setNewPinCoords({ x: Math.round(data.x), y: Math.round(data.y) });
      } else if (data.type === 'TILE_ERROR') {
        if (__DEV__) {
          console.warn('[Leaflet WebView] Tile error:', data.url, data.coords);
        }
      }
    } catch (e) {
      console.warn('[InteractivePlan] Parse message error:', e);
    }
  };

  const updateTaskStatus = async (task: TaskPin, nextStatus: 'open' | 'in_progress' | 'closed') => {
    try {
      const db = await getDatabase();
      const nextVersion = (task.version || 1) + 1;
      const now = new Date().toISOString();

      await db.runAsync(
        'UPDATE tasks SET status = ?, version = ?, updated_at = ? WHERE id = ?;',
        [nextStatus, nextVersion, now, task.id]
      );

      await db.runAsync(`
        INSERT INTO mutations (
          mutation_id, entity_type, entity_id, operation, base_version, payload, status, attempts, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?);
      `, [
        `mut-${Date.now()}-${task.id}`,
        'task',
        task.id,
        'UPDATE',
        task.version || 1,
        JSON.stringify({ status: nextStatus, updated_at: now }),
        'PENDING',
        now,
        now,
      ]);

      const updated = { ...task, status: nextStatus, version: nextVersion };
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
      setSelectedTask(updated);

      // Refresh WebView Pins
      webViewRef.current?.injectJavaScript(`
        if (window.updateTaskStatus) {
          window.updateTaskStatus("${task.id}", "${nextStatus}");
        }
        true;
      `);
    } catch (err: any) {
      Alert.alert('Błąd', err?.message || 'Nie udało się zaktualizować statusu');
    }
  };

  const [creationType, setCreationType] = useState<'task' | 'socket' | 'light' | 'cee' | 'edv' | 'bma'>('task');

  const createPinEntity = async () => {
    if (!newPinCoords || !newTaskTitle.trim() || !plan) return;
    try {
      const db = await getDatabase();
      const now = new Date().toISOString();
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://inspecthero.pl';
      const token = session?.access_token;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      if (creationType === 'task') {
        const newTaskId = `tsk-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const newTask: TaskPin = {
          id: newTaskId,
          title: newTaskTitle.trim(),
          description: newTaskDesc.trim() || undefined,
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

        await db.runAsync(`
          INSERT INTO mutations (
            mutation_id, entity_type, entity_id, operation, base_version, payload, status, attempts, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?);
        `, [
          `mut-${Date.now()}-${newTask.id}`,
          'task',
          newTask.id,
          'INSERT',
          1,
          JSON.stringify({
            id: newTask.id,
            plan_id: plan.id,
            title: newTask.title,
            description: newTask.description,
            status: newTask.status,
            priority: newTask.priority,
            pos_x: newTask.pos_x,
            pos_y: newTask.pos_y,
          }),
          'PENDING',
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
      } else if (creationType === 'bma') {
        const newBmaId = `bma-${Date.now()}`;
        const newBma: BmaPin = {
          id: newBmaId,
          device_number: newTaskTitle.trim(),
          device_type: 'Rauchmelder',
          pos_x: newPinCoords.x,
          pos_y: newPinCoords.y,
          status: 'OK',
        };

        await db.runAsync(`
          INSERT INTO bma_devices (id, plan_id, device_number, device_type, pos_x, pos_y, status, version)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1);
        `, [newBma.id, plan.id, newBma.device_number, newBma.device_type, newBma.pos_x, newBma.pos_y, newBma.status]);

        setBmaDevices((prev) => [...prev, newBma]);
        webViewRef.current?.injectJavaScript(`
          if (window.addBmaMarker) {
            window.addBmaMarker(${JSON.stringify(newBma)});
          }
          true;
        `);
      } else {
        // Circuit marker (socket, light, cee, edv)
        const newCircId = `circ-${Date.now()}`;
        const newCirc: CircuitPin = {
          id: newCircId,
          circuit_name: newTaskTitle.trim(),
          circuit_code: newTaskTitle.trim(),
          full_name: newTaskDesc.trim() || undefined,
          type: creationType,
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
      }

      setNewPinCoords(null);
      setNewTaskTitle('');
      setNewTaskDesc('');
    } catch (err: any) {
      Alert.alert('Błąd', err?.message || 'Nie udało się dodać obiektu');
    }
  };

  const generateLeafletHtml = () => {
    const width = plan?.width || 1920;
    const height = plan?.height || 1080;
    const planId = plan?.id || id || '';
    const token = session?.access_token || '';
    const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://inspecthero.pl';

    const visibleTasks = layerTasks ? tasks : [];
    const visibleBma = layerBma ? bmaDevices : [];
    const visibleCables = layerCables ? cables : [];
    const visibleCircuits = layerCircuits ? circuits : [];

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
            -webkit-box-sizing: border-box;
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
            -webkit-user-select: none;
            user-select: none;
          }
          .custom-pin {
            width: 28px;
            height: 28px;
            box-sizing: border-box;
            -webkit-box-sizing: border-box;
            border-radius: 50% !important;
            -webkit-border-radius: 50% !important;
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
            transform: translateZ(0);
            -webkit-transform: translateZ(0);
            -webkit-backface-visibility: hidden;
            backface-visibility: hidden;
            flex-shrink: 0;
            transition: transform 0.15s ease;
          }
          .custom-pin:hover {
            transform: scale(1.15) translateZ(0);
            -webkit-transform: scale(1.15) translateZ(0);
          }
          .pin-open { background-color: #38BDF8; }
          .pin-in_progress { background-color: #EAB308; }
          .pin-closed { background-color: #22C55E; }
          .pin-bma {
            background-color: #EF4444;
            border-color: #FCA5A5;
            border-radius: 50% !important;
            -webkit-border-radius: 50% !important;
          }
          .pin-circuit {
            background-color: #A855F7;
            border-color: #E9D5FF;
            border-radius: 50% !important;
            -webkit-border-radius: 50% !important;
          }
          .pin-label {
            position: absolute;
            bottom: -18px;
            left: 50%;
            transform: translateX(-50%);
            -webkit-transform: translateX(-50%);
            background: rgba(15, 23, 42, 0.92);
            color: #F8FAFC;
            font-size: 9px;
            font-weight: 700;
            padding: 1px 5px;
            border-radius: 4px;
            -webkit-border-radius: 4px;
            white-space: nowrap;
            border: 1px solid #334155;
            pointer-events: none;
            box-shadow: 0 1px 4px rgba(0,0,0,0.5);
          }
          .leaflet-container {
            background-color: #030712 !important;
          }
          .leaflet-popup-content-wrapper {
            background-color: #0F172A;
            color: #F8FAFC;
            border: 1px solid #38BDF8;
            border-radius: 8px;
            padding: 4px;
          }
          .leaflet-popup-tip {
            background-color: #0F172A;
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

          // Standard CRS.Simple coordinates:
          // Top-left: [0, 0], Bottom-right: [-worldPxH / 2^maxZoom, worldPxW / 2^maxZoom]
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

          // HTML Escaping Helper
          function escapeHtml(str) {
            if (str === null || str === undefined) return '';
            return String(str)
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;');
          }

          // Helper to send message to React Native
          function send(obj) {
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify(obj));
            }
          }

          // Marker Storage for fast updates
          const taskMarkers = {};

          // GLOBAL FUNCTIONS DEFINED BEFORE USAGE
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
            taskMarkers[t.id] = marker;
          };

          window.updateTaskStatus = function(taskId, newStatus) {
            const m = taskMarkers[taskId];
            if (m) {
              const el = m.getElement();
              if (el) {
                const pin = el.querySelector('.custom-pin');
                if (pin) {
                  pin.className = 'custom-pin pin-' + newStatus;
                }
              }
            }
          };

          window.addBmaMarker = function(b) {
            if (!b) return;
            const lat = -(b.pos_y || 300) / Math.pow(2, maxZoom);
            const lng = (b.pos_x || 300) / Math.pow(2, maxZoom);
            const safeLabel = escapeHtml(b.device_number || 'BMA').substring(0, 15);

            const icon = L.divIcon({
              className: '',
              html: '<div class="custom-pin pin-bma" style="width: 26px; height: 26px;">🚨<span class="pin-label">' + safeLabel + '</span></div>',
              iconSize: [26, 26],
              iconAnchor: [13, 13],
            });

            const marker = L.marker([lat, lng], { icon: icon }).addTo(map);
            marker.on('click', function(e) {
              L.DomEvent.stopPropagation(e);
              send({ type: 'BMA_CLICK', id: b.id });
            });
          };

          window.addCircuitMarker = function(c) {
            if (!c) return;
            const lat = -(c.pos_y || 500) / Math.pow(2, maxZoom);
            const lng = (c.pos_x || 500) / Math.pow(2, maxZoom);
            const safeName = escapeHtml(c.circuit_code || c.short_label || c.circuit_name || 'Obwód').substring(0, 15);

            let iconEmoji = '⚡';
            let bgCol = '#A855F7';
            const cType = (c.type || '').toLowerCase();
            if (cType === 'socket') { iconEmoji = '🔌'; bgCol = '#3B82F6'; }
            else if (cType === 'light') { iconEmoji = '💡'; bgCol = '#EAB308'; }
            else if (cType === 'cee') { iconEmoji = '⚡'; bgCol = '#EF4444'; }
            else if (cType === 'edv') { iconEmoji = '🌐'; bgCol = '#10B981'; }
            else if (cType === 'special') { iconEmoji = '⚙️'; bgCol = '#8B5CF6'; }
            else if (cType === 'reserve') { iconEmoji = '🔒'; bgCol = '#64748B'; }
            else if (cType === 'arrow') { iconEmoji = '➡️'; bgCol = '#F97316'; }
            else if (cType === 'line') { iconEmoji = '〰️'; bgCol = '#06B6D4'; }
            else if (cType === 'text') { iconEmoji = '📝'; bgCol = '#6366F1'; }

            if (c.color) bgCol = c.color;

            const icon = L.divIcon({
              className: '',
              html: '<div class="custom-pin" style="width: 26px; height: 26px; background-color: ' + bgCol + '; border-color: #ffffff;">' + iconEmoji + '<span class="pin-label">' + safeName + '</span></div>',
              iconSize: [26, 26],
              iconAnchor: [13, 13],
            });

            const marker = L.marker([lat, lng], { icon: icon }).addTo(map);
            marker.on('click', function(e) {
              L.DomEvent.stopPropagation(e);
              send({ type: 'CIRCUIT_CLICK', id: c.id });
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

          // 1. Primary Raster Tiles Layer
          if (planId) {
            const tokenParam = token ? '?token=' + encodeURIComponent(token) : '';
            const localTileDir = "${isLocalTileCached ? TileCacheService.getPlanTilesDir(planId) : ''}";
            const tileUrl = localTileDir
              ? localTileDir + '{z}/{x}/{y}.png'
              : apiUrl + '/api/tiles/' + planId + '/{z}/{x}/{y}.png' + tokenParam;

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
              errorTileUrl: '',
            }).addTo(map);

            tileLayer.on('tileerror', function(e) {
              send({
                type: 'TILE_ERROR',
                url: e.tile && e.tile.src ? e.tile.src : '',
                coords: e.coords,
              });
            });
          }

          map.fitBounds(bounds);

          // Map Click (Add Pin)
          map.on('click', function(e) {
            const x = Math.round(e.latlng.lng * Math.pow(2, maxZoom));
            const y = Math.round(-e.latlng.lat * Math.pow(2, maxZoom));
            if (x >= 0 && x <= width && y >= 0 && y <= height) {
              send({ type: 'MAP_CLICK', x: x, y: y });
            }
          });

          // Render Elements (Safe calling now that functions are defined!)
          const tasksData = ${JSON.stringify(visibleTasks)};
          tasksData.forEach(function(t) {
            window.addTaskMarker(t);
          });

          const bmaData = ${JSON.stringify(visibleBma)};
          bmaData.forEach(function(b) {
            window.addBmaMarker(b);
          });

          const circuitData = ${JSON.stringify(visibleCircuits)};
          circuitData.forEach(function(c) {
            window.addCircuitMarker(c);
          });

          const cableData = ${JSON.stringify(visibleCables)};
          cableData.forEach(function(c) {
            window.addCablePolyline(c);
          });
        </script>
      </body>
      </html>
    `;
  };

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
      <View style={styles.toolbar}>
        <TouchableOpacity
          style={[styles.toolChip, layerTasks && styles.toolChipActive]}
          onPress={() => setLayerTasks(!layerTasks)}
        >
          <Text style={[styles.toolChipText, layerTasks && styles.toolChipTextActive]}>
            📌 Zadania ({tasks.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.toolChip, layerCables && styles.toolChipActive]}
          onPress={() => setLayerCables(!layerCables)}
        >
          <Text style={[styles.toolChipText, layerCables && styles.toolChipTextActive]}>
            🔌 Kable ({cables.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.toolChip, layerCircuits && styles.toolChipActive]}
          onPress={() => setLayerCircuits(!layerCircuits)}
        >
          <Text style={[styles.toolChipText, layerCircuits && styles.toolChipTextActive]}>
            ⚡ Obwody ({circuits.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.toolChip, layerBma && styles.toolChipActive]}
          onPress={() => setLayerBma(!layerBma)}
        >
          <Text style={[styles.toolChipText, layerBma && styles.toolChipTextActive]}>
            🚨 BMA ({bmaDevices.length})
          </Text>
        </TouchableOpacity>
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
              <Text style={styles.drawerTitle}>{selectedTask.title}</Text>
              {selectedTask.description ? (
                <Text style={styles.drawerDesc}>{selectedTask.description}</Text>
              ) : null}
            </View>
            <TouchableOpacity onPress={() => setSelectedTask(null)} style={styles.drawerClose}>
              <Text style={styles.drawerCloseText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Quick Status Bar */}
          <Text style={styles.drawerSectionLabel}>ZMIEŃ STATUS ZADANIA:</Text>
          <View style={styles.statusRow}>
            <TouchableOpacity
              style={[
                styles.statusBtn,
                selectedTask.status === 'open' && styles.statusBtnOpenActive,
              ]}
              onPress={() => updateTaskStatus(selectedTask, 'open')}
            >
              <Text style={[styles.statusBtnText, selectedTask.status === 'open' && { color: '#38BDF8' }]}>
                OTWARTE
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.statusBtn,
                selectedTask.status === 'in_progress' && styles.statusBtnProgressActive,
              ]}
              onPress={() => updateTaskStatus(selectedTask, 'in_progress')}
            >
              <Text style={[styles.statusBtnText, selectedTask.status === 'in_progress' && { color: '#EAB308' }]}>
                W TRAKCIE
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.statusBtn,
                selectedTask.status === 'closed' && styles.statusBtnClosedActive,
              ]}
              onPress={() => updateTaskStatus(selectedTask, 'closed')}
            >
              <Text style={[styles.statusBtnText, selectedTask.status === 'closed' && { color: '#22C55E' }]}>
                ZAKOŃCZONE
              </Text>
            </TouchableOpacity>
          </View>

          {/* Full Task Details Action */}
          <TouchableOpacity
            style={styles.fullDetailsBtn}
            onPress={() => router.push(`/tasks/${selectedTask.id}` as any)}
          >
            <Text style={styles.fullDetailsBtnText}>📸 Dodaj zdjęcie / Komentarze →</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 5. Bottom BMA Details Drawer */}
      {selectedBma && (
        <View style={styles.drawer}>
          <View style={styles.drawerHandle} />
          <View style={styles.drawerHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.drawerTitle, { color: '#EF4444' }]}>🚨 Czujka BMA: {selectedBma.device_number}</Text>
              <Text style={styles.drawerDesc}>Typ: {selectedBma.device_type} • Status: {selectedBma.status || 'OK'}</Text>
            </View>
            <TouchableOpacity onPress={() => setSelectedBma(null)} style={styles.drawerClose}>
              <Text style={styles.drawerCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 6. Bottom Cable Details Drawer */}
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

      {/* 7. Bottom Circuit Details Drawer */}
      {selectedCircuit && (
        <View style={styles.drawer}>
          <View style={styles.drawerHandle} />
          <View style={styles.drawerHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.drawerTitle, { color: '#A855F7' }]}>
                ⚡ {selectedCircuit.circuit_code || selectedCircuit.circuit_name}
              </Text>
              {selectedCircuit.full_name ? (
                <Text style={styles.drawerDesc}>{selectedCircuit.full_name}</Text>
              ) : null}
              <Text style={[styles.drawerDesc, { marginTop: 4, color: '#94A3B8' }]}>
                Typ: {selectedCircuit.type || 'Gniazdo'} • Zabezpieczenie: {selectedCircuit.fuse_type || 'B16'} {selectedCircuit.phase ? `• Faza: L${selectedCircuit.phase}` : ''}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setSelectedCircuit(null)} style={styles.drawerClose}>
              <Text style={styles.drawerCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 8. Modal: Add Pin on Map Click */}
      <Modal
        visible={!!newPinCoords}
        transparent
        animationType="slide"
        onRequestClose={() => setNewPinCoords(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.createPinModal}>
            <Text style={styles.modalHeading}>📍 Wstaw obiekt / znacznik na rzucie 2D</Text>
            <Text style={styles.coordsText}>
              Pozycja na mapie: X={newPinCoords?.x}, Y={newPinCoords?.y}
            </Text>

            <Text style={styles.typeSelectorLabel}>WYBIERZ TYP SYMBOLU:</Text>
            <View style={styles.typeChipsRow}>
              {[
                { id: 'task', label: '📌 Zadanie' },
                { id: 'socket', label: '🔌 Gniazdo' },
                { id: 'light', label: '💡 Światło' },
                { id: 'cee', label: '⚡ CEE' },
                { id: 'edv', label: '🌐 EDV' },
                { id: 'bma', label: '🚨 BMA' },
              ].map((st) => (
                <TouchableOpacity
                  key={st.id}
                  style={[
                    styles.typeChip,
                    creationType === st.id && styles.typeChipActive,
                  ]}
                  onPress={() => setCreationType(st.id as any)}
                >
                  <Text style={[styles.typeChipText, creationType === st.id && styles.typeChipTextActive]}>
                    {st.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={styles.input}
              placeholder={creationType === 'task' ? 'Tytuł zadania montażowego...' : creationType === 'bma' ? 'Numer czujki (np. 1/12)...' : 'Kod obwodu (np. 1Q1, UV-01)...'}
              placeholderTextColor="#64748B"
              value={newTaskTitle}
              onChangeText={setNewTaskTitle}
            />

            <TextInput
              style={[styles.input, { height: 70, textAlignVertical: 'top' }]}
              placeholder="Dodatkowy opis / specyfikacja (opcjonalnie)..."
              placeholderTextColor="#64748B"
              value={newTaskDesc}
              onChangeText={setNewTaskDesc}
              multiline
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setNewPinCoords(null)}
              >
                <Text style={styles.cancelBtnText}>Anuluj</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.savePinBtn}
                onPress={createPinEntity}
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
  toolbar: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#0F172A',
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
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
  drawerClose: {
    padding: 6,
  },
  drawerCloseText: {
    color: '#94A3B8',
    fontSize: 18,
    fontWeight: '700',
  },
  drawerSectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  statusRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  statusBtn: {
    flex: 1,
    backgroundColor: '#1E293B',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  statusBtnOpenActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    borderColor: '#38BDF8',
  },
  statusBtnProgressActive: {
    backgroundColor: 'rgba(234, 179, 8, 0.2)',
    borderColor: '#EAB308',
  },
  statusBtnClosedActive: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    borderColor: '#22C55E',
  },
  statusBtnText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '800',
  },
  fullDetailsBtn: {
    backgroundColor: '#1E293B',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  fullDetailsBtnText: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    padding: 20,
  },
  createPinModal: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  modalHeading: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 4,
  },
  coordsText: {
    fontSize: 11,
    color: '#38BDF8',
    marginBottom: 10,
    fontWeight: '700',
  },
  typeSelectorLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  typeChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  typeChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  typeChipActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    borderColor: '#38BDF8',
  },
  typeChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },
  typeChipTextActive: {
    color: '#38BDF8',
  },
  input: {
    backgroundColor: '#1E293B',
    color: '#F8FAFC',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 12,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 6,
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
