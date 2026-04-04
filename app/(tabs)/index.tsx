import { useFonts, ZenKurenaido_400Regular } from '@expo-google-fonts/zen-kurenaido';
import { onAuthStateChanged } from 'firebase/auth';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { auth } from './firebaseConfig';
import Login from './Login';
import Register from './Register';
import TabNavigator from './TabNavigator';
// 匯入你新建立的 SplashScreen 組件
import AppSplashScreen from './SplashScreen';

export default function App() {
  const [fontsLoaded] = useFonts({
    ZenKurenaido: ZenKurenaido_400Regular,
  });

  const [user, setUser] = useState<any>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [currentAuthView, setCurrentAuthView] = useState<'login' | 'register'>('login');
  
  // 新增狀態：追蹤入場動畫是否已結束
  const [splashFinished, setSplashFinished] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (authenticatedUser) => {
      setUser(authenticatedUser);
      setLoadingUser(false);
    });
    return () => unsubscribe();
  }, []);

  // 1. 如果字體或 Firebase 還在跑，先顯示最基礎的 Loading (避免白屏)
  if (!fontsLoaded || loadingUser) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#8B5CF6' }}>
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  // 2. 如果初始化好了，但「動畫尚未結束」，就顯示 SplashScreen
  if (!splashFinished) {
    return (
      <AppSplashScreen 
        onAnimationFinished={() => setSplashFinished(true)} 
      />
    );
  }

  // 3. 動畫結束後，正式進入 App 邏輯
  return (
    <View style={{ flex: 1 }}>
      {user ? (
        /* 已登入：顯示 Tab 分頁 */
        <TabNavigator />
      ) : (
        /* 未登入：顯示登入或註冊 */
        <View style={{ flex: 1 }}>
          {currentAuthView === 'login' ? (
            <Login onNavigate={() => setCurrentAuthView('register')} />
          ) : (
            <Register onNavigate={() => setCurrentAuthView('login')} />
          )}
        </View>
      )}
    </View>
  );
}