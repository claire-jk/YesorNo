import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { useColorScheme, View } from 'react-native';

// 注意：這裡匯入你原本寫在 index.tsx 的那個 App 組件邏輯
// 如果你的主要邏輯就在 index.tsx，我們可以直接讓 index.tsx 處理一切
import AppContent from './index';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const isDarkMode = colorScheme === 'dark';

  return (
    <ThemeProvider value={isDarkMode ? DarkTheme : DefaultTheme}>
      <View style={{ flex: 1 }}>
        {/* 直接渲染你的主邏輯，這會繞過 Expo Router 的自動分頁導航 */}
        <AppContent />
        <StatusBar style="auto" />
      </View>
    </ThemeProvider>
  );
}