import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';
import { Platform, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// 導入各個頁面
import Family from './Family';
import Home from './Home';
import Report from './Report';
import Scan from './Scan';
import SelfList from './SelfList';

const Tab = createBottomTabNavigator();

export default function TabNavigator() {
  const colorScheme = useColorScheme();
  const isDarkMode = colorScheme === 'dark';
  const insets = useSafeAreaInsets();

  const activeColor = '#FF6F61';
  const inactiveColor = isDarkMode ? '#888' : '#AAA';

  /**
   * Android 深度高度補修：
   * 從截圖看，你的 Android 系統列大約佔了 48dp 左右。
   * 如果 insets.bottom <= 0，代表系統沒有給予安全區，我們必須手動「暴力」推高。
   */
  const isAndroid = Platform.OS === 'android';
  
  // 如果 Android 回傳 0，我們直接墊 35 像素；如果有回傳（手勢模式），我們多給 10 像素。
  const androidBottomPadding = insets.bottom > 0 ? insets.bottom + 10 : 35;
  
  // 總高度調整：Android 建議拉到 95 甚至 100，確保圖示不會被導航鍵遮到視覺重心
  const tabHeight = Platform.OS === 'ios' ? 65 + insets.bottom : 95;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: isDarkMode ? '#1E1E1E' : '#FFFFFF',
          borderTopWidth: 0,
          elevation: 25, 
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.2,
          shadowRadius: 5,
          height: tabHeight, 
          // 修正：針對 Android 進行垂直位移
          paddingBottom: isAndroid ? androidBottomPadding : insets.bottom,
          paddingTop: 10,
        },
        tabBarActiveTintColor: activeColor,
        tabBarInactiveTintColor: inactiveColor,
        tabBarLabelStyle: {
          fontFamily: 'ZenKurenaido',
          fontSize: 11, // 稍微縮小字體讓它更精緻
          fontWeight: 'bold',
          marginBottom: isAndroid ? 2 : 0, // 稍微讓字體往上提一點
        },
        tabBarIcon: ({ color, size, focused }) => {
          let iconName: any;
          if (route.name === '首頁') iconName = focused ? 'grid' : 'grid-outline';
          else if (route.name === '個人') iconName = focused ? 'person' : 'person-outline';
          else if (route.name === '掃描') iconName = focused ? 'barcode' : 'barcode-outline';
          else if (route.name === '家庭') iconName = focused ? 'people' : 'people-outline';
          else if (route.name === '報表') iconName = focused ? 'bar-chart' : 'bar-chart-outline';
          
          return <Ionicons name={iconName} size={size + 2} color={color} />;
        },
      })}
    >
      <Tab.Screen name="首頁" component={Home} />
      <Tab.Screen name="掃描" component={Scan} />
      <Tab.Screen name="個人" component={SelfList} />
      <Tab.Screen name="家庭" component={Family} />
      <Tab.Screen name="報表" component={Report} />
    </Tab.Navigator>
  );
}