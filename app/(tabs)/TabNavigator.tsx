import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import React from 'react';
import { Platform, useColorScheme, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// pages
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

  const isAndroid = Platform.OS === 'android';

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,

        /**
         * ✨ 核心：讓 TabBar 浮起來
         */
        tabBarStyle: {
          position: 'absolute',
          left: 20,
          right: 20,
          bottom: isAndroid ? 20 : insets.bottom + 10,
          borderRadius: 25,

          height: 70,
          paddingBottom: 8,
          paddingTop: 8,

          borderTopWidth: 0,
          backgroundColor: 'transparent',
          elevation: 0,
        },

        /**
         * ✨ 背景：毛玻璃 + 半透明
         */
        tabBarBackground: () => (
          <BlurView
            intensity={80}
            tint={isDarkMode ? 'dark' : 'light'}
            style={{
              flex: 1,
              borderRadius: 25,
              overflow: 'hidden',
              backgroundColor: isDarkMode
                ? 'rgba(30,30,30,0.6)'
                : 'rgba(255,255,255,0.6)',
            }}
          />
        ),

        tabBarActiveTintColor: activeColor,
        tabBarInactiveTintColor: inactiveColor,

        tabBarLabelStyle: {
          fontFamily: 'ZenKurenaido',
          fontSize: 11,
          fontWeight: 'bold',
        },

        /**
         * ✨ icon 動畫感（focus 放大）
         */
        tabBarIcon: ({ color, size, focused }) => {
          let iconName: any;

          if (route.name === '首頁') iconName = focused ? 'grid' : 'grid-outline';
          else if (route.name === '個人') iconName = focused ? 'person' : 'person-outline';
          else if (route.name === '掃描') iconName = focused ? 'barcode' : 'barcode-outline';
          else if (route.name === '家庭') iconName = focused ? 'people' : 'people-outline';
          else if (route.name === '報表') iconName = focused ? 'bar-chart' : 'bar-chart-outline';

          return (
            <View
              style={{
                transform: [{ scale: focused ? 1.2 : 1 }],
              }}
            >
              <Ionicons name={iconName} size={22} color={color} />
            </View>
          );
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