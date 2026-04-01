import { useFonts, ZenKurenaido_400Regular } from '@expo-google-fonts/zen-kurenaido';
// 移除 NavigationContainer 的匯入
import { onAuthStateChanged } from 'firebase/auth';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { auth } from './firebaseConfig';
import Login from './Login';
import Register from './Register';
import TabNavigator from './TabNavigator';

export default function App() {
  const [fontsLoaded] = useFonts({
    ZenKurenaido: ZenKurenaido_400Regular,
  });

  const [user, setUser] = useState<any>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [currentAuthView, setCurrentAuthView] = useState<'login' | 'register'>('login');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (authenticatedUser) => {
      setUser(authenticatedUser);
      setLoadingUser(false);
    });
    return () => unsubscribe();
  }, []);

  if (!fontsLoaded || loadingUser) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF' }}>
        <ActivityIndicator size="large" color="#FF6F61" />
      </View>
    );
  }

  // 移除 <NavigationContainer>，直接渲染內容
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