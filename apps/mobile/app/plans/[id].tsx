import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { getDatabase } from '../../src/db/database';

interface PlanInfo {
  id: string;
  name: string;
  width: number;
  height: number;
  image_url?: string;
}

interface TaskPin {
  id: string;
  title: string;
  pos_x: number;
  pos_y: number;
  status: string;
}

interface BmaPin {
  id: string;
  device_number: string;
  device_type: string;
  pos_x: number;
  pos_y: number;
  status: string;
}

export default function PlanViewerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const webViewRef = useRef<WebView>(null);

  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [tasks, setTasks] = useState<TaskPin[]>([]);
  const [bmaDevices, setBmaDevices] = useState<BmaPin[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'tasks' | 'bma'>('all');

  const loadPlanData = useCallback(async () => {
    try {
      setLoading(true);
      const db = await getDatabase();

      const planRow = await db.getFirstAsync<PlanInfo>(
        'SELECT id, name, width, height, image_url FROM plans WHERE id = ?;',
        [id]
      );
      setPlan(planRow ?? { id: id || 'pln-sample-001', name: 'Rzut Kondygnacji', width: 1920, height: 1080 });

      const taskRows = await db.getAllAsync<TaskPin>(
        'SELECT id, title, pos_x, pos_y, status FROM tasks WHERE plan_id = ? AND deleted_at IS NULL;',
        [id]
      );
      setTasks(taskRows);

      const bmaRows = await db.getAllAsync<BmaPin>(
        'SELECT id, device_number, device_type, pos_x, pos_y, status FROM bma_devices WHERE plan_id = ? AND deleted_at IS NULL;',
        [id]
      );
      setBmaDevices(bmaRows);
    } catch (err) {
      console.error('[PlanViewer] Load error:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadPlanData();
  }, [loadPlanData]);

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'TASK_CLICK' && data.taskId) {
        router.push(`/tasks/${data.taskId}` as any);
      }
    } catch (e) {
      console.warn('[PlanViewer] Message parse error:', e);
    }
  };

  const generateLeafletHtml = () => {
    const width = plan?.width || 1920;
    const height = plan?.height || 1080;

    const visibleTasks = filter === 'bma' ? [] : tasks;
    const visibleBma = filter === 'tasks' ? [] : bmaDevices;

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
          }
          .custom-pin {
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            color: #ffffff;
            font-weight: bold;
            font-size: 11px;
            box-shadow: 0 0 10px rgba(0,0,0,0.6);
            border: 2px solid #ffffff;
            cursor: pointer;
          }
          .pin-open { background-color: #38BDF8; }
          .pin-in_progress { background-color: #EAB308; }
          .pin-closed { background-color: #22C55E; }
          .pin-bma { background-color: #EF4444; border-radius: 4px; }
          .leaflet-popup-content-wrapper {
            background-color: #0F172A;
            color: #F8FAFC;
            border: 1px solid #1E293B;
            border-radius: 8px;
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

          const map = L.map('map', {
            crs: L.CRS.Simple,
            minZoom: -2,
            maxZoom: 3,
            zoomSnap: 0.25,
            attributionControl: false,
          });

          const bounds = [[0, 0], [height, width]];
          const planId = "${plan?.id || id || ''}";
          
          // 1. Primary Layer: Real PDF raster tiles from web backend
          if (planId && planId !== 'pln-sample-001') {
            const tileUrl = 'https://inspecthero.pl/api/tiles/' + planId + '/{z}/{x}/{y}.png';
            const realTiles = L.tileLayer(tileUrl, {
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

          // 2. Blueprint / Demo fallback canvas if offline or sample plan
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          
          ctx.fillStyle = '#0B0F19';
          ctx.fillRect(0, 0, width, height);

          // Grid lines
          ctx.strokeStyle = '#1E293B';
          ctx.lineWidth = 2;
          for (let x = 0; x < width; x += 100) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
          }
          for (let y = 0; y < height; y += 100) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
          }

          // Building blueprint borders
          ctx.strokeStyle = '#38BDF8';
          ctx.lineWidth = 6;
          ctx.strokeRect(80, 80, width - 160, height - 160);
          
          // Rooms
          ctx.strokeStyle = '#334155';
          ctx.lineWidth = 3;
          ctx.strokeRect(150, 150, 500, 350);
          ctx.strokeRect(700, 150, 500, 350);
          ctx.strokeRect(1250, 150, 550, 350);
          ctx.strokeRect(150, 550, 800, 400);
          ctx.strokeRect(1000, 550, 800, 400);

          ctx.fillStyle = '#64748B';
          ctx.font = '24px sans-serif';
          ctx.fillText('BIURO 101', 200, 200);
          ctx.fillText('BIURO 102', 750, 200);
          ctx.fillText('SALA KONFERENCYJNA', 1300, 200);
          ctx.fillText('OPEN SPACE WSCHÓD', 200, 600);
          ctx.fillText('SERWEROWNIA / ROZDZIELNICA RG', 1050, 600);

          if (!planId || planId === 'pln-sample-001') {
            const overlay = L.imageOverlay(canvas.toDataURL(), bounds).addTo(map);
          }
          map.fitBounds(bounds);

          // Render Tasks
          const tasks = ${JSON.stringify(visibleTasks)};
          tasks.forEach((t) => {
            const lat = height - (t.pos_y || 400);
            const lng = t.pos_x || 400;
            const statusClass = 'pin-' + (t.status || 'open');
            
            const icon = L.divIcon({
              className: '',
              html: '<div class="custom-pin ' + statusClass + '" style="width: 28px; height: 28px;">📌</div>',
              iconSize: [28, 28],
              iconAnchor: [14, 14],
            });

            const marker = L.marker([lat, lng], { icon }).addTo(map);
            marker.on('click', () => {
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'TASK_CLICK',
                  taskId: t.id
                }));
              }
            });
            marker.bindPopup('<b>' + t.title + '</b><br>Status: ' + t.status);
          });

          // Render BMA
          const bma = ${JSON.stringify(visibleBma)};
          bma.forEach((b) => {
            const lat = height - (b.pos_y || 300);
            const lng = b.pos_x || 300;
            
            const icon = L.divIcon({
              className: '',
              html: '<div class="custom-pin pin-bma" style="width: 26px; height: 26px;">🚨</div>',
              iconSize: [26, 26],
              iconAnchor: [13, 13],
            });

            const marker = L.marker([lat, lng], { icon }).addTo(map);
            marker.bindPopup('<b>BMA: ' + b.device_number + '</b><br>' + b.device_type);
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
          title: plan?.name || 'Rzut Kondygnacji (Leaflet)',
          headerShown: true,
          headerBackTitle: 'Wstecz',
          headerStyle: { backgroundColor: '#0B0F19' },
          headerTintColor: '#38BDF8',
          headerTitleStyle: { color: '#F8FAFC', fontWeight: '700' },
        }}
      />

      {/* Filter Chips */}
      <View style={styles.filterBar}>
        <TouchableOpacity
          style={[styles.chip, filter === 'all' && styles.chipActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.chipText, filter === 'all' && styles.chipTextActive]}>
            Wszystko ({tasks.length + bmaDevices.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.chip, filter === 'tasks' && styles.chipActive]}
          onPress={() => setFilter('tasks')}
        >
          <Text style={[styles.chipText, filter === 'tasks' && styles.chipTextActive]}>
            📌 Zadania ({tasks.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.chip, filter === 'bma' && styles.chipActive]}
          onPress={() => setFilter('bma')}
        >
          <Text style={[styles.chipText, filter === 'bma' && styles.chipTextActive]}>
            🚨 BMA ({bmaDevices.length})
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#38BDF8" />
          <Text style={styles.loadingText}>Ładowanie rzutu kondygnacji i markerów Leaflet...</Text>
        </View>
      ) : (
        <WebView
          ref={webViewRef}
          originWhitelist={['*']}
          source={{ html: generateLeafletHtml() }}
          style={styles.webView}
          onMessage={handleMessage}
          javaScriptEnabled={true}
          domStorageEnabled={true}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#030712',
  },
  filterBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#0B0F19',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  chip: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  chipActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },
  chipTextActive: {
    color: '#38BDF8',
    fontWeight: '700',
  },
  webView: {
    flex: 1,
    backgroundColor: '#030712',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    color: '#94A3B8',
    fontSize: 14,
    marginTop: 12,
  },
});
