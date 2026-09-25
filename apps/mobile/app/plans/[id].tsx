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
  const { isAdmin } = useAuth();

  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<PlanInfo | null>(null);
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

      // 1. Fetch Plan
      let planRow = await db.getFirstAsync<PlanInfo>(
        'SELECT id, project_id, floor_id, name, width, height, image_url, pdf_url FROM plans WHERE id = ? AND deleted_at IS NULL;',
        [id]
      );

      if (!planRow) {
        // Fallback to first available plan in SQLite
        planRow = await db.getFirstAsync<PlanInfo>(
          'SELECT id, project_id, floor_id, name, width, height, image_url, pdf_url FROM plans WHERE deleted_at IS NULL LIMIT 1;'
        );
      }

      const activePlan = planRow || {
        id: id || 'pln-sample-001',
        name: 'Rzut Kondygnacji (Leaflet 2D)',
        width: 1920,
        height: 1080,
      };

      setPlan(activePlan);
      setCurrentFloorId(activePlan.floor_id || null);

      const activePlanId = activePlan.id;

      // 2. Fetch Tasks on Plan
      const taskRows = await db.getAllAsync<TaskPin>(
        'SELECT id, title, description, pos_x, pos_y, status, priority, version FROM tasks WHERE plan_id = ? AND deleted_at IS NULL;',
        [activePlanId]
      );
      setTasks(taskRows);

      // 3. Fetch BMA Devices
      const bmaRows = await db.getAllAsync<BmaPin>(
        'SELECT id, device_number, device_type, pos_x, pos_y, status FROM bma_devices WHERE plan_id = ? AND deleted_at IS NULL;',
        [activePlanId]
      );
      setBmaDevices(bmaRows);

      // 4. Fetch Cables
      const cableRows = await db.getAllAsync<CablePin>(
        'SELECT id, cable_number, cable_type, length, status, points_json FROM cables WHERE plan_id = ? AND deleted_at IS NULL;',
        [activePlanId]
      );
      setCables(cableRows);

      // 5. Fetch Circuits
      const circuitRows = await db.getAllAsync<CircuitPin>(
        'SELECT id, circuit_name, fuse_type, pos_x, pos_y FROM stromkreise WHERE plan_id = ? AND deleted_at IS NULL;',
        [activePlanId]
      );
      setCircuits(circuitRows);

      // 6. Fetch Sibling Floors
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
  }, [id]);

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

  const createPinTask = async () => {
    if (!newPinCoords || !newTaskTitle.trim() || !plan) return;
    try {
      const db = await getDatabase();
      const newTaskId = `tsk-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const now = new Date().toISOString();

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
      setNewPinCoords(null);
      setNewTaskTitle('');
      setNewTaskDesc('');

      // Inject new marker dynamically
      webViewRef.current?.injectJavaScript(`
        if (window.addTaskMarker) {
          window.addTaskMarker(${JSON.stringify(newTask)});
        }
        true;
      `);
    } catch (err: any) {
      Alert.alert('Błąd', err?.message || 'Nie udało się dodać zadania');
    }
  };

  const generateLeafletHtml = () => {
    const width = plan?.width || 1920;
    const height = plan?.height || 1080;
    const planId = plan?.id || id || '';

    const visibleTasks = layerTasks ? tasks : [];
    const visibleBma = layerBma ? bmaDevices : [];
    const visibleCables = layerCables ? cables : [];
    const visibleCircuits = layerCircuits ? circuits : [];

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          html, body, #map {
            width: 100%;
            height: 100%;
            margin: 0;
            padding: 0;
            background-color: #030712;
            overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          }
          .custom-pin {
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            color: #ffffff;
            font-weight: 800;
            font-size: 11px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.7);
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
          .pin-bma {
            background-color: #EF4444;
            border-radius: 6px;
            border-color: #FCA5A5;
          }
          .pin-circuit {
            background-color: #A855F7;
            border-radius: 6px;
            border-color: #E9D5FF;
          }
          .pin-label {
            position: absolute;
            bottom: -16px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(15, 23, 42, 0.9);
            color: #F8FAFC;
            font-size: 9px;
            font-weight: 700;
            padding: 1px 4px;
            border-radius: 4px;
            white-space: nowrap;
            border: 1px solid #334155;
            pointer-events: none;
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
          const bounds = [[0, 0], [height, width]];
          const planId = "${planId}";

          const map = L.map('map', {
            crs: L.CRS.Simple,
            minZoom: -2,
            maxZoom: 4,
            zoomSnap: 0.25,
            attributionControl: false,
          });

          // 1. Primary Raster Tiles Layer
          if (planId && planId !== 'pln-sample-001') {
            const tileUrl = 'https://inspecthero.pl/api/tiles/' + planId + '/{z}/{x}/{y}.png';
            L.tileLayer(tileUrl, {
              crs: L.CRS.Simple,
              minZoom: -2,
              maxZoom: 4,
              maxNativeZoom: 3,
              tileSize: 256,
              noWrap: true,
              bounds: bounds,
              errorTileUrl: '',
            }).addTo(map);
          }

          // 2. Blueprint Architectural Canvas (Grid & Rooms)
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          
          ctx.fillStyle = '#0B0F19';
          ctx.fillRect(0, 0, width, height);

          // Grid Lines
          ctx.strokeStyle = '#1E293B';
          ctx.lineWidth = 1.5;
          for (let x = 0; x < width; x += 100) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
          }
          for (let y = 0; y < height; y += 100) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
          }

          // Structural Walls
          ctx.strokeStyle = '#38BDF8';
          ctx.lineWidth = 5;
          ctx.strokeRect(60, 60, width - 120, height - 120);

          // Rooms & Zones
          ctx.strokeStyle = '#334155';
          ctx.lineWidth = 2.5;
          ctx.strokeRect(120, 120, 450, 320);
          ctx.strokeRect(620, 120, 500, 320);
          ctx.strokeRect(1170, 120, 630, 320);
          ctx.strokeRect(120, 500, 750, 450);
          ctx.strokeRect(920, 500, 880, 450);

          ctx.fillStyle = '#64748B';
          ctx.font = 'bold 22px sans-serif';
          ctx.fillText('BIURO 101 (WEST)', 160, 180);
          ctx.fillText('BIURO 102 (CENTER)', 660, 180);
          ctx.fillText('SALA KONFERENCYJNA A', 1220, 180);
          ctx.fillText('OPEN SPACE MONTAŻ', 160, 560);
          ctx.fillText('GŁÓWNA ROZDZIELNICA ELEKTRYCZNA (RG)', 960, 560);

          if (!planId || planId === 'pln-sample-001') {
            L.imageOverlay(canvas.toDataURL(), bounds).addTo(map);
          }
          map.fitBounds(bounds);

          // Marker Storage for fast updates
          const taskMarkers = {};

          // Helper to send message to React Native
          function send(obj) {
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify(obj));
            }
          }

          // Map Click (Add Pin)
          map.on('click', function(e) {
            const x = e.latlng.lng;
            const y = height - e.latlng.lat;
            if (x >= 0 && x <= width && y >= 0 && y <= height) {
              send({ type: 'MAP_CLICK', x: x, y: y });
            }
          });

          // Render Tasks
          const tasksData = ${JSON.stringify(visibleTasks)};
          tasksData.forEach(function(t) {
            window.addTaskMarker(t);
          });

          window.addTaskMarker = function(t) {
            const lat = height - (t.pos_y || 400);
            const lng = t.pos_x || 400;
            const statusClass = 'pin-' + (t.status || 'open');

            const icon = L.divIcon({
              className: '',
              html: '<div class="custom-pin ' + statusClass + '" style="width: 28px; height: 28px;">📌<span class="pin-label">' + (t.title || 'Zadanie').substring(0, 15) + '</span></div>',
              iconSize: [28, 28],
              iconAnchor: [14, 14],
            });

            const marker = L.marker([lat, lng], { icon }).addTo(map);
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

          // Render BMA
          const bmaData = ${JSON.stringify(visibleBma)};
          bmaData.forEach(function(b) {
            const lat = height - (b.pos_y || 300);
            const lng = b.pos_x || 300;

            const icon = L.divIcon({
              className: '',
              html: '<div class="custom-pin pin-bma" style="width: 26px; height: 26px;">🚨<span class="pin-label">' + (b.device_number || 'BMA') + '</span></div>',
              iconSize: [26, 26],
              iconAnchor: [13, 13],
            });

            const marker = L.marker([lat, lng], { icon }).addTo(map);
            marker.on('click', function(e) {
              L.DomEvent.stopPropagation(e);
              send({ type: 'BMA_CLICK', id: b.id });
            });
          });

          // Render Circuits
          const circuitData = ${JSON.stringify(visibleCircuits)};
          circuitData.forEach(function(c) {
            const lat = height - (c.pos_y || 500);
            const lng = c.pos_x || 500;

            const icon = L.divIcon({
              className: '',
              html: '<div class="custom-pin pin-circuit" style="width: 26px; height: 26px;">⚡<span class="pin-label">' + (c.circuit_name || 'Obwód') + '</span></div>',
              iconSize: [26, 26],
              iconAnchor: [13, 13],
            });

            const marker = L.marker([lat, lng], { icon }).addTo(map);
            marker.on('click', function(e) {
              L.DomEvent.stopPropagation(e);
              send({ type: 'CIRCUIT_CLICK', id: c.id });
            });
          });

          // Render Cables & Trays
          const cableData = ${JSON.stringify(visibleCables)};
          cableData.forEach(function(c) {
            let pts = [];
            try {
              if (c.points_json) pts = JSON.parse(c.points_json);
            } catch(e) {}

            if (pts && pts.length >= 2) {
              const latlngs = pts.map(function(p) {
                return [height - p.y, p.x];
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
              <Text style={[styles.drawerTitle, { color: '#A855F7' }]}>⚡ Obwód: {selectedCircuit.circuit_name}</Text>
              <Text style={styles.drawerDesc}>Zabezpieczenie: {selectedCircuit.fuse_type || 'B16'}</Text>
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
            <Text style={styles.modalHeading}>📌 Nowy znacznik na rzucie 2D</Text>
            <Text style={styles.coordsText}>
              Współrzędne: X={newPinCoords?.x}, Y={newPinCoords?.y}
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Tytuł zadania / usterki..."
              placeholderTextColor="#64748B"
              value={newTaskTitle}
              onChangeText={setNewTaskTitle}
            />

            <TextInput
              style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
              placeholder="Opis zadania (opcjonalnie)..."
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
                onPress={createPinTask}
              >
                <Text style={styles.savePinBtnText}>Zapisz znacznik</Text>
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
    marginBottom: 14,
    fontWeight: '700',
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
