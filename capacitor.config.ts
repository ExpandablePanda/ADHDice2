import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.andrewschaffer.adhdice',
  appName: 'ADHDice',
  webDir: 'out',
  ios: {
    scheme: 'ADHDice'
  }
};

export default config;
