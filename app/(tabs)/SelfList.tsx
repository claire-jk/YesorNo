// 個人清單頁面 - 現代美化版 (含自定義圓角提示框與強化按鈕)
import { useFonts, ZenKurenaido_400Regular } from '@expo-google-fonts/zen-kurenaido';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { auth, db } from './firebaseConfig';

const { width, height } = Dimensions.get('window');
const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月', '未定'];

// --- 型別定義 ---
interface Category {
  id: string;
  name: string;
  isConsumable: boolean;
  userId: string;
  lastAutoAddedAt?: number;
}

interface Product {
  id: string;
  categoryId: string;
  name: string;
  price?: string;
  image?: string;
  stock?: number;
  consumableType?: 'count' | 'liquid'; // 庫存型 / 液態型
  liquidStatus?: 'enough' | 'low';     // 液態狀態
  safeStock?: number;                 // 安全庫存量
  arrivalMonth?: string;
  totalPrice?: string;
  paidAmount?: string;
  remainingAmount?: string;
  url?: string;
  type: 'owned' | 'preorder';
  lastAutoAddedAt?: number;
}

// --- 進階微動畫封裝組件 ---
const ScalePressable = ({ children, onPress, style, onLongPress, disabled }: any) => {
  const scaleValue = useRef(new Animated.Value(1)).current;
  const onPressIn = () => {
    if (disabled) return;
    Animated.spring(scaleValue, { toValue: 0.95, useNativeDriver: true, tension: 100, friction: 10 }).start();
  };
  const onPressOut = () => {
    Animated.spring(scaleValue, { toValue: 1, useNativeDriver: true, tension: 100, friction: 10 }).start();
  };
  return (
    <Animated.View style={[{ transform: [{ scale: scaleValue }] }, style]}>
      <Pressable onPressIn={onPressIn} onPressOut={onPressOut} onPress={onPress} onLongPress={onLongPress} disabled={disabled}>
        {children}
      </Pressable>
    </Animated.View>
  );
};

//庫存量
const isLowStock = (item: Product) => {
  if (item.consumableType === 'count') {
    return (item.stock || 0) <= (item.safeStock || 0);
  }
  if (item.consumableType === 'liquid') {
    return item.liquidStatus === 'low';
  }
  return false;
};

const FadeInView = ({ children, delay = 0, style }: any) => {
  const anim = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(20)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(anim, { toValue: 1, duration: 600, delay, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 600, delay, useNativeDriver: true }),
    ]).start();
  }, [delay]);
  return <Animated.View style={[{ opacity: anim, transform: [{ translateY: slide }] }, style]}>{children}</Animated.View>;
};

export default function SelfList() {
  let [fontsLoaded] = useFonts({ ZenKurenaido: ZenKurenaido_400Regular });
  const insets = useSafeAreaInsets();
  const isDarkMode = useColorScheme() === 'dark';
const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
const [products, setProducts] = useState<Product[]>([]);
const consumables = selectedCategory?.isConsumable
  ? products.filter((item: Product) =>
      item.consumableType === 'count' ||
      item.consumableType === 'liquid'
    )
  : [];
useEffect(() => {
  const checkStock = async () => {
    const user = auth.currentUser;
    if (!user) return;

    for (const item of consumables) {
      const isLow =
        item.consumableType === 'count'
          ? (item.stock || 0) <= (item.safeStock || 0)
          : item.liquidStatus === 'low';

      if (isLow && !item.lastAutoAddedAt) {
        try {
          // 加入 Home wishlist
          await setDoc(doc(db, 'wishlist', item.id),  {
            name: item.name,
            userId: user.uid,
            createdAt: serverTimestamp(),
            category: 'shopping',
            sourceProductId: item.id
          });

          // 標記避免重複加入
          await updateDoc(doc(db, 'products', item.id), {
            lastAutoAddedAt: Date.now()
          });

        } catch (e) {
          console.log('Auto add error:', e);
        }
      }
    }
  };

  if (consumables.length > 0) {
    checkStock();
  }
}, [consumables]);

  // 狀態管理
  const [viewLevel, setViewLevel] = useState<'main' | 'detail'>('main');
  const [activeTab, setActiveTab] = useState<'owned' | 'preorder'>('owned');
  //const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [displayMode, setDisplayMode] = useState<'grid' | 'list'>('grid');
  const [categories, setCategories] = useState<Category[]>([]);
  //const [products, setProducts] = useState<Product[]>([]);
  
  // Modal 狀態
  const [catModalVisible, setCatModalVisible] = useState(false);
  const [prodModalVisible, setProdModalVisible] = useState(false);
  
  // 自定義提示框狀態 (取代 Alert)
  const [customAlert, setCustomAlert] = useState<{show: boolean, title: string, msg: string, onConfirm?: () => void}>({show: false, title: '', msg: ''});

  const [isEditing, setIsEditing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newCatName, setNewCatName] = useState('');
  const [isConsumable, setIsConsumable] = useState(false);
  const [productForm, setProductForm] = useState<Partial<Product>>({ arrivalMonth: '1月', url: '' });
  const [selectedImg, setSelectedImg] = useState<string | null>(null);

  // 動態數值
  const scrollX = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const fabScale = useRef(new Animated.Value(1)).current;

  //移動商品類別
  const [moveModalVisible, setMoveModalVisible] = useState(false);
  const [movingItem, setMovingItem] = useState<Product | null>(null);

  const TAB_BAR_OFFSET = Platform.OS === 'android' ? 110 : insets.bottom + 95;
  const CLOUD_NAME = "dfbzt23lp"; 
  const UPLOAD_PRESET = "YesorNoself"; 

  const Colors = {
    bg: isDarkMode ? '#0F172A' : '#F8FAFC',
    card: isDarkMode ? '#1E293B' : '#FFFFFF',
    text: isDarkMode ? '#F1F5F9' : '#1E293B',
    subText: isDarkMode ? '#94A3B8' : '#64748B',
    primary: '#FF6F61', 
    accent: '#10B981',
    inputBg: isDarkMode ? '#334155' : '#F1F5F9',
    border: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
    overlay: 'rgba(15, 23, 42, 0.8)',
  };

  useEffect(() => {
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, [viewLevel]);

  useEffect(() => {
    if (!auth.currentUser) return;
    const q = query(collection(db, 'categories'), where('userId', '==', auth.currentUser.uid));
    return onSnapshot(q, (snap) => {
      setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() } as Category)));
    });
  }, []);

  useEffect(() => {
    if (!selectedCategory) return;
    const q = query(
      collection(db, 'products'),
      where('categoryId', '==', selectedCategory.id),
      where('type', '==', activeTab)
    );
    return onSnapshot(q, (snap) => {
      let data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Product));
      if (activeTab === 'preorder') {
        data.sort((a, b) => MONTHS.indexOf(a.arrivalMonth!) - MONTHS.indexOf(b.arrivalMonth!));
      }
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setProducts(data);
    });
  }, [selectedCategory, activeTab]);

  // --- 自定義提示工具 ---
  const showAlert = (title: string, msg: string, onConfirm?: () => void) => {
    setCustomAlert({ show: true, title, msg, onConfirm });
  };

  const handleSwitchTab = (tab: 'owned' | 'preorder') => {
    setActiveTab(tab);
    Animated.spring(scrollX, {
      toValue: tab === 'owned' ? 0 : (width - 60) / 2,
      useNativeDriver: true,
      friction: 8,
      tension: 40,
    }).start();
  };

  const handleOpenLink = (url?: string) => {
    if (!url) { showAlert("提示", "尚未設定購買連結唷！"); return; }
    const targetUrl = url.startsWith('http') ? url : `https://${url}`;
    Linking.openURL(targetUrl).catch(() => showAlert("錯誤", "無法開啟此連結"));
  };

  const handleCompletePreorder = (item: Product) => {
    showAlert(
      "確認收貨", 
      `要把「${item.name}」移至已獲得清單嗎？`,
      async () => {
        try {
          const productRef = doc(db, 'products', item.id);
          await updateDoc(productRef, {
            type: 'owned',
            price: item.totalPrice || '0',
            updatedAt: serverTimestamp()
          });
        } catch (error) {
          showAlert("操作失敗", "請稍後再試");
        }
      }
    );
  };

  const pickImage = async () => {
    console.log("點擊觸發成功");
    try {
      // 1. 先主動請求權限
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (status !== 'granted') {
        showAlert("權限提示", "需要相簿權限才能選取圖片唷！請前往系統設定開啟。");
        return;
      }

      // 2. 執行選取
      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images, // 或是 ['images'] 視版本而定
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
      });
      
      console.log("ImagePicker Result:", result); // Debug 用

      if (!result.canceled && result.assets && result.assets.length > 0) { 
        const uri = result.assets[0].uri;
        setSelectedImg(uri); 
      }
    } catch (error) {
      console.error("開啟圖庫錯誤:", error);
      showAlert("錯誤", "無法開啟相簿，請重試或重啟 App");
    }
  };

  const uploadToCloudinary = async (uri: string) => {
    if (!uri || uri.startsWith('http')) return uri;

    const data = new FormData();
    
    // 針對不同平台的路徑處理
    const fileUri = Platform.OS === 'ios' ? uri.replace('file://', '') : uri;
    
    // 取得副檔名，若無則預設 jpg
    const fileName = uri.split('/').pop() || 'upload.jpg';
    const match = /\.(\w+)$/.exec(fileName);
    const type = match ? `image/${match[1]}` : `image/jpeg`;

    data.append('file', {
      uri: fileUri,
      type: type,
      name: fileName,
    } as any);
    
    data.append('upload_preset', UPLOAD_PRESET);

    try {
      const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
        method: 'POST',
        body: data,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'multipart/form-data',
        },
      });

      const result = await response.json();

      if (response.ok && result.secure_url) {
        return result.secure_url;
      } else {
        // 這裡會彈出 Cloudinary 回傳的具體錯誤訊息
        const errorMsg = result.error?.message || '上傳失敗';
        console.error("Cloudinary Error Details:", result);
        throw new Error(errorMsg);
      }
    } catch (error: any) {
      console.error("Network/Upload Error:", error);
      throw error;
    }
  };

  const saveProduct = async () => {
    if (!productForm.name || !selectedCategory) { 
      showAlert("提示", "請輸入物品名稱"); 
      return; 
    }
    
    setIsUploading(true);
    try {
      let finalImageUrl = productForm.image || ''; 

      if (selectedImg && !selectedImg.startsWith('http')) { 
        // 執行上傳
        finalImageUrl = await uploadToCloudinary(selectedImg); 
      }

      const data = { 
        ...productForm, 
        image: finalImageUrl, 
        categoryId: selectedCategory.id, 
        type: activeTab, 
        userId: auth.currentUser?.uid, 
        updatedAt: serverTimestamp() 
      };

      if (isEditing && editingId) { 
        await updateDoc(doc(db, 'products', editingId), data); 
      } else { 
        await addDoc(collection(db, 'products'), { 
          ...data, 
          createdAt: serverTimestamp() 
        }); 
      }
      closeProdModal();
    } catch (error: any) { 
      // 將具體的錯誤顯示出來，例如：Cloudinary 回傳的 "Invalid upload_preset"
      showAlert("儲存失敗", error.message || "請檢查網路連線或圖片格式"); 
    } finally { 
      setIsUploading(false); 
    }
  };

  const openEditModal = (item: Product) => {
    setProductForm(item); 
    setSelectedImg(item.image || null); // [修正重點]：將產品圖片同步到預覽狀態
    setEditingId(item.id); 
    setIsEditing(true); 
    setProdModalVisible(true);
  };

  const closeProdModal = () => {
    setProdModalVisible(false); setIsUploading(false);setIsEditing(false); setProductForm({ arrivalMonth: '1月', url: '' }); setSelectedImg(null);
  };

  if (!fontsLoaded) return (
    <View style={[styles.loadingContainer, { backgroundColor: Colors.bg }]}>
      <ActivityIndicator size="large" color="#FF6F61" />
    </View>
  );

  const renderProductDetail = () => (
    <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => setViewLevel('main')} style={[styles.glassBtn, { backgroundColor: Colors.card }]}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.text }]}>{selectedCategory?.name}</Text>
        <TouchableOpacity 
          onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.spring); setDisplayMode(displayMode === 'grid' ? 'list' : 'grid'); }} 
          style={[styles.glassBtn, { backgroundColor: Colors.primary + '20' }]}
        >
          <Ionicons name={displayMode === 'grid' ? "list-outline" : "grid-outline"} size={22} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={products}
        key={displayMode}
        numColumns={displayMode === 'grid' ? 2 : 1}
        contentContainerStyle={[styles.listContent, { paddingBottom: TAB_BAR_OFFSET }]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <FadeInView style={styles.emptyContainer}>
            <Ionicons name="file-tray-outline" size={60} color={Colors.subText} />
            <Text style={[styles.emptyText, { color: Colors.subText }]}>目前還沒有資料內容</Text>
          </FadeInView>
        }
        renderItem={({ item, index }) => {
          const paid = parseInt(item.paidAmount || '0');
          const total = parseInt(item.totalPrice || '1') || 1;
          const progress = Math.min(100, (paid / total) * 100);
          return (
            <FadeInView delay={index * 100}>
              <ScalePressable 
                onLongPress={() => {
                  setMovingItem(item);
                  setMoveModalVisible(true);
                }}
                onPress={() => openEditModal(item)}
                style={[displayMode === 'grid' ? styles.gridCard : styles.listCard, { backgroundColor: Colors.card, borderColor: Colors.border, borderWidth: 1 }]}
              >
                <Image source={{ uri: item.image || 'https://via.placeholder.com/150' }} style={displayMode === 'grid' ? styles.gridImg : styles.listImg} />
                <View style={styles.infoArea}>
                  <Text style={[styles.itemName, { color: Colors.text }]} numberOfLines={1}>{item.name}</Text>
                  {activeTab === 'owned' ? (
                    <View>
                      <Text style={[styles.priceTag, { color: Colors.primary }]}>$ {item.price || '0'}</Text>
                        {selectedCategory?.isConsumable && (
                          <>
                            {item.consumableType === 'count' && (
                              <View style={[
                                styles.statusBadge,
                                {
                                  backgroundColor: isLowStock(item) ? '#FFEBEA' : '#E3F9E5'
                                }
                              ]}>
                                <Text style={[
                                  styles.statusText,
                                  {
                                    color: isLowStock(item) ? '#F43F5E' : '#10B981'
                                  }
                                ]}>
                                  庫存: {item.stock || 0}（安全:{item.safeStock || 0}）
                                </Text>
                              </View>
                            )}

                            {item.consumableType === 'liquid' && (
                              <View style={[
                                styles.statusBadge,
                                {
                                  backgroundColor: item.liquidStatus === 'low' ? '#FFEBEA' : '#E3F9E5'
                                }
                              ]}>
                                <Text style={[
                                  styles.statusText,
                                  {
                                    color: item.liquidStatus === 'low' ? '#F43F5E' : '#10B981'
                                  }
                                ]}>
                                  {item.liquidStatus === 'low' ? '⚠️ 短缺' : '💧 充足'}
                                </Text>
                              </View>
                            )}
                          </>
                        )}
                    </View>
                  ) : (
                    <View>
                      <View style={styles.preorderHeader}>
                        <Text style={[styles.preorderText, {color: Colors.subText}]}>{item.arrivalMonth} 到貨</Text>
                        <Text style={[styles.remainingText, { color: Colors.primary }]}>待付: ${item.remainingAmount || 0}</Text>
                      </View>
                      <View style={styles.progressBarBg}>
                        <View style={[styles.progressBarFill, { backgroundColor: Colors.primary, width: `${progress}%` }]} />
                      </View>
                    </View>
                  )}
                </View>

                {/* --- 右側/頂部動作按鈕區 --- */}
                <View style={displayMode === 'grid' ? styles.gridActionArea : styles.listActionArea}>
                  {activeTab === 'preorder' && (
                    <>
                      <TouchableOpacity 
                        style={[styles.actionIconBtn, styles.completeBtnShadow, { backgroundColor: Colors.accent }]} 
                        onPress={() => handleCompletePreorder(item)}
                      >
                        <Ionicons name="checkmark-sharp" size={16} color="#FFF" />
                      </TouchableOpacity>
                      {item.url && (
                        <TouchableOpacity style={[styles.actionIconBtn, { backgroundColor: Colors.primary + '15' }]} onPress={() => handleOpenLink(item.url)}>
                          <Ionicons name="link-outline" size={18} color={Colors.primary} />
                        </TouchableOpacity>
                      )}
                    </>
                  )}
                  <TouchableOpacity style={[styles.actionIconBtn, { backgroundColor: '#F43F5E15' }]} onPress={() => showAlert("刪除確認", "確定要刪除這筆資料嗎？", () => deleteDoc(doc(db, 'products', item.id)))}>
                    <Ionicons name="trash-outline" size={18} color="#F43F5E" />
                  </TouchableOpacity>
                </View>
              </ScalePressable>
            </FadeInView>
          );
        }}
      />
      <Animated.View style={[styles.fab, { backgroundColor: Colors.primary, bottom: TAB_BAR_OFFSET - 30, transform: [{ scale: fabScale }] }]}>
        <TouchableOpacity onPress={() => setProdModalVisible(true)} style={styles.fabInner}>
          <Ionicons name="add" size={32} color="#FFF" />
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );

  const renderMainCategories = () => (
    <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
      <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} />
      <View style={{ paddingTop: insets.top + 20, paddingHorizontal: 25 }}>
        <Text style={[styles.mainTitle, { color: Colors.text }]}>清單收納室</Text>
        <Text style={[styles.subTitle, { color: Colors.subText }]}>整理你的生活，從這裡開始</Text>
      </View>

      <View style={styles.tabSection}>
        <View style={[styles.tabBar, { backgroundColor: isDarkMode ? '#1E293B' : '#E2E8F0' }]}>
          <Animated.View style={[styles.tabIndicator, { backgroundColor: Colors.card, transform: [{ translateX: scrollX }] }]} />
          <TouchableOpacity style={styles.tabItem} onPress={() => handleSwitchTab('owned')}>
            <Text style={[styles.tabLabel, { color: activeTab === 'owned' ? Colors.primary : Colors.subText, fontWeight: activeTab === 'owned' ? 'bold' : 'normal' }]}>已擁有</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tabItem} onPress={() => handleSwitchTab('preorder')}>
            <Text style={[styles.tabLabel, { color: activeTab === 'preorder' ? Colors.primary : Colors.subText, fontWeight: activeTab === 'preorder' ? 'bold' : 'normal' }]}>已預購</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView 
        contentContainerStyle={[styles.catScroll, { paddingBottom: TAB_BAR_OFFSET }]} 
        showsVerticalScrollIndicator={false}
        onScroll={(e) => {
            const offset = e.nativeEvent.contentOffset.y;
            Animated.spring(fabScale, { toValue: offset > 50 ? 0.8 : 1, useNativeDriver: true }).start();
        }}
      >
        <View style={styles.catWrapper}>
          {categories.map((cat, index) => (
            <FadeInView key={cat.id} delay={index * 80}>
              <ScalePressable 
                style={[styles.categoryCard, { backgroundColor: Colors.card, borderColor: Colors.border, borderWidth: 1 }]}
                onPress={() => { setSelectedCategory(cat); setViewLevel('detail'); }}
                // 👇 新增：長按刪除分類
                onLongPress={() => {
                  showAlert(
                    "刪除分類",
                    `確定要刪除「${cat.name}」嗎？（分類內商品也會保留或需你自行處理）`,
                    async () => {
                      try {
                        await deleteDoc(doc(db, 'categories', cat.id));
                      } catch (e) {
                        showAlert("錯誤", "刪除失敗");
                      }
                    }
                  );
                }}
              >
                <View style={[styles.bubbleIcon, { backgroundColor: Colors.primary + '15' }]}>
                  <Ionicons name={cat.isConsumable ? "flask-outline" : "cube-outline"} size={26} color={Colors.primary} />
                </View>
                <Text style={[styles.bubbleName, { color: Colors.text }]}>{cat.name}</Text>
                <View style={[styles.typeBadge, { backgroundColor: cat.isConsumable ? (isDarkMode ? '#78350F30' : '#FEF3C7') : (isDarkMode ? '#1E40AF30' : '#DBEAFE') }]}>
                  <Text style={[styles.typeText, { color: cat.isConsumable ? '#D97706' : '#2563EB' }]}>{cat.isConsumable ? "消耗品" : "耐久品"}</Text>
                </View>
              </ScalePressable>
            </FadeInView>
          ))}
        </View>
      </ScrollView>

      <Animated.View style={[styles.fab, { backgroundColor: Colors.primary, bottom: TAB_BAR_OFFSET - 30, transform: [{ scale: fabScale }] }]}>
        <TouchableOpacity style={styles.fabInner} onPress={() => setCatModalVisible(true)}>
            <Ionicons name="folder-open" size={28} color="#FFF" />
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );

  return (
    <View style={[styles.container, { backgroundColor: Colors.bg }]}>
      {viewLevel === 'main' ? renderMainCategories() : renderProductDetail()}

      {/* --- 自定義美化提示框 (Custom Alert Modal) --- */}
      <Modal visible={customAlert.show} transparent animationType="fade">
        <Pressable
          style={styles.alertOverlay}
          onPress={() => setCustomAlert({ ...customAlert, show: false })}
        >
          <FadeInView style={[styles.alertBox, { backgroundColor: Colors.card }]}>
            <View style={[styles.alertIconCircle, {backgroundColor: Colors.primary + '15'}]}>
               <Ionicons name="notifications-outline" size={30} color={Colors.primary} />
            </View>
            <Text style={[styles.alertTitle, { color: Colors.text }]}>{customAlert.title}</Text>
            <Text style={[styles.alertMsg, { color: Colors.subText }]}>{customAlert.msg}</Text>
            
            <View style={styles.alertActionRow}>
              {customAlert.onConfirm && (
                <TouchableOpacity 
                  style={[styles.alertBtn, {backgroundColor: Colors.inputBg}]} 
                  onPress={() => setCustomAlert({...customAlert, show: false})}
                >
                  <Text style={[styles.alertBtnText, {color: Colors.subText}]}>取消</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity 
                style={[styles.alertBtn, {backgroundColor: Colors.primary, flex: 2}]} 
                onPress={() => {
                  if(customAlert.onConfirm) customAlert.onConfirm();
                  setCustomAlert({...customAlert, show: false});
                }}
              >
                <Text style={[styles.alertBtnText, {color: '#FFF'}]}>
                  {customAlert.onConfirm ? '確認' : '我知道了'}
                </Text>
              </TouchableOpacity>
            </View>
          </FadeInView>
        </Pressable>
      </Modal>

      {/* --- 新增/編輯商品 Modal --- */}
      <Modal visible={prodModalVisible} transparent animationType="slide" onRequestClose={closeProdModal}>
        <Pressable
          style={styles.overlay}
          onPress={closeProdModal}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Pressable
              style={[styles.modalCard, { backgroundColor: Colors.card, height: '90%' }]}
              onPress={(e) => e.stopPropagation()}
            >
            <View style={styles.modalIndicator} />
            <Text style={[styles.modalHeader, { color: Colors.text }]}>{isEditing ? '修改內容' : '加入清單'}</Text>
            <ScrollView showsVerticalScrollIndicator={false} style={{ width: '100%' }}>
              <TouchableOpacity 
                activeOpacity={0.7}
                style={[styles.imagePicker, { backgroundColor: Colors.inputBg, zIndex: 999 }]} 
                onPress={() => {
                  console.log("點擊觸發成功");
                  pickImage();
                }}
              >
                {selectedImg ? (
                  <Image source={{ uri: selectedImg }} style={styles.previewImg} />
                ) : (
                  <View style={styles.imagePlaceholder}>
                    <Ionicons name="cloud-upload-outline" size={48} color={Colors.subText} />
                    <Text style={{color: Colors.subText, marginTop: 10}}>點擊上傳圖片</Text>
                  </View>
                )}
              </TouchableOpacity>
              <Text style={[styles.formLabel, {color: Colors.text}]}>基本資料</Text>
              <TextInput style={[styles.modalInput, { backgroundColor: Colors.inputBg, color: Colors.text }]} placeholder="物品名稱" value={productForm.name} placeholderTextColor={Colors.subText} onChangeText={t => setProductForm({...productForm, name: t})} />
              {activeTab === 'owned' ? (
                <>
                  <TextInput style={[styles.modalInput, { backgroundColor: Colors.inputBg, color: Colors.text }]} placeholder="購入價格" value={productForm.price} keyboardType="numeric" placeholderTextColor={Colors.subText} onChangeText={t => setProductForm({...productForm, price: t})} />
                      {selectedCategory?.isConsumable && (
                        <>
                          <Text style={[styles.formLabel, { color: Colors.text }]}>
                            消耗品類型
                          </Text>

                          {/* 類型切換 */}
                          <View style={{ flexDirection: 'row', marginBottom: 15 }}>
                            {['count', 'liquid'].map(type => (
                              <TouchableOpacity
                                key={type}
                                onPress={() => setProductForm({
                                  ...productForm,
                                  consumableType: type as any
                                })}
                                style={{
                                  padding: 12,
                                  borderRadius: 16,
                                  marginRight: 10,
                                  backgroundColor:
                                    productForm.consumableType === type
                                      ? Colors.primary
                                      : Colors.inputBg
                                }}
                              >
                                <Text style={{
                                  color:
                                    productForm.consumableType === type
                                      ? '#FFF'
                                      : Colors.text,
                                  fontFamily: 'ZenKurenaido'
                                }}>
                                  {type === 'count' ? '📦 庫存型' : '💧 液態型'}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>

                          {/* 📦 庫存型 */}
                          {productForm.consumableType === 'count' && (
                            <>
                              <TextInput
                                style={[styles.modalInput, { backgroundColor: Colors.inputBg, color: Colors.text }]}
                                placeholder="目前庫存"
                                keyboardType="numeric"
                                value={productForm.stock?.toString()}
                                onChangeText={t =>
                                  setProductForm({ ...productForm, stock: parseInt(t) || 0 })
                                }
                              />

                              <TextInput
                                style={[styles.modalInput, { backgroundColor: Colors.inputBg, color: Colors.text }]}
                                placeholder="安全庫存量（低於提醒）"
                                keyboardType="numeric"
                                value={productForm.safeStock?.toString()}
                                onChangeText={t =>
                                  setProductForm({ ...productForm, safeStock: parseInt(t) || 0 })
                                }
                              />
                            </>
                          )}

                          {/* 💧 液態型 */}
                          {productForm.consumableType === 'liquid' && (
                            <View style={{ flexDirection: 'row', marginBottom: 20 }}>
                              {[
                                { key: 'enough', label: '💧 充足' },
                                { key: 'low', label: '⚠️ 短缺' }
                              ].map(opt => (
                                <TouchableOpacity
                                  key={opt.key}
                                  onPress={() =>
                                    setProductForm({
                                      ...productForm,
                                      liquidStatus: opt.key as any
                                    })
                                  }
                                  style={{
                                    padding: 12,
                                    borderRadius: 16,
                                    marginRight: 10,
                                    backgroundColor:
                                      productForm.liquidStatus === opt.key
                                        ? Colors.primary
                                        : Colors.inputBg
                                  }}
                                >
                                  <Text style={{
                                    color:
                                      productForm.liquidStatus === opt.key
                                        ? '#FFF'
                                        : Colors.text,
                                    fontFamily: 'ZenKurenaido'
                                  }}>
                                    {opt.label}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          )}
                        </>
                      )}
                </>
              ) : (
                <>
                  <Text style={[styles.formLabel, {color: Colors.text}]}>到貨月份：{productForm.arrivalMonth}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
                    {MONTHS.map(m => (
                      <TouchableOpacity key={m} onPress={() => setProductForm({...productForm, arrivalMonth: m})} style={[styles.monthPick, { backgroundColor: productForm.arrivalMonth === m ? Colors.primary : Colors.inputBg }]}>
                        <Text style={{ fontFamily: 'ZenKurenaido', color: productForm.arrivalMonth === m ? '#FFF' : Colors.text }}>{m}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <TextInput style={[styles.modalInput, { backgroundColor: Colors.inputBg, color: Colors.text }]} value={productForm.totalPrice} placeholder="商品總價" keyboardType="numeric" placeholderTextColor={Colors.subText} onChangeText={t => setProductForm({...productForm, totalPrice: t})} />
                  <TextInput style={[styles.modalInput, { backgroundColor: Colors.inputBg, color: Colors.text }]} value={productForm.paidAmount} placeholder="已付定金" keyboardType="numeric" placeholderTextColor={Colors.subText} onChangeText={t => setProductForm({...productForm, paidAmount: t})} />
                  <TextInput style={[styles.modalInput, { backgroundColor: Colors.inputBg, color: Colors.text }]} value={productForm.remainingAmount} placeholder="剩餘尾款" keyboardType="numeric" placeholderTextColor={Colors.subText} onChangeText={t => setProductForm({...productForm, remainingAmount: t})} />
                  <TextInput style={[styles.modalInput, { backgroundColor: Colors.inputBg, color: Colors.text }]} value={productForm.url} placeholder="商品購買連結 (選填)" placeholderTextColor={Colors.subText} onChangeText={t => setProductForm({...productForm, url: t})} />
                </>
              )}
            </ScrollView>
            <View style={styles.actionRow}>
              <TouchableOpacity onPress={closeProdModal} style={styles.cancelBtn} disabled={isUploading}><Text style={styles.cancelBtnText}>取消</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.mainBtn, {backgroundColor: isUploading ? '#94A3B8' : Colors.primary}]} onPress={saveProduct} disabled={isUploading}>
                {isUploading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.mainBtnText}>{isEditing ? '更新內容' : '確認新增'}</Text>}
              </TouchableOpacity>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* --- 新增分類 Modal --- */}
      <Modal visible={catModalVisible} transparent animationType="fade" onRequestClose={() => setCatModalVisible(false)}>
        <Pressable
          style={styles.overlay}
          onPress={() => setCatModalVisible(false)}
        >
          <Pressable
            style={[styles.modalCard, { backgroundColor: Colors.card, height: 'auto', paddingBottom: insets.bottom + 40 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalIndicator} />
            <Text style={[styles.modalHeader, { color: Colors.text }]}>建立新分類</Text>
            <TextInput style={[styles.modalInput, { backgroundColor: Colors.inputBg, color: Colors.text }]} placeholder="例如：彩妝、模型..." placeholderTextColor={Colors.subText} value={newCatName} onChangeText={setNewCatName} />
            <View style={styles.switchBox}>
              <Text style={[styles.formLabel, {marginBottom: 0, color: Colors.text}]}>啟用庫存管理 (消耗品)</Text>
              <Switch value={isConsumable} onValueChange={setIsConsumable} trackColor={{ true: Colors.primary }} />
            </View>
            <View style={styles.actionRow}>
              <TouchableOpacity onPress={() => setCatModalVisible(false)} style={styles.cancelBtn}><Text style={styles.cancelBtnText}>關閉</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.mainBtn, {backgroundColor: Colors.primary}]} onPress={async () => {
                if(!newCatName) return;
                await addDoc(collection(db, 'categories'), { name: newCatName, isConsumable, userId: auth.currentUser?.uid, createdAt: serverTimestamp() });
                setNewCatName(''); setCatModalVisible(false);
              }}><Text style={styles.mainBtnText}>確認建立</Text></TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      {/* --- 移動商品 Modal --- */}
      <Modal visible={moveModalVisible} transparent animationType="fade">
        <Pressable 
          style={styles.overlay}
          onPress={() => {
            setMoveModalVisible(false);
            setMovingItem(null);
          }}
        >
          <Pressable
            style={[styles.modalCard, { backgroundColor: Colors.card, maxHeight: '75%' }]}
            onPress={(e) => e.stopPropagation()}
          >

            <View style={styles.modalIndicator} />

            <Text style={[styles.modalHeader, { color: Colors.text }]}>
              移動到其他分類
            </Text>

            {/* 目前分類提示 */}
            <View style={{
              backgroundColor: Colors.primary + '15',
              padding: 12,
              borderRadius: 16,
              marginBottom: 20,
              width: '100%',
              alignItems: 'center'
            }}>
              <Text style={{ color: Colors.primary, fontFamily: 'ZenKurenaido' }}>
                目前分類：{categories.find(c => c.id === movingItem?.categoryId)?.name}
              </Text>
            </View>

            <ScrollView style={{ width: '100%' }} showsVerticalScrollIndicator={false}>
              {categories
                .filter(cat => cat.id !== movingItem?.categoryId)
                .map((cat, index) => (
                  
                  <FadeInView key={cat.id} delay={index * 80}>
                    <ScalePressable
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        padding: 18,
                        borderRadius: 22,
                        marginBottom: 14,
                        backgroundColor: Colors.inputBg,
                        borderWidth: 1,
                        borderColor: Colors.border
                      }}
                      onPress={async () => {
                        if (!movingItem) return;

                        try {
                          await updateDoc(doc(db, 'products', movingItem.id), {
                            categoryId: cat.id,
                            updatedAt: serverTimestamp()
                          });

                          setMoveModalVisible(false);
                          setMovingItem(null);

                        } catch (e) {
                          showAlert("錯誤", "移動失敗");
                        }
                      }}
                    >

                      {/* icon */}
                      <View style={{
                        width: 50,
                        height: 50,
                        borderRadius: 16,
                        justifyContent: 'center',
                        alignItems: 'center',
                        marginRight: 14,
                        backgroundColor: Colors.primary + '20'
                      }}>
                        <Ionicons
                          name={cat.isConsumable ? "flask-outline" : "cube-outline"}
                          size={22}
                          color={Colors.primary}
                        />
                      </View>

                      {/* 文字區 */}
                      <View style={{ flex: 1 }}>
                        <Text style={{
                          color: Colors.text,
                          fontFamily: 'ZenKurenaido',
                          fontSize: 16
                        }}>
                          {cat.name}
                        </Text>

                        <Text style={{
                          color: Colors.subText,
                          fontSize: 12,
                          marginTop: 4,
                          fontFamily: 'ZenKurenaido'
                        }}>
                          {cat.isConsumable ? "消耗品分類" : "耐久品分類"}
                        </Text>
                      </View>

                      {/* arrow */}
                      <Ionicons
                        name="chevron-forward"
                        size={20}
                        color={Colors.subText}
                      />

                    </ScalePressable>
                  </FadeInView>

                ))}
            </ScrollView>

            {/* 取消按鈕 */}
            <TouchableOpacity
              onPress={() => setMoveModalVisible(false)}
              style={{
                marginTop: 10,
                paddingVertical: 14,
                borderRadius: 20,
                backgroundColor: Colors.inputBg,
                width: '100%',
                alignItems: 'center'
              }}
            >
              <Text style={{ color: Colors.subText, fontFamily: 'ZenKurenaido' }}>
                取消
              </Text>
            </TouchableOpacity>

          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// 樣式表 (保留您的樣式配置)
const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  mainTitle: { fontSize: 34, fontFamily: 'ZenKurenaido', letterSpacing: 1 },
  subTitle: { fontSize: 15, fontFamily: 'ZenKurenaido', marginBottom: 25, opacity: 0.7 },
  tabSection: { paddingHorizontal: 30, marginBottom: 25 },
  tabBar: { flexDirection: 'row', height: 52, borderRadius: 26, padding: 5, elevation: 2 },
  tabIndicator: { position: 'absolute', width: '50%', height: '100%', borderRadius: 22, top: 5, left: 5, elevation: 3, shadowOpacity: 0.1, shadowRadius: 5 },
  tabItem: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabLabel: { fontSize: 16, fontFamily: 'ZenKurenaido' },
  catScroll: { paddingHorizontal: 20 },
  catWrapper: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  categoryCard: { 
    width: (width - 56) / 2,
    padding: 22, borderRadius: 30, alignItems: 'center',justifyContent: 'center', marginBottom: 16, 
    elevation: 6, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8
  },
  bubbleIcon: { width: 60, height: 60, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
  bubbleName: { fontSize: 18, fontFamily: 'ZenKurenaido',textAlign: 'center', },
  typeBadge: { marginTop: 10, paddingHorizontal: 14, paddingVertical: 5, borderRadius: 12 },
  typeText: { fontSize: 11, fontFamily: 'ZenKurenaido' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 20 },
  headerTitle: { fontSize: 22, fontFamily: 'ZenKurenaido' },
  glassBtn: { width: 46, height: 46, borderRadius: 16, justifyContent: 'center', alignItems: 'center', elevation: 2 },
  listContent: { padding: 18 },
  gridCard: { width: (width - 50) / 2, margin: 5, borderRadius: 28, overflow: 'hidden', elevation: 5, shadowOpacity: 0.1, marginBottom: 15 },
  listCard: { flexDirection: 'row', marginBottom: 16, borderRadius: 26, padding: 12, alignItems: 'center', elevation: 3, shadowOpacity: 0.06 },
  gridImg: { width: '100%', height: 170 },
  listImg: { width: 85, height: 85, borderRadius: 20 },
  infoArea: { flex: 1, paddingHorizontal: 12, paddingVertical: 8 },
  itemName: { fontSize: 17, fontFamily: 'ZenKurenaido', marginBottom: 4},
  priceTag: { fontSize: 19, fontFamily: 'ZenKurenaido' },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10, marginTop: 8 },
  statusText: { fontSize: 11, fontFamily: 'ZenKurenaido' },
  preorderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  preorderText: { fontFamily: 'ZenKurenaido', fontSize: 12 },
  remainingText: { fontFamily: 'ZenKurenaido', fontSize: 14 },
  progressBarBg: { height: 7, backgroundColor: '#E2E8F0', borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 4 },
  
  // --- 按鈕美化 ---
  gridActionArea: { position: 'absolute', top: 10, right: 10, flexDirection: 'row' },
  listActionArea: { flexDirection: 'row', alignItems: 'center', marginLeft: 5 },
  actionIconBtn: { borderRadius: 14, padding: 10, elevation: 3, marginLeft: 8, shadowOpacity: 0.2, shadowRadius: 3, shadowOffset: {width: 0, height: 2} },
  completeBtnShadow: { shadowColor: '#10B981' },
  
  // --- 提示框美化 (Zen Font + Round Design) ---
  alertOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'center', alignItems: 'center' },
  alertBox: { width: width * 0.82, padding: 30, borderRadius: 40, alignItems: 'center', elevation: 25 },
  alertIconCircle: { width: 70, height: 70, borderRadius: 35, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  alertTitle: { fontSize: 22, fontFamily: 'ZenKurenaido', marginBottom: 12 },
  alertMsg: { fontSize: 16, fontFamily: 'ZenKurenaido', textAlign: 'center', lineHeight: 24, marginBottom: 25 },
  alertActionRow: { flexDirection: 'row', width: '100%', gap: 12 },
  alertBtn: { paddingVertical: 14, borderRadius: 25, justifyContent: 'center', alignItems: 'center', flex: 1 },
  alertBtnText: { fontSize: 16, fontFamily: 'ZenKurenaido' },

  emptyContainer: { alignItems: 'center', marginTop: 120, opacity: 0.4 },
  emptyText: { marginTop: 18, fontFamily: 'ZenKurenaido', fontSize: 16 },
  fab: { 
    position: 'absolute', right: 25, 
    width: 64, height: 64, borderRadius: 32, 
    elevation: 12, shadowColor: '#000', 
    shadowOpacity: 0.3, shadowRadius: 10, 
    overflow: 'hidden', zIndex: 999
  },
  fabInner: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.75)', justifyContent: 'flex-end' },
  modalIndicator: { width: 45, height: 6, backgroundColor: '#CBD5E1', borderRadius: 3, alignSelf: 'center', marginBottom: 25, opacity: 0.5 },
  modalCard: { width: '100%', borderTopLeftRadius: 45, borderTopRightRadius: 45, padding: 25, alignItems: 'center', elevation: 20 },
  modalHeader: { fontSize: 24, fontFamily: 'ZenKurenaido', marginBottom: 25 },
  modalInput: { width: '100%', padding: 18, borderRadius: 20, marginBottom: 15, fontFamily: 'ZenKurenaido', fontSize: 16, borderWidth: 1, borderColor: 'rgba(0,0,0,0.02)' },
  formLabel: { alignSelf: 'flex-start', marginBottom: 12, fontSize: 15, fontFamily: 'ZenKurenaido'},
  inlineInputRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', alignItems: 'center', marginBottom: 20 },
  switchBox: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', alignItems: 'center', marginVertical: 10 },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: 20 },
  cancelBtn: { paddingVertical: 15, paddingHorizontal: 25, justifyContent: 'center' },
  cancelBtnText: { color: '#94A3B8', fontFamily: 'ZenKurenaido', fontSize: 16 },
  mainBtn: { paddingVertical: 16, paddingHorizontal: 40, borderRadius: 22, elevation: 5, justifyContent: 'center', alignItems: 'center', minWidth: 150 },
  mainBtnText: { color: '#FFF', fontFamily: 'ZenKurenaido', fontSize: 17 },
  imagePicker: { width: '100%', height: 230, borderRadius: 30, borderStyle: 'dashed', borderWidth: 2, borderColor: '#CBD5E1', marginBottom: 25, overflow: 'hidden' },
  imagePlaceholder: {flex: 1,justifyContent: 'center', alignItems: 'center' },
  previewImg: { width: '100%', height: '100%', resizeMode: 'cover' },
  uploadingOverlay: {   ...StyleSheet.absoluteFillObject,
  backgroundColor: 'rgba(0,0,0,0.5)',
  justifyContent: 'center',
  alignItems: 'center'},
  monthPick: { paddingHorizontal: 22, paddingVertical: 12, borderRadius: 18, marginRight: 12, elevation: 2 },
});