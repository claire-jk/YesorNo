import { useFonts, ZenKurenaido_400Regular } from '@expo-google-fonts/zen-kurenaido';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where
} from 'firebase/firestore';
import { MotiView } from 'moti';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View
} from 'react-native';
import { LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { auth, db } from './firebaseConfig';

const { width } = Dimensions.get('window');
const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月', '未定'];

const CLOUD_NAME = "dfbzt23lp"; 
const UPLOAD_PRESET = "YesorNoself"; 

interface Category {
  id: string;
  name: string;
  isConsumable: boolean;
  familyId: string;
}
type ConsumableType = 'count' | 'liquid';

interface Product {
  id: string;
  categoryId: string;
  name: string;
  price?: string;
  image?: string;
  isStockAdequate?: boolean;
  arrivalMonth?: string;
  totalPrice?: string;
  paidAmount?: string;
  remainingAmount?: string;
  url?: string;
  type: 'owned' | 'preorder';
  familyId: string;
  consumableType?: ConsumableType; // ⭐ 新增
  stock?: number;                 // 數量型
  safeStock?: number;             // ⭐ 安全庫存
  isLiquidAdequate?: boolean;     // ⭐ 液態型
}

export default function FamilyList() {
  let [fontsLoaded] = useFonts({ ZenKurenaido: ZenKurenaido_400Regular });
  const insets = useSafeAreaInsets();
  const isDarkMode = useColorScheme() === 'dark';

const [moveModalVisible, setMoveModalVisible] = useState(false);
const [movingProduct, setMovingProduct] = useState<Product | null>(null);
const openMoveModal = (item: Product) => {
  setMovingProduct(item);
  setMoveModalVisible(true);
};
const moveToCategory = async (targetCategoryId: string) => {
  if (!movingProduct) return;

  try {
    await updateDoc(doc(db, 'products', movingProduct.id), {
      categoryId: targetCategoryId,
      updatedAt: serverTimestamp(),
    });

    setMoveModalVisible(false);
    setMovingProduct(null);

    showAlert('完成', '已成功移動分類');
  } catch (e) {
    showAlert('錯誤', '移動失敗');
  }
};

  const Colors = {
    bg: isDarkMode ? '#0F0F12' : '#F8FAFC',
    card: isDarkMode ? '#1C1C23' : '#FFFFFF',
    text: isDarkMode ? '#F0F0F5' : '#1D1D1F',
    subText: isDarkMode ? '#A1A1AA' : '#64748B',
    primary: '#7C69EF',
    secondary: '#A78BFA',
    accent: '#FF8AAB',
    inputBg: isDarkMode ? '#2A2A35' : '#F1F5F9',
    glow: isDarkMode ? 'rgba(124, 105, 239, 0.15)' : 'rgba(0, 0, 0, 0.04)',
    border: isDarkMode ? '#33333F' : '#E2E8F0',
  };

  const [familyId, setFamilyId] = useState<string | null>(null);
  const [loadingFamily, setLoadingFamily] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [viewLevel, setViewLevel] = useState<'main' | 'detail'>('main');
  const [activeTab, setActiveTab] = useState<'owned' | 'preorder'>('owned');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [displayMode, setDisplayMode] = useState<'grid' | 'list'>('grid');
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [catModalVisible, setCatModalVisible] = useState(false);
  const [prodModalVisible, setProdModalVisible] = useState(false);
  
  // 自定義提示訊息狀態
  const [alertConfig, setAlertConfig] = useState<{visible: boolean, title: string, msg: string, onConfirm?: () => void}>({
    visible: false, title: '', msg: ''
  });

  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newCatName, setNewCatName] = useState('');
  const [isConsumable, setIsConsumable] = useState(false);
  const [productForm, setProductForm] = useState<Partial<Product>>({ arrivalMonth: '1月', isStockAdequate: true });
  const [selectedImg, setSelectedImg] = useState<string | null>(null);

  const scrollX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const fetchUserFamilyRelation = async () => {
      if (!auth.currentUser) { setLoadingFamily(false); return; }
      try {
        const q = query(collection(db, 'family_members'), where('userId', '==', auth.currentUser.uid));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          setFamilyId(querySnapshot.docs[0].data().familyId);
        }
      } catch (error) { console.error(error); } 
      finally { setLoadingFamily(false); }
    };
    fetchUserFamilyRelation();
  }, []);

  useEffect(() => {
    if (!familyId) return;
    const q = query(collection(db, 'categories'), where('familyId', '==', familyId));
    return onSnapshot(q, (snap) => {
      setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() } as Category)));
    });
  }, [familyId]);

  useEffect(() => {
    if (!selectedCategory || !familyId) return;
    const q = query(
      collection(db, 'products'),
      where('categoryId', '==', selectedCategory.id),
      where('familyId', '==', familyId),
      where('type', '==', activeTab)
    );
    return onSnapshot(q, (snap) => {
      let data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Product));
      if (activeTab === 'preorder') {
        data.sort((a, b) => MONTHS.indexOf(a.arrivalMonth!) - MONTHS.indexOf(b.arrivalMonth!));
      }
      setProducts(data);
    });
  }, [selectedCategory, activeTab, familyId]);

  const showAlert = (title: string, msg: string, onConfirm?: () => void) => {
    setAlertConfig({ visible: true, title, msg, onConfirm });
  };

  const handleSwitchTab = (tab: 'owned' | 'preorder') => {
    setActiveTab(tab);
    Animated.spring(scrollX, {
      toValue: tab === 'owned' ? 0 : (width - 50) / 2,
      useNativeDriver: true,
    }).start();
  };

  const uploadToCloudinary = async (uri: string): Promise<string | null> => {
    setUploading(true);
    const data = new FormData();
    // @ts-ignore
    data.append('file', { uri, type: 'image/jpeg', name: 'upload.jpg' });
    data.append('upload_preset', UPLOAD_PRESET);
    try {
      const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
        method: 'POST',
        body: data,
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const result = await response.json();
      return result.secure_url;
    } catch (error) {
      showAlert('提示', '圖片上傳失敗');
      return null;
    } finally {
      setUploading(false);
    }
  };

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
    });
    if (!result.canceled) {
      const localUri = result.assets[0].uri;
      setSelectedImg(localUri); 
      const remoteUrl = await uploadToCloudinary(localUri);
      if (remoteUrl) setProductForm(prev => ({ ...prev, image: remoteUrl }));
    }
  };

  const saveProduct = async () => {
    if (!productForm.name || !selectedCategory || !familyId) {
        showAlert('注意', '請輸入必填欄位');
        return;
    }
    if (uploading) { showAlert('請稍候', '請等待圖片上傳完成'); return; }
    const data = { ...productForm, categoryId: selectedCategory.id, familyId, type: activeTab, updatedAt: serverTimestamp() };
    try {
        if (isEditing && editingId) {
          await updateDoc(doc(db, 'products', editingId), data);
        } else {
          await addDoc(collection(db, 'products'), { ...data, createdAt: serverTimestamp() });
        }
        closeProdModal();
    } catch (e) { showAlert('錯誤', '儲存失敗'); }
  };

  const convertToOwned = async (item: Product) => {
    showAlert('到貨確認', `要將「${item.name}」移至已擁有嗎？`, async () => {
        try {
            await updateDoc(doc(db, 'products', item.id), {
                type: 'owned',
                // 將預購時的總價 (totalPrice) 轉入已擁有時的金額 (price)
                price: item.totalPrice || '0', 
                // 如果是消耗品，到貨後通常初始庫存設為 1 (或依需求調整)
                stock: 1,
                isStockAdequate: true,
                updatedAt: serverTimestamp()
            });
        } catch (e) {
            showAlert('錯誤', '轉換失敗');
        }
    });
  };

  const closeProdModal = () => {
    setProdModalVisible(false);
    setIsEditing(false);
    setEditingId(null);
    setProductForm({ arrivalMonth: '1月', isStockAdequate: true });
    setSelectedImg(null);
  };

  if (!fontsLoaded || loadingFamily) return <ActivityIndicator style={{ flex: 1 }} color="#7C69EF" />;

  const CustomAlert = () => (
    <Modal visible={alertConfig.visible} transparent animationType="fade">
      <View style={styles.alertOverlay}>
        <MotiView 
          from={{ scale: 0.8, opacity: 0 }} 
          animate={{ scale: 1, opacity: 1 }} 
          style={[styles.alertBox, { backgroundColor: Colors.card }]}
        >
          <Text style={[styles.alertTitle, { color: Colors.text }]}>{alertConfig.title}</Text>
          <Text style={[styles.alertMsg, { color: Colors.subText }]}>{alertConfig.msg}</Text>
          <View style={styles.alertActionRow}>
            <TouchableOpacity 
              style={[styles.alertBtn, { backgroundColor: Colors.inputBg }]} 
              onPress={() => setAlertConfig({ ...alertConfig, visible: false })}
            >
              <Text style={[styles.alertBtnText, { color: Colors.subText }]}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.alertBtn, { backgroundColor: Colors.primary }]} 
              onPress={() => {
                if(alertConfig.onConfirm) alertConfig.onConfirm();
                setAlertConfig({ ...alertConfig, visible: false });
              }}
            >
              <Text style={[styles.alertBtnText, { color: '#FFF' }]}>確認</Text>
            </TouchableOpacity>
          </View>
        </MotiView>
      </View>
    </Modal>
  );

  const renderDetail = () => (
    <View style={{ flex: 1 }}>
      <MotiView from={{ opacity: 0, translateY: -20 }} animate={{ opacity: 1, translateY: 0 }} style={[styles.header, { paddingTop: insets.top + 10, borderBottomColor: Colors.border }]}>
        <TouchableOpacity onPress={() => setViewLevel('main')} style={[styles.iconBtn, { backgroundColor: Colors.inputBg }]}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.text }]}>{selectedCategory?.name}</Text>
        <TouchableOpacity onPress={() => setDisplayMode(displayMode === 'grid' ? 'list' : 'grid')} style={[styles.iconBtn, { backgroundColor: Colors.inputBg }]}>
          <Ionicons name={displayMode === 'grid' ? "list" : "grid"} size={22} color={Colors.primary} />
        </TouchableOpacity>
      </MotiView>

      <FlatList
        data={products}
        key={displayMode}
        numColumns={displayMode === 'grid' ? 2 : 1}
        contentContainerStyle={[styles.listContent, { paddingBottom: 120 }]}
        renderItem={({ item, index }) => (
          <MotiView
            from={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'timing', duration: 300, delay: index * 40 }}
            layout={LinearTransition.springify().damping(15)}
            style={displayMode === 'list' ? { width: '100%' } : null}
          >
            <Pressable 
              onPress={() => { 
                setProductForm(item); 
                setSelectedImg(item.image || null); 
                setEditingId(item.id); 
                setIsEditing(true); 
                setProdModalVisible(true); 
              }}
              onLongPress={() => openMoveModal(item)}
              delayLongPress={400}
              style={({ pressed }) => [
                displayMode === 'grid' ? styles.gridCard : styles.listCard, 
                { backgroundColor: Colors.card, shadowColor: Colors.glow, borderColor: Colors.border, borderWidth: 1, transform: [{ scale: pressed ? 0.97 : 1 }] }
              ]}
            >
              <Image source={{ uri: item.image || 'https://via.placeholder.com/150' }} style={displayMode === 'grid' ? styles.gridImg : styles.listImg} />
              <View style={styles.infoArea}>
                <Text style={[styles.itemName, { color: Colors.text }]} numberOfLines={1}>{item.name}</Text>
                {activeTab === 'owned' ? (
                  <>
                    <Text style={[styles.priceTag, { color: Colors.primary }]}>$ {item.price || '0'}</Text>
                {/* ⭐ 顯示類型 */}
                {selectedCategory?.isConsumable && (
                  <Text style={[styles.stockText, { color: Colors.subText }]}>
                    類型：{item.consumableType === 'count' ? '數量型' : '液態型'}
                  </Text>
                )}

                {/* ⭐ 數量型顯示 */}
                {selectedCategory?.isConsumable && item.consumableType === 'count' && (
                  <Text
                    style={[
                      styles.stockText,
                      {
                        color:
                          (item.stock ?? 0) <= (item.safeStock ?? 0)
                            ? '#EF4444'
                            : Colors.text,
                      },
                    ]}
                  >
                    庫存：{item.stock ?? 0} / 安全：{item.safeStock ?? 0}
                  </Text>
                )}

                {/* ⭐ 液態型顯示 */}
                {selectedCategory?.isConsumable && item.consumableType === 'liquid' && (
                  <Text style={[styles.stockText, { color: Colors.text }]}>
                    狀態：{item.isLiquidAdequate ? '充足' : '短缺'}
                  </Text>
                )}
                  </>
                ) : (
                  <>
                    <Text style={[styles.preorderText, { color: Colors.subText }]}>{item.arrivalMonth} 預計</Text>
                    <Text style={[styles.remainingText, { color: '#45AAF2' }]}>待付: ${item.totalPrice ? (Number(item.totalPrice) - Number(item.paidAmount || 0)) : 0}</Text>
                    
                    {/* 到貨轉移按鈕 */}
                    <TouchableOpacity 
                        style={[styles.convertBtn, { backgroundColor: Colors.primary }]}
                        onPress={() => convertToOwned(item)}
                    >
                        <Ionicons name="gift-outline" size={14} color="#FFF" />
                        <Text style={styles.convertBtnText}>已到貨</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
              <TouchableOpacity style={styles.delBtn} onPress={() => {
                  showAlert("刪除物品", "確定要刪除嗎？", () => deleteDoc(doc(db, 'products', item.id)));
              }}>
                <Ionicons name="trash-outline" size={16} color="#F87171" />
              </TouchableOpacity>
            </Pressable>
          </MotiView>
        )}
      />
      <TouchableOpacity style={[styles.fab, { backgroundColor: Colors.primary, shadowColor: Colors.primary, bottom: 100 }]} onPress={() => setProdModalVisible(true)}>
        <Ionicons name="add" size={32} color="#FFF" />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: Colors.bg }]}>
      {viewLevel === 'main' ? (
        <View style={{ flex: 1 }}>
          <MotiView from={{ opacity: 0, translateX: -20 }} animate={{ opacity: 1, translateX: 0 }} style={{ paddingTop: insets.top + 20, paddingHorizontal: 25, marginBottom: 25 }}>
            <Text style={[styles.mainTitle, { color: Colors.text }]}>家庭空間</Text>
            <Text style={[styles.subTitle, { color: Colors.subText }]}>共享庫存與購物清單</Text>
          </MotiView>

          <View style={styles.tabSection}>
            <View style={[styles.tabBar, { backgroundColor: Colors.inputBg }]}>
              <Animated.View style={[styles.tabIndicator, { backgroundColor: Colors.card, transform: [{ translateX: scrollX }] }]} />
              <TouchableOpacity style={styles.tabItem} onPress={() => handleSwitchTab('owned')}>
                <Text style={[styles.tabLabel, { color: activeTab === 'owned' ? Colors.primary : Colors.subText }]}>已擁有</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.tabItem} onPress={() => handleSwitchTab('preorder')}>
                <Text style={[styles.tabLabel, { color: activeTab === 'preorder' ? Colors.primary : Colors.subText }]}>已預購</Text>
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView contentContainerStyle={[styles.catScroll, { paddingBottom: 130 }]} showsVerticalScrollIndicator={false}>
            <View style={styles.catWrapper}>
              {categories.map((cat, index) => (
                <MotiView
                  key={cat.id}
                  from={{ opacity: 0, scale: 0.9, translateY: 10 }}
                  animate={{ opacity: 1, scale: 1, translateY: 0 }}
                  transition={{ delay: index * 50 }}
                  style={{ width: '48%' }}
                >
                  <Pressable 
                    style={({ pressed }) => [
                      styles.categoryBubble, 
                      { backgroundColor: Colors.card, shadowColor: Colors.glow, borderColor: Colors.border, borderWidth: 1, transform: [{ scale: pressed ? 0.96 : 1 }] }
                    ]}
                    onPress={() => { setSelectedCategory(cat); setViewLevel('detail'); }}
                  >
                    <View style={[styles.iconCircle, { backgroundColor: Colors.inputBg }]}>
                      <Ionicons name={cat.isConsumable ? "fast-food" : "cube"} size={22} color={Colors.primary} />
                    </View>
                    <Text style={[styles.bubbleName, { color: Colors.text }]}>{cat.name}</Text>
                    <View style={[styles.typeBadge, { backgroundColor: cat.isConsumable ? 'rgba(255, 184, 0, 0.1)' : 'rgba(124, 105, 239, 0.1)' }]}>
                      <Text style={[styles.typeText, { color: cat.isConsumable ? '#FFB800' : Colors.primary }]}>{cat.isConsumable ? "消耗品" : "耐久品"}</Text>
                    </View>
                  </Pressable>
                </MotiView>
              ))}
            </View>
          </ScrollView>

          <TouchableOpacity style={[styles.fab, { backgroundColor: Colors.primary, shadowColor: Colors.primary, bottom: 100 }]} onPress={() => setCatModalVisible(true)}>
            <Ionicons name="folder-open" size={24} color="#FFF" />
          </TouchableOpacity>
        </View>
      ) : renderDetail()}

      {/* Modal 部分 */}
      <CustomAlert />

      <Modal visible={catModalVisible} transparent animationType="fade">
        <View style={styles.overlay}>
          <MotiView from={{ translateY: 300 }} animate={{ translateY: 0 }} style={[styles.modalCard, { backgroundColor: Colors.card }]}>
            <View style={styles.modalIndicator} />
            <Text style={[styles.modalHeader, { color: Colors.text }]}>建立家庭分類</Text>
            <TextInput style={[styles.modalInput, { backgroundColor: Colors.inputBg, color: Colors.text }]} placeholder="例如：冰箱冷藏、浴室用品" placeholderTextColor={Colors.subText} value={newCatName} onChangeText={setNewCatName} />
            <View style={styles.switchBox}>
              <Text style={[styles.formLabel, { color: Colors.text }]}>設定為消耗品</Text>
              <Switch value={isConsumable} onValueChange={setIsConsumable} trackColor={{ true: Colors.primary }} />
            </View>
            <View style={styles.actionRow}>
              <TouchableOpacity onPress={() => setCatModalVisible(false)} style={styles.cancelBtn}><Text style={{color: Colors.subText, fontFamily: 'ZenKurenaido'}}>取消</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.mainBtn, {backgroundColor: Colors.primary}]} onPress={async () => {
                if(!newCatName || !familyId) return;
                await addDoc(collection(db, 'categories'), { name: newCatName, isConsumable, familyId, createdAt: serverTimestamp() });
                setNewCatName(''); setCatModalVisible(false);
              }}><Text style={styles.mainBtnText}>確認建立</Text></TouchableOpacity>
            </View>
          </MotiView>
        </View>
      </Modal>

      <Modal visible={prodModalVisible} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={[styles.modalCard, { backgroundColor: Colors.card, height: '90%' }]}>
            <View style={styles.modalIndicator} />
            <Text style={[styles.modalHeader, { color: Colors.text }]}>{isEditing ? '修改內容' : '新增物品'}</Text>
            <ScrollView showsVerticalScrollIndicator={false} style={{ width: '100%' }}>
              <TouchableOpacity style={[styles.imagePicker, { backgroundColor: Colors.inputBg, borderColor: Colors.border }]} onPress={pickImage} disabled={uploading}>
                {uploading ? <ActivityIndicator color={Colors.primary} /> : selectedImg ? <Image source={{ uri: selectedImg }} style={styles.previewImg} /> : (
                  <View style={{alignItems:'center'}}><Ionicons name="camera" size={32} color={Colors.subText} /><Text style={{fontFamily:'ZenKurenaido', color:Colors.subText, marginTop:8}}>上傳照片</Text></View>
                )}
              </TouchableOpacity>
              <Text style={[styles.inputLabel, { color: Colors.text }]}>物品名稱</Text>
              <TextInput style={[styles.modalInput, { backgroundColor: Colors.inputBg, color: Colors.text }]} placeholder="請輸入名稱" placeholderTextColor={Colors.subText} value={productForm.name} onChangeText={t => setProductForm({...productForm, name: t})} />
                {activeTab === 'owned' ? (
                  <>
                    <Text style={[styles.inputLabel, { color: Colors.text }]}>金額</Text>
                    <TextInput
                      style={[styles.modalInput, { backgroundColor: Colors.inputBg, color: Colors.text }]}
                      placeholder="0"
                      keyboardType="numeric"
                      value={productForm.price}
                      onChangeText={t => setProductForm({...productForm, price: t})}
                    />

                    {selectedCategory?.isConsumable && (
                      <>
                        {/* ⭐ 類型選擇 */}
                        <View style={styles.switchBox}>
                          <Text style={[styles.formLabel, { color: Colors.text }]}>類型</Text>
                          <View style={{ flexDirection: 'row', gap: 10 }}>
                            <TouchableOpacity
                              onPress={() => setProductForm({...productForm, consumableType: 'count'})}
                              style={{
                                padding: 8,
                                borderRadius: 10,
                                backgroundColor: productForm.consumableType === 'count' ? Colors.primary : Colors.inputBg
                              }}
                            >
                              <Text style={{ fontFamily: 'ZenKurenaido',color: productForm.consumableType === 'count' ? '#FFF' : Colors.text }}>
                                數量型
                              </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              onPress={() => setProductForm({...productForm, consumableType: 'liquid'})}
                              style={{
                                padding: 8,
                                borderRadius: 10,
                                backgroundColor: productForm.consumableType === 'liquid' ? Colors.primary : Colors.inputBg
                              }}
                            >
                              <Text style={{fontFamily: 'ZenKurenaido', color: productForm.consumableType === 'liquid' ? '#FFF' : Colors.text }}>
                                液態型
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>

                        {/* ⭐ 數量型 */}
                        {productForm.consumableType === 'count' && (
                          <>
                            <Text style={[styles.inputLabel, { color: Colors.text }]}>目前庫存</Text>
                            <TextInput
                              style={[styles.modalInput, { backgroundColor: Colors.inputBg, color: Colors.text }]}
                              keyboardType="numeric"
                              value={productForm.stock?.toString()}
                              onChangeText={t => setProductForm({...productForm, stock: parseInt(t) || 0})}
                            />

                            <Text style={[styles.inputLabel, { color: Colors.text }]}>安全庫存</Text>
                            <TextInput
                              style={[styles.modalInput, { backgroundColor: Colors.inputBg, color: Colors.text }]}
                              keyboardType="numeric"
                              value={productForm.safeStock?.toString()}
                              onChangeText={t => setProductForm({...productForm, safeStock: parseInt(t) || 0})}
                            />
                          </>
                        )}

                        {/* ⭐ 液態型 */}
                        {productForm.consumableType === 'liquid' && (
                          <View style={styles.switchBox}>
                            <Text style={[styles.formLabel, { color: Colors.text }]}>狀態</Text>
                            <Switch
                              value={productForm.isLiquidAdequate}
                              onValueChange={v => setProductForm({...productForm, isLiquidAdequate: v})}
                              trackColor={{ true: Colors.primary }}
                            />
                          </View>
                        )}
                      </>
                    )}
                  </>
                ) : (
                <>
                  <Text style={[styles.inputLabel, { color: Colors.text }]}>網址</Text>
                  <TextInput style={[styles.modalInput, { backgroundColor: Colors.inputBg, color: Colors.text }]} placeholder="貼上購物連結" value={productForm.url} onChangeText={t => setProductForm({...productForm, url: t})} />
                  <Text style={[styles.inputLabel, { color: Colors.text }]}>預計到達月份</Text>
                  <View style={styles.monthScroll}>
                    {MONTHS.map(m => (
                      <TouchableOpacity key={m} onPress={() => setProductForm({...productForm, arrivalMonth: m})} style={[styles.monthPick, { backgroundColor: productForm.arrivalMonth === m ? Colors.primary : Colors.inputBg }]}>
                        <Text style={{ fontFamily: 'ZenKurenaido', color: productForm.arrivalMonth === m ? '#FFF' : Colors.text }}>{m}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <View style={{ width: '48%' }}><Text style={[styles.inputLabel, { color: Colors.text }]}>總價</Text><TextInput style={[styles.modalInput, { backgroundColor: Colors.inputBg, color: Colors.text }]} keyboardType="numeric" value={productForm.totalPrice} onChangeText={t => setProductForm({...productForm, totalPrice: t})} /></View>
                    <View style={{ width: '48%' }}><Text style={[styles.inputLabel, { color: Colors.text }]}>已付金額</Text><TextInput style={[styles.modalInput, { backgroundColor: Colors.inputBg, color: Colors.text }]} keyboardType="numeric" value={productForm.paidAmount} onChangeText={t => setProductForm({...productForm, paidAmount: t})} /></View>
                  </View>
                </>
              )}
            </ScrollView>
            <View style={styles.actionRow}>
              <TouchableOpacity onPress={closeProdModal} style={styles.cancelBtn}><Text style={{ color: Colors.subText, fontFamily: 'ZenKurenaido' }}>取消</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.mainBtn, {backgroundColor: uploading ? Colors.subText : Colors.primary}]} onPress={saveProduct} disabled={uploading}>
                <Text style={styles.mainBtnText}>{uploading ? '上傳中...' : '確認儲存'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {/* 移動分類 Modal */}
      <Modal
        visible={moveModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMoveModalVisible(false)}
      >
        {/* 背景遮罩（點這裡關閉） */}
        <Pressable
          style={styles.overlay}
          onPress={() => setMoveModalVisible(false)}
        >
          {/* 內容區（阻止冒泡） */}
          <Pressable style={{ width: '100%', alignItems: 'center' }} onPress={() => {}}>

            <View
              style={[
                styles.modalCard,
                {
                  backgroundColor: Colors.card,
                  maxHeight: '80%',
                  width: '100%',
                  paddingBottom: 15,
                },
              ]}
            >

              {/* 上方拖曳條 */}
              <View style={styles.modalIndicator} />

              {/* 標題 */}
              <Text style={[styles.modalHeader, { color: Colors.text }]}>
                移動分類
              </Text>

              {/* 目前移動的商品 */}
              <Text
                style={{
                  color: Colors.subText,
                  marginBottom: 15,
                  fontFamily: 'ZenKurenaido',
                }}
              >
                {movingProduct?.name}
              </Text>

              {/* 分類列表 */}
              <ScrollView
                style={{ width: '100%' }}
                contentContainerStyle={{ paddingBottom: 10 }}
                showsVerticalScrollIndicator={false}
              >
                {categories
                  .filter(c => c.id !== selectedCategory?.id)
                  .map(cat => (
                    <TouchableOpacity
                      key={cat.id}
                      onPress={() => moveToCategory(cat.id)}
                      style={{
                        padding: 16,
                        borderRadius: 14,
                        backgroundColor: Colors.inputBg,
                        marginBottom: 10,
                      }}
                    >
                      <Text style={{ color: Colors.text, fontFamily: 'ZenKurenaido' }}>
                        {cat.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
              </ScrollView>

              {/* 底部取消 */}
              <View style={styles.modalFooter}>
                <TouchableOpacity
                  onPress={() => setMoveModalVisible(false)}
                  style={styles.cancelButton}
                >
                  <Text style={styles.cancelText}>取消</Text>
                </TouchableOpacity>
              </View>

            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 15, borderBottomWidth: 0.5 },
  headerTitle: { fontSize: 22, fontFamily: 'ZenKurenaido' },
  iconBtn: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  mainTitle: { fontSize: 34, fontFamily: 'ZenKurenaido', letterSpacing: 1 },
  subTitle: { fontSize: 16, fontFamily: 'ZenKurenaido' },
  tabSection: { paddingHorizontal: 25, marginBottom: 20 },
  tabBar: { flexDirection: 'row', height: 54, borderRadius: 16, padding: 4 },
  tabIndicator: { position: 'absolute', width: '50%', height: '100%', borderRadius: 12, top: 4, left: 4 },
  tabItem: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabLabel: { fontSize: 16, fontFamily: 'ZenKurenaido' },
  catScroll: { paddingHorizontal: 20 },
  catWrapper: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  categoryBubble: { width: '100%', padding: 20, borderRadius: 24, alignItems: 'center', marginBottom: 15, elevation: 4, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 8 },
  iconCircle: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  bubbleName: { fontSize: 18, fontFamily: 'ZenKurenaido' },
  typeBadge: { marginTop: 10, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10 },
  typeText: { fontSize: 11, fontFamily: 'ZenKurenaido' },
  listContent: { padding: 12 },
  gridCard: { width: (width - 48) / 2, margin: 6, borderRadius: 24, overflow: 'hidden', elevation: 5, marginBottom: 12, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 5 },
  listCard: { flexDirection: 'row', width: width - 24, marginVertical: 8, marginHorizontal: 0, borderRadius: 24, padding: 12, alignItems: 'center', elevation: 3, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 3 },
  gridImg: { width: '100%', height: 140 },
  listImg: { width: 85, height: 85, borderRadius: 18 },
  infoArea: { flex: 1, paddingHorizontal: 12 },
  itemName: { fontSize: 16, fontFamily: 'ZenKurenaido' },
  priceTag: { fontSize: 18, fontFamily: 'ZenKurenaido', marginTop: 4 },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginTop: 8 },
  statusText: { fontSize: 12, fontFamily: 'ZenKurenaido' },
  preorderText: { fontSize: 12, fontFamily: 'ZenKurenaido', marginTop: 2 },
  remainingText: { fontSize: 14, fontFamily: 'ZenKurenaido', marginTop: 4 },
  delBtn: { position: 'absolute', top: 12, right: 12, padding: 4 },
  fab: { position: 'absolute', right: 25, width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', elevation: 12, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 10 },
  //overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  //modalCard: { width: '100%', borderTopLeftRadius: 36, borderTopRightRadius: 36, padding: 25, alignItems: 'center', flex: 1, },
  //modalIndicator: { width: 40, height: 5, backgroundColor: '#DDD', borderRadius: 3, marginBottom: 20 },
  //modalHeader: { fontSize: 24, fontFamily: 'ZenKurenaido', marginBottom: 20 },
  inputLabel: { alignSelf: 'flex-start', fontFamily: 'ZenKurenaido', fontSize: 14, marginBottom: 8, marginLeft: 4 },
  modalInput: { width: '100%', padding: 16, borderRadius: 16, marginBottom: 16, fontFamily: 'ZenKurenaido', fontSize: 16 },
  switchBox: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', alignItems: 'center', marginVertical: 10, paddingHorizontal: 5 },
  formLabel: { fontFamily: 'ZenKurenaido', fontSize: 15 },
  monthScroll: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 15 },
  monthPick: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, margin: 4 },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: 20 },
  cancelBtn: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  mainBtn: { flex: 2, paddingVertical: 16, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  mainBtnText: { color: '#FFF', fontFamily: 'ZenKurenaido', fontSize: 16 },
  imagePicker: { width: '100%', height: 180, borderRadius: 20, borderStyle: 'dashed', borderWidth: 2, justifyContent: 'center', alignItems: 'center', marginBottom: 20, overflow: 'hidden' },
  previewImg: { width: '100%', height: '100%' },
  
  // 新增到貨按鈕樣式
  convertBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, marginTop: 10, alignSelf: 'flex-start' },
  convertBtnText: { color: '#FFF', fontSize: 11, fontFamily: 'ZenKurenaido', marginLeft: 4 },

  // 自定義 Alert 樣式
  alertOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 30 },
  alertBox: { width: '100%', borderRadius: 30, padding: 25, alignItems: 'center', elevation: 20 },
  alertTitle: { fontSize: 22, fontFamily: 'ZenKurenaido', marginBottom: 12 },
  alertMsg: { fontSize: 16, fontFamily: 'ZenKurenaido', textAlign: 'center', marginBottom: 25, lineHeight: 22 },
  alertActionRow: { flexDirection: 'row', width: '100%', justifyContent: 'space-between' },
  alertBtn: { flex: 0.48, paddingVertical: 14, borderRadius: 18, alignItems: 'center' },
  alertBtnText: { fontFamily: 'ZenKurenaido', fontSize: 16 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 10,
  },

  modalCard: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 20,
    alignItems: 'center',
    width: '100%',
  },

  modalIndicator: {
    width: 40,
    height: 5,
    backgroundColor: '#DDD',
    borderRadius: 3,
    marginBottom: 15,
  },

  modalHeader: {
    fontSize: 20,
    fontFamily: 'ZenKurenaido',
    marginBottom: 10,
  },

  modalFooter: {
    width: '100%',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },

  cancelButton: {
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },

  cancelText: {
    color: '#64748B',
    fontFamily: 'ZenKurenaido',
    fontSize: 16,
  },
  stockText: {
    fontSize: 13,
    fontFamily: 'ZenKurenaido',
    marginTop: 6,
  },
  text:{
    fontFamily: 'ZenKurenaido',
  }
});