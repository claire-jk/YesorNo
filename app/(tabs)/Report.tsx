import { useFonts, ZenKurenaido_400Regular } from '@expo-google-fonts/zen-kurenaido';
import { Ionicons } from '@expo/vector-icons';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { MotiView } from 'moti';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { BarChart, PieChart } from 'react-native-chart-kit';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// 動畫核心組件
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withTiming
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { auth, db } from './firebaseConfig';

const screenWidth = Dimensions.get('window').width;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export default function ReportScreen() {
  const [fontsLoaded] = useFonts({ ZenKurenaido: ZenKurenaido_400Regular });
  const insets = useSafeAreaInsets();
  const isDarkMode = useColorScheme() === 'dark';

  const [activeMode, setActiveMode] = useState<'personal' | 'family'>('personal');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reportData, setReportData] = useState<any>(null);

  // --- 扇形動畫參數 ---
  const RADIUS = 45; 
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const progress = useSharedValue(0); 

  const Colors = {
    bg: isDarkMode ? '#0A0A0F' : '#F8FAFC',
    card: isDarkMode ? '#18181F' : '#FFFFFF',
    text: isDarkMode ? '#F9FAFB' : '#0F172A',
    subText: isDarkMode ? '#A1A1AA' : '#64748B',
    primary: '#8B5CF6',
    accent: '#3B82F6',
    border: isDarkMode ? '#27272A' : '#E2E8F0',
  };

  // 修正：當 progress 從 0 變到 1，offset 從 0 變到 CIRCUMFERENCE
  // 這樣邊框（遮罩）才會「推走」並露出下方的圖表
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * progress.value,
  }));

  const fetchRealtimeReport = useCallback(async () => {
    if (!auth.currentUser) return;
    setLoading(true);
    progress.value = 0; // 重置動畫

    try {
      let targetId = auth.currentUser.uid;
      let idField = 'userId';

      if (activeMode === 'family') {
        const familyQ = query(collection(db, 'family_members'), where('userId', '==', auth.currentUser.uid));
        const familySnap = await getDocs(familyQ);
        if (!familySnap.empty) {
          targetId = familySnap.docs[0].data().familyId;
          idField = 'familyId';
        } else {
          setReportData(null);
          return;
        }
      }

      const productsQ = query(collection(db, 'products'), where(idField, '==', targetId));
      const categoriesQ = query(collection(db, 'categories'), where(idField, '==', targetId));

      const [prodSnap, catSnap] = await Promise.all([getDocs(productsQ), getDocs(categoriesQ)]);

      const catMap = new Map();
      catSnap.docs.forEach(d => catMap.set(d.id, d.data().name));

      let totalSpent = 0;
      let upcomingPreorder = 0;
      const categoryTotals: any = {};

      prodSnap.docs.forEach(doc => {
        const data = doc.data();
        const price = parseFloat(data.price || '0');
        const remain = parseFloat(data.remainingAmount || '0');
        const catName = catMap.get(data.categoryId) || '未分類';

        if (data.type === 'owned') {
          totalSpent += price;
          categoryTotals[catName] = (categoryTotals[catName] || 0) + price;
        } else {
          upcomingPreorder += remain;
        }
      });

      const pieData = Object.keys(categoryTotals).length > 0
        ? Object.keys(categoryTotals).map((name, index) => ({
            name,
            population: categoryTotals[name],
            color: ['#8B5CF6', '#3B82F6', '#EC4899', '#10B981', '#F59E0B'][index % 5],
            legendFontColor: Colors.text,
            legendFontSize: 12
          }))
        : [{ name: '暫無支出', population: 1, color: Colors.subText, legendFontColor: Colors.subText, legendFontSize: 12 }];

      setReportData({
        totalSpent,
        upcomingPreorder,
        categoryData: pieData,
        trendData: {
          labels: ['11月', '12月', '1月', '2月', '3月', '4月'],
          datasets: [{ data: [2000, 3500, 2800, 5000, 4200, totalSpent || 0] }]
        },
        aiPredicts: ['📉 本月支出趨勢平穩', '🛒 預購待付需注意現金流', `📊 ${Object.keys(categoryTotals)[0] || '尚無'} 為主要開銷`],
        alertMessage: `尚有 $${upcomingPreorder.toLocaleString()} 待付款`
      });

      // 觸發動畫
      setTimeout(() => {
        progress.value = withTiming(1, { 
          duration: 1500, 
          easing: Easing.bezier(0.4, 0, 0.2, 1) 
        });
      }, 400);

    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeMode]);

  useEffect(() => {
    fetchRealtimeReport();
  }, [fetchRealtimeReport]);

  if (!fontsLoaded || loading) {
    return (
      <View style={[styles.center, { backgroundColor: Colors.bg }]}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  const chartConfig = {
    backgroundGradientFrom: Colors.card,
    backgroundGradientTo: Colors.card,
    color: (opacity = 1) => `rgba(139, 92, 246, ${opacity})`,
    labelColor: () => Colors.subText,
    decimalPlaces: 0,
    propsForLabels: { fontFamily: 'ZenKurenaido' }
  };

  const chartWidth = screenWidth - 60;
  // 修正對齊：PieChart 在 paddingLeft="0" 時，中心點微偏右
  const centerX = chartWidth / 4 + 10; 
  const centerY = 100;

  return (
    <ScrollView
      style={{ backgroundColor: Colors.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchRealtimeReport} tintColor={Colors.primary} />}
    >
      {/* Header & Tabs */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: Colors.text }]}>消費分析</Text>
        <View style={[styles.tabBar, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
          {(['personal', 'family'] as const).map(mode => (
            <TouchableOpacity
              key={mode}
              onPress={() => setActiveMode(mode)}
              style={[styles.tab, activeMode === mode && { backgroundColor: Colors.primary }]}
            >
              <Text style={[styles.tabLabel, { color: activeMode === mode ? '#fff' : Colors.subText }]}>
                {mode === 'personal' ? '個人' : '家庭'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Summary Row */}
      <View style={styles.row}>
        <View style={[styles.card, styles.shadow, { backgroundColor: Colors.card }]}>
          <Text style={[styles.label, { color: Colors.subText }]}>本月支出</Text>
          <Text style={[styles.bigNumber, { color: Colors.text }]}>
            ${reportData?.totalSpent.toLocaleString()}
          </Text>
        </View>
        <View style={[styles.card, styles.shadow, { backgroundColor: Colors.card }]}>
          <Text style={[styles.label, { color: Colors.subText }]}>預購待付</Text>
          <Text style={[styles.bigNumber, { color: Colors.accent }]}>
            ${reportData?.upcomingPreorder.toLocaleString()}
          </Text>
        </View>
      </View>

      {/* Pie Chart Card */}
      <MotiView style={[styles.chartCard, styles.shadow, { backgroundColor: Colors.card, marginTop: 20 }]}>
        <Text style={[styles.sectionTitle, { color: Colors.text }]}>分類占比</Text>
        
        <View style={styles.pieWrapper}>
          <PieChart
            data={reportData?.categoryData ?? []}
            width={chartWidth}
            height={200}
            chartConfig={chartConfig}
            accessor="population"
            backgroundColor="transparent"
            paddingLeft="0"
            absolute
          />
          
          {/* 修正後的遮罩層 */}
          <View style={styles.svgOverlay} pointerEvents="none">
            <Svg height="200" width={chartWidth}>
              <AnimatedCircle
                cx={centerX}
                cy={centerY}
                r={RADIUS}
                stroke={Colors.card}
                strokeWidth={RADIUS * 2 + 20} // 稍微大一點點確保蓋乾淨
                fill="none"
                strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
                animatedProps={animatedProps}
                transform={`rotate(-90, ${centerX}, ${centerY})`}
              />
            </Svg>
          </View>
        </View>
      </MotiView>

      {/* Bar Chart */}
      <View style={[styles.chartCard, styles.shadow, { backgroundColor: Colors.card, marginTop: 20 }]}>
        <Text style={[styles.sectionTitle, { color: Colors.text }]}>支出趨勢</Text>
        <BarChart
          data={reportData?.trendData}
          width={chartWidth}
          height={220}
          chartConfig={chartConfig}
          fromZero
          showValuesOnTopOfBars
          style={{ borderRadius: 16, marginTop: 10 }}
        />
      </View>

      {/* AI Box */}
      <View style={[styles.aiBox, styles.shadow, { backgroundColor: Colors.card }]}>
        <View style={styles.aiHeader}>
          <Ionicons name="sparkles" size={18} color={Colors.primary} />
          <Text style={[styles.sectionTitle, { color: Colors.primary, marginLeft: 8, marginBottom: 0 }]}>AI 智能分析</Text>
        </View>
        <View style={{ marginTop: 15 }}>
          {reportData?.aiPredicts.map((item: string, i: number) => (
            <Text key={i} style={[styles.aiText, { color: Colors.text }]}>• {item}</Text>
          ))}
        </View>
        <Text style={[styles.alertText, { color: Colors.accent }]}>{reportData?.alertMessage}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { paddingHorizontal: 20, marginBottom: 25 },
  title: { fontSize: 34, fontFamily: 'ZenKurenaido', marginBottom: 15 },
  tabBar: { flexDirection: 'row', padding: 4, borderRadius: 20, borderWidth: 1, alignSelf: 'flex-start' },
  tab: { paddingHorizontal: 22, paddingVertical: 10, borderRadius: 16 },
  tabLabel: { fontFamily: 'ZenKurenaido', fontSize: 14 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20 },
  card: { width: '48%', padding: 22, borderRadius: 24 },
  shadow: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 },
  label: { fontSize: 13, fontFamily: 'ZenKurenaido' },
  bigNumber: { fontSize: 24, fontFamily: 'ZenKurenaido', marginTop: 6 },
  chartCard: { marginHorizontal: 20, padding: 20, borderRadius: 28 },
  sectionTitle: { fontSize: 18, fontFamily: 'ZenKurenaido', marginBottom: 15 },
  pieWrapper: {
    position: 'relative',
    height: 200,
    width: '100%',
    overflow: 'hidden',
  },
  svgOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: 'transparent',
  },
  aiBox: { margin: 20, padding: 20, borderRadius: 28, borderLeftWidth: 6, borderLeftColor: '#8B5CF6' },
  aiHeader: { flexDirection: 'row', alignItems: 'center' },
  aiText: { fontSize: 15, fontFamily: 'ZenKurenaido', marginBottom: 10 },
  alertText: { fontSize: 15, fontFamily: 'ZenKurenaido', marginTop: 15, fontWeight: 'bold' }
});