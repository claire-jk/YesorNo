import { useFonts, ZenKurenaido_400Regular } from '@expo-google-fonts/zen-kurenaido';
import { Ionicons } from '@expo/vector-icons';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
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

// ✨ 引入 OpenAI 套件直接在前端驅動 Grok AI
import { OpenAI } from 'openai';

// 🔒 安全讀取環境變數，不上傳 GitHub
const GROK_KEY = process.env.EXPO_PUBLIC_GROK_API_KEY || '';

if (__DEV__) {
  console.log('======= AI Key 檢查 =======');
  console.log('Key 是否存在:', GROK_KEY ? '🟢 有抓到' : '🔴 沒抓到，目前是空的');
  console.log('============================');
}

// 初始化 Groq 客戶端（使用 OpenAI SDK 兼容模式）
const grok = new OpenAI({
  apiKey: GROK_KEY || 'dummy-key-for-init-fallback', 
  baseURL: 'https://api.groq.com/openai/v1', 
  dangerouslyAllowBrowser: true, 
});

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
  
  // 儲存從前端直接算出來的精準消耗品補貨預測清單
  const [aiPredictions, setAiPredictions] = useState<any[]>([]);

  // --- 扇形動畫參數 ---
  const RADIUS = 45; 
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const progress = useSharedValue(0); 

  const Colors = {
    bg: isDarkMode ? '#0A0A0F' : '#F8FAFC',
    card: isDarkMode ? '#1C1C23' : '#FFFFFF', 
    text: isDarkMode ? '#F9FAFB' : '#0F172A',
    subText: isDarkMode ? '#A1A1AA' : '#64748B',
    primary: '#7C69EF', 
    accent: '#3B82F6',
    border: isDarkMode ? '#27272A' : '#E2E8F0',
    warning: '#F59E0B', 
    success: '#10B981', 
  };

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * progress.value,
  }));

  const fetchRealtimeReport = useCallback(async () => {
    if (!auth.currentUser) return;
    setLoading(true);
    progress.value = 0; 

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
          setLoading(false);
          return;
        }
      }

      // 📊 1. 本地基礎數據查詢與加總
      const productsQ = query(collection(db, 'products'), where(idField, '==', targetId));
      const categoriesQ = query(collection(db, 'categories'), where(idField, '==', targetId));
      
      // ✨ 限制只拿 15 筆最新消耗歷史紀錄，避免 tokens 爆掉
      const historyQ = query(
        collection(db, 'usage_history'),
        where(idField, '==', targetId),
        orderBy('timestamp', 'desc'),
        limit(15)
      );
      
      const [prodSnap, catSnap, historySnap] = await Promise.all([
        getDocs(productsQ), 
        getDocs(categoriesQ),
        getDocs(historyQ).catch(() => ({ docs: [] }))
      ]);

      // 🎯 【結構修正】：讓 catMap 同時保存分類名稱與是否為消耗品的布林判定
      const catMap = new Map<string, { name: string; isConsumable: boolean }>();
      catSnap.docs.forEach(d => {
        const catData = d.data();
        catMap.set(d.id, {
          name: catData.name || '未分類',
          isConsumable: catData.isConsumable === true
        });
      });

      let totalSpent = 0;
      let upcomingPreorder = 0;
      const categoryTotals: any = {};

      // 🛒 【數據過濾與瘦身】只打包「分類標記為消耗型」且「使用者已擁有」的商品給 AI
      const aiProductsPayload: any[] = [];

      prodSnap.docs.forEach(doc => {
        const data = doc.data();
        const price = parseFloat(data.price || '0');
        const remain = parseFloat(data.remainingAmount || '0');
        
        // 🎯 獲取分類關聯資料
        const catObj = catMap.get(data.categoryId);
        const catName = catObj ? catObj.name : '未分類';
        const isCatConsumable = catObj ? catObj.isConsumable : false;

        // 1. 先進行基礎財務計算
        if (data.type === 'owned') {
          totalSpent += price;
          categoryTotals[catName] = (categoryTotals[catName] || 0) + price;
        } else {
          upcomingPreorder += remain;
        }

        // 🟢 精準過濾條件：必須是已擁有物件，且該分類在新增時被勾選為消耗品
        const isConsumableType = data.type === 'owned' && isCatConsumable;

        if (isConsumableType) {
          aiProductsPayload.push({
            id: doc.id,
            name: data.name || '未命名',
            remain: remain, // 剩餘存量
            price: price,
            cat: catName
          });
        }
      });

      // 📉 【數據瘦身優化】消耗歷史紀錄瘦身
      const aiHistoryPayload = historySnap.docs.map(doc => {
        const hData = doc.data();
        let formattedDate = '未知';
        if (hData.timestamp && typeof hData.timestamp.toDate === 'function') {
          formattedDate = hData.timestamp.toDate().toISOString().split('T')[0];
        }
        return {
          pId: hData.productId || 'unknown',
          num: hData.consumedAmount || 0,
          date: formattedDate
        };
      });

      const pieData = Object.keys(categoryTotals).length > 0
        ? Object.keys(categoryTotals).map((name, index) => ({
            name,
            population: categoryTotals[name],
            color: ['#7C69EF', '#A78BFA', '#3B82F6', '#EC4899', '#10B981'][index % 5],
            legendFontColor: Colors.text,
            legendFontSize: 12
          }))
        : [{ name: '暫無支出', population: 1, color: Colors.subText, legendFontColor: Colors.subText, legendFontSize: 12 }];

      // 如果過濾完發現完全沒有消耗型物資，直接阻斷不發送請求
      if (aiProductsPayload.length === 0) {
        setAiPredictions([]);
        setReportData({
          totalSpent, upcomingPreorder, categoryData: pieData,
          trendData: { labels: ['11月', '12月', '1月', '2月', '3月', '4月'], datasets: [{ data: [2000, 3500, 2800, 5000, 4200, totalSpent || 0] }] },
          aiPredicts: ["目前庫存中沒有偵測到消耗型物資數據可供智慧補貨預測。"], alertMessage: "暫無付款提示"
        });
        setLoading(false);
        return;
      }

      // 🔮 2. ✨【調用 AI 進行預測分析】
      try {
        if (!GROK_KEY) {
          throw new Error("Missing GROK API KEY in environment variables.");
        }

        const systemPrompt = `你是一個高智能的居家生活消耗品規劃師。
你的任務是分析提供的使用者日用消耗品庫存(aiProductsPayload)與歷史消耗紀錄(aiHistoryPayload)，計算出即將耗盡的項目、推算預計用完日期(格式MM/DD)與購買建議。
必須以純 JSON 格式回覆，絕對不可包含任何 markdown \`\`\` 標記。

回覆格式規定：
{
  "predictions": [
    { "id": "商品id", "name": "商品名稱", "type": "count", "statusText": "⏳ 即將用盡", "predictDate": "MM/DD", "suggestAmount": 2 }
  ],
  "insights": [
    "📉 本月消耗品支出比上月平穩",
    "🛒 有部分生活常備品即將用盡，建議提早補貨"
  ],
  "alertMessage": "物資消耗速度正常"
}`;

        const userPrompt = `消耗型商品數據:\n${JSON.stringify(aiProductsPayload)}\n\n歷史紀錄:\n${JSON.stringify(aiHistoryPayload)}`;

        // 發送給 Groq
        const completion = await grok.chat.completions.create({
          model: 'llama-3.3-70b-versatile', 
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.2,
          response_format: { type: "json_object" },
          max_completion_tokens: 1024 
        });

        const grokData = JSON.parse(completion.choices[0].message.content || '{}');

        setAiPredictions(grokData.predictions || []);

        setReportData({
          totalSpent,
          upcomingPreorder,
          categoryData: pieData,
          trendData: {
            labels: ['11月', '12月', '1月', '2月', '3月', '4月'],
            datasets: [{ data: [2000, 3500, 2800, 5000, 4200, totalSpent || 0] }]
          },
          aiPredicts: grokData.insights || ['📉 數據分析中...'],
          alertMessage: grokData.alertMessage || `尚有 $${upcomingPreorder.toLocaleString()} 待付款`
        });

      } catch (aiError) {
        console.error("Grok AI 前端直接串接中斷，啟動本地防死當降級方案:", aiError);
        setAiPredictions([]);
        setReportData({
          totalSpent,
          upcomingPreorder,
          categoryData: pieData,
          trendData: { labels: ['11月', '12月', '1月', '2月', '3月', '4月'], datasets: [{ data: [2000, 3500, 2800, 5000, 4200, totalSpent || 0] }] },
          aiPredicts: ['⚠️ 無法取得 Groq 即時智慧診斷', '🛒 請檢查本地環境變數或資料庫連接狀態。'],
          alertMessage: `尚有 $${upcomingPreorder.toLocaleString()} 待付款`
        });
      }

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
  }, [activeMode, Colors.text, Colors.subText]);

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
    color: (opacity = 1) => `rgba(124, 105, 239, ${opacity})`, 
    labelColor: () => Colors.subText,
    decimalPlaces: 0,
    propsForLabels: { fontFamily: 'ZenKurenaido' }
  };

  const chartWidth = screenWidth - 60;
  const centerX = chartWidth / 4 + 10; 
  const centerY = 100;

  return (
    <ScrollView
      style={{ backgroundColor: Colors.bg }}
      contentContainerStyle={{ 
        paddingTop: insets.top + 20, 
        paddingBottom: 120 
      }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchRealtimeReport} tintColor={Colors.primary} />}
    >
      {/* Header & Tabs */}
      <MotiView from={{ opacity: 0, translateY: -10 }} animate={{ opacity: 1, translateY: 0 }} style={styles.header}>
        <Text style={[styles.title, { color: Colors.text }]}>消費分析</Text>
        <View style={[styles.tabContainer, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
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
      </MotiView>

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
          <Text style={[styles.bigNumber, { color: Colors.primary }]}>
            ${reportData?.upcomingPreorder.toLocaleString()}
          </Text>
        </View>
      </View>

      {/* Pie Chart Card */}
      <MotiView 
        from={{ opacity: 0, scale: 0.95 }} 
        animate={{ opacity: 1, scale: 1 }}
        style={[styles.chartCard, styles.shadow, { backgroundColor: Colors.card, marginTop: 20 }]}
      >
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
          
          <View style={styles.svgOverlay} pointerEvents="none">
            <Svg height="200" width={chartWidth}>
              <AnimatedCircle
                cx={centerX}
                cy={centerY}
                r={RADIUS}
                stroke={Colors.card}
                strokeWidth={RADIUS * 2 + 20}
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

      {/* 🔮 Grok AI 智慧預測與補貨分析面板 */}
      <MotiView
        from={{ opacity: 0, translateY: 15 }}
        animate={{ opacity: 1, translateY: 0 }}
        style={[styles.aiBox, styles.shadow, { backgroundColor: Colors.card, borderLeftColor: Colors.primary }]}
      >
        <View style={styles.aiHeader}>
          <Ionicons name="sparkles" size={18} color={Colors.primary} />
          <Text style={[styles.sectionTitle, { color: Colors.primary, marginLeft: 8, marginBottom: 0 }]}>Grok AI 智慧預測分析</Text>
        </View>

        {/* 🚀 區塊一：日用消耗品庫存水位與補貨預知 */}
        <View style={{ marginTop: 18, marginBottom: 15 }}>
          <Text style={[styles.predictSubTitle, { color: Colors.subText }]}>🔋 日常消耗品存量監控</Text>
          
          {aiPredictions.length === 0 ? (
            <View style={[styles.predictRowEmpty, { backgroundColor: Colors.bg }]}>
              <Text style={{ color: Colors.success, fontFamily: 'ZenKurenaido', fontSize: 14 }}>
                ✨ 讚！目前所有居家消耗品皆處於安全水位。
              </Text>
            </View>
          ) : (
            aiPredictions.map((item, idx) => (
              <View key={item.id || idx} style={[styles.predictItemCard, { backgroundColor: Colors.bg, borderColor: Colors.border }]}>
                <View style={styles.predictItemMain}>
                  <Text style={[styles.predictItemName, { color: Colors.text }]}>{item.name}</Text>
                  <Text style={[styles.predictItemBadge, { color: item.type === 'liquid' ? '#EF4444' : Colors.warning }]}>
                    {item.statusText}
                  </Text>
                </View>
                
                <View style={styles.predictDetails}>
                  <View style={styles.detailBlock}>
                    <Text style={[styles.detailLabel, { color: Colors.subText }]}>預計用完日期</Text>
                    <Text style={[styles.detailValue, { color: '#EF4444' }]}>{item.predictDate}</Text>
                  </View>
                  
                  <View style={styles.detailBlockRight}>
                    <Text style={[styles.detailLabel, { color: Colors.subText }]}>建議購買量</Text>
                    <Text style={[styles.detailValue, { color: Colors.primary }]}>+ {item.suggestAmount} 單位</Text>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>

        {/* 🚀 區塊二：消費診斷數據清單 */}
        <View style={{ paddingTop: 15, borderTopWidth: 1, borderTopColor: Colors.border }}>
          <Text style={[styles.predictSubTitle, { color: Colors.subText, marginBottom: 8 }]}>📊 財務理財與消費健檢</Text>
          <View>
            {reportData?.aiPredicts.map((item: string, i: number) => (
              <Text key={i} style={[styles.aiText, { color: Colors.text }]}>• {item}</Text>
            ))}
          </View>
          <Text style={[styles.alertText, { color: Colors.accent }]}>{reportData?.alertMessage}</Text>
        </View>
      </MotiView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { paddingHorizontal: 25, marginBottom: 25 },
  title: { fontSize: 34, fontFamily: 'ZenKurenaido', marginBottom: 15 },
  tabContainer: { flexDirection: 'row', padding: 4, borderRadius: 20, borderWidth: 1, alignSelf: 'flex-start' },
  tab: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 16 },
  tabLabel: { fontFamily: 'ZenKurenaido', fontSize: 15 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20 },
  card: { width: '48%', padding: 22, borderRadius: 28 },
  shadow: { 
    shadowColor: '#000', 
    shadowOpacity: 0.08, 
    shadowRadius: 15, 
    elevation: 4,
    shadowOffset: { width: 0, height: 4 }
  },
  label: { fontSize: 13, fontFamily: 'ZenKurenaido' },
  bigNumber: { fontSize: 24, fontFamily: 'ZenKurenaido', marginTop: 6 },
  chartCard: { marginHorizontal: 20, padding: 22, borderRadius: 32 },
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
  aiBox: { margin: 20, padding: 22, borderRadius: 32, borderLeftWidth: 6 },
  aiHeader: { flexDirection: 'row', alignItems: 'center' },
  aiText: { fontSize: 15, fontFamily: 'ZenKurenaido', marginBottom: 10, lineHeight: 22 },
  alertText: { fontSize: 15, fontFamily: 'ZenKurenaido', marginTop: 15 },
  
  predictSubTitle: { fontSize: 12,letterSpacing: 0.4, marginBottom: 10, fontFamily: 'ZenKurenaido' },
  predictRowEmpty: { padding: 14, borderRadius: 16, alignItems: 'center', marginTop: 5 },
  predictItemCard: { padding: 14, borderRadius: 20, marginBottom: 10, borderWidth: 1 },
  predictItemMain: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  predictItemName: { fontSize: 16,  fontFamily: 'ZenKurenaido' },
  predictItemBadge: { fontSize: 12,fontFamily: 'ZenKurenaido' },
  predictDetails: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.03)', paddingTop: 8 },
  detailBlock: { flex: 1 },
  detailBlockRight: { flex: 1, alignItems: 'flex-end' },
  detailLabel: { fontSize: 11, fontFamily: 'ZenKurenaido', marginBottom: 2 },
  detailValue: { fontSize: 14, fontFamily: 'ZenKurenaido' },
});