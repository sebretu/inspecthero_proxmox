import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.taskmanager.building',
  appName: 'Task Manager',
  webDir: 'out',

  // Server configuration for development
  server: {
    // Allow clear text (HTTP) for local development
    androidScheme: 'https',
    iosScheme: 'https',
    hostname: 'app.taskmanager.com'
  },

  // Plugin configuration
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    // Camera configuration
    Camera: {
      // Request camera and photo library permissions on iOS
      iosPresentationStyle: 'fullscreen',
    },

    // Push Notifications configuration
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },

    // Splash screen configuration
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#667eea',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
  },

  // Android specific configuration
  android: {
    allowMixedContent: true, // Allow HTTP requests (for development)
    captureInput: true,
    webContentsDebuggingEnabled: true, // Enable debugging
  },

  // iOS specific configuration  
  ios: {
    contentInset: 'automatic',
    scrollEnabled: true,
  },
};

export default config;

