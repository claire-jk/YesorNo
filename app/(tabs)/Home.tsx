import { useFonts, ZenKurenaido_400Regular } from '@expo-google-fonts/zen-kurenaido';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    Dimensions,
    Modal,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    useColorScheme,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Firebase 必要匯入
import { onAuthStateChanged } from 'firebase/auth';
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDocs,
    limit,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    where
} from 'firebase/firestore';
import { auth, db } from './firebaseConfig';

const { width } = Dimensions.get('window');

interface WishItem { id: string; name: string; }
interface Family { id: string; name: string; inviteCode: string; }

export default function Home() {
    let [fontsLoaded] = useFonts({
        ZenKurenaido: ZenKurenaido_400Regular,
    });

    const [mode, setMode] = useState<'self' | 'family'>('self');
    const [wishList, setWishList] = useState<WishItem[]>([]);
    const [familyWishList, setFamilyWishList] = useState<WishItem[]>([]);
    const [families, setFamilies] = useState<Family[]>([]);
    const [currentFamily, setCurrentFamily] = useState<Family | null>(null);
    
    const [loading, setLoading] = useState(true);
    const [isDataInitialized, setIsDataInitialized] = useState(false);

    const isInitialMount = useRef(true);

    // Modals 狀態
    const [modalVisible, setModalVisible] = useState(false);
    const [familyModalVisible, setFamilyModalVisible] = useState(false);
    const [createJoinModalVisible, setCreateJoinModalVisible] = useState(false);
    
    // 提示與確認視窗狀態
    const [customAlert, setCustomAlert] = useState({ visible: false, title: '', message: '', type: 'success' as 'success' | 'error' });
    const [confirmConfig, setConfirmConfig] = useState({ visible: false, title: '', message: '', onConfirm: () => {} });

    const [newItemName, setNewItemName] = useState('');
    const [familyAction, setFamilyAction] = useState<'create' | 'join' | null>(null);
    const [inputVal, setInputVal] = useState('');

    const isDarkMode = useColorScheme() === 'dark';
    const insets = useSafeAreaInsets();
    const scrollX = useRef(new Animated.Value(0)).current;

    const Colors = {
        bg: isDarkMode ? '#121212' : '#F8F9FA',
        card: isDarkMode ? '#1E1E1E' : '#FFFFFF',
        text: isDarkMode ? '#FFFFFF' : '#333',
        subText: isDarkMode ? '#AAA' : '#888',
        primary: '#FF6F61',
        accent: '#FFD700',
        inputBg: isDarkMode ? '#2C2C2C' : '#F5F5F5',
        itemBg: isDarkMode ? '#252525' : '#F9F9F9',
    };

    const switchMode = (target: 'self' | 'family') => {
        setMode(target);
        Animated.spring(scrollX, {
            toValue: target === 'self' ? 0 : width / 2 - 24,
            useNativeDriver: true,
            friction: 8,
        }).start();
    };

    const showAlert = (title: string, message: string, type: 'success' | 'error' = 'success') => {
        setCustomAlert({ visible: true, title, message, type });
    };

    const showConfirm = (title: string, message: string, onConfirm: () => void) => {
        setConfirmConfig({ visible: true, title, message, onConfirm });
    };

    // 初始化：監聽 Auth 與 個人清單/家庭列表
    useEffect(() => {
        let unsubSelf: (() => void) | undefined;
        let unsubFamMembers: (() => void) | undefined;

        const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
            if (!user) {
                setLoading(false);
                setIsDataInitialized(true);
                return;
            }

            // 1. 監聽個人清單
            const qSelf = query(collection(db, 'wishlist'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
            unsubSelf = onSnapshot(qSelf, (snap) => {
                setWishList(snap.docs.map(d => ({ id: d.id, name: d.data().name })));
            });

            // 2. 監聽家庭成員關係
            const qFamMember = query(collection(db, 'family_members'), where('userId', '==', user.uid));
            unsubFamMembers = onSnapshot(qFamMember, async (snap) => {
                if (snap.empty) {
                    setFamilies([]);
                    setLoading(false);
                    setIsDataInitialized(true);
                    return;
                }

                const famIds = snap.docs.map(d => d.data().familyId);
                // 根據 ID 抓取家庭詳細資料
                const famDataList: Family[] = [];
                for (const fId of famIds) {
                    const fDoc = await getDocs(query(collection(db, 'families'), where('__name__', '==', fId)));
                    fDoc.forEach(d => famDataList.push({ id: d.id, ...d.data() } as Family));
                }
                setFamilies(famDataList);

                // 處理初次載入的家庭切換
                if (famDataList.length > 0 && isInitialMount.current) {
                    const savedId = await AsyncStorage.getItem('currentFamilyId');
                    let targetFamily = savedId ? famDataList.find(f => f.id === savedId) : famDataList[0];
                    if (!targetFamily) targetFamily = famDataList[0];
                    setCurrentFamily(targetFamily);
                    switchMode('family');
                    isInitialMount.current = false;
                }
                setLoading(false);
                setIsDataInitialized(true);
            });
        });

        return () => {
            unsubscribeAuth();
            if (unsubSelf) unsubSelf();
            if (unsubFamMembers) unsubFamMembers();
        };
    }, []);

    // 當 currentFamily 改變時，監聽該家庭的清單
    useEffect(() => {
        if (!currentFamily) { 
            setFamilyWishList([]); 
            return; 
        }
        const qFamWish = query(collection(db, 'family_wishlist'), where('familyId', '==', currentFamily.id), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(qFamWish, (snap) => {
            setFamilyWishList(snap.docs.map(d => ({ id: d.id, name: d.data().name })));
        });
        return () => unsubscribe();
    }, [currentFamily]);

    const handleAddItem = async (isFamily = false) => {
        const name = newItemName.trim();
        if (!name) return;
        setModalVisible(false);
        try {
            if (isFamily && currentFamily) {
                await addDoc(collection(db, 'family_wishlist'), {
                    name, familyId: currentFamily.id, userId: auth.currentUser?.uid, createdAt: serverTimestamp(),
                });
            } else {
                await addDoc(collection(db, 'wishlist'), {
                    name, userId: auth.currentUser?.uid, createdAt: serverTimestamp(),
                });
            }
            setNewItemName('');
        } catch (e) { showAlert('錯誤', '無法新增項目', 'error'); }
    };

    const handleFamilyAction = async () => {
        if (!inputVal.trim()) return;
        setCreateJoinModalVisible(false);
        try {
            if (familyAction === 'create') {
                const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
                const newFamData = { name: inputVal, inviteCode, creatorId: auth.currentUser?.uid, createdAt: serverTimestamp() };
                const newFamRef = await addDoc(collection(db, 'families'), newFamData);
                await addDoc(collection(db, 'family_members'), { familyId: newFamRef.id, userId: auth.currentUser?.uid });
                await AsyncStorage.setItem('currentFamilyId', newFamRef.id);
                setCurrentFamily({ id: newFamRef.id, name: inputVal, inviteCode });
                isInitialMount.current = false;
                switchMode('family');
                showAlert('建立成功', `歡迎來到 ${inputVal}！`);
            } else {
                const q = query(collection(db, 'families'), where('inviteCode', '==', inputVal.toUpperCase()), limit(1));
                const snap = await getDocs(q);
                if (snap.empty) { showAlert('錯誤', '找不到該邀請碼', 'error'); return; }
                const famId = snap.docs[0].id;
                const famData = snap.docs[0].data() as Family;
                
                // 檢查是否已在家庭中（選填，Firebase 安全規則也可限制）
                await addDoc(collection(db, 'family_members'), { familyId: famId, userId: auth.currentUser?.uid });
                await AsyncStorage.setItem('currentFamilyId', famId);
                setCurrentFamily({ ...famData, id: famId });
                isInitialMount.current = false;
                switchMode('family');
                showAlert('歡迎加入', `已加入 ${famData.name}`);
            }
            setInputVal('');
        } catch (e) { showAlert('錯誤', '操作失敗', 'error'); }
    };

    if (!fontsLoaded || !isDataInitialized) {
        return (
            <View style={[styles.container, { backgroundColor: Colors.bg, justifyContent: 'center' }]}>
                <ActivityIndicator size="large" color={Colors.primary} />
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: Colors.bg }]}>
            {/* Tab 切換 */}
            <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
                <View style={styles.tabContainer}>
                    <Animated.View style={[styles.slidingIndicator, { backgroundColor: Colors.primary, transform: [{ translateX: scrollX }] }]} />
                    <TouchableOpacity style={styles.tabButton} onPress={() => switchMode('self')}>
                        <Text style={[styles.tabText, { color: mode === 'self' ? Colors.primary : Colors.subText }]}>個人清單</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.tabButton} onPress={() => switchMode('family')}>
                        <Text style={[styles.tabText, { color: mode === 'family' ? Colors.primary : Colors.subText }]}>家庭模式</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView contentContainerStyle={[styles.scrollBody, { paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false}>
                {mode === 'self' ? (
                    <View style={[styles.section, { backgroundColor: Colors.card }]}>
                        <View style={styles.sectionHeader}>
                            <Text style={[styles.sectionTitle, { color: Colors.text }]}>我的購買清單 🛒</Text>
                            <TouchableOpacity onPress={() => setModalVisible(true)}>
                                <Ionicons name="add-circle" size={36} color={Colors.primary} />
                            </TouchableOpacity>
                        </View>
                        <View style={styles.listWrapper}>
                            {wishList.length === 0 ? <Text style={styles.emptyHint}>點擊 + 開始新增</Text> : 
                                wishList.map(item => (
                                    <View key={item.id} style={[styles.listItemBubble, { backgroundColor: Colors.itemBg }]}>
                                        <Text style={[styles.itemText, { color: Colors.text }]}>{item.name}</Text>
                                        <TouchableOpacity onPress={() => showConfirm("移除項目", `確定要移除「${item.name}」嗎？`, () => deleteDoc(doc(db, 'wishlist', item.id)))}>
                                            <Ionicons name="close-circle" size={20} color="#CCC" style={{ marginLeft: 8 }} />
                                        </TouchableOpacity>
                                    </View>
                                ))
                            }
                        </View>
                    </View>
                ) : (
                    <View>
                        {!currentFamily ? (
                            <View style={[styles.section, { backgroundColor: Colors.card, alignItems: 'center', paddingVertical: 40 }]}>
                                <Ionicons name="heart-outline" size={60} color={Colors.primary} />
                                <Text style={[styles.sectionTitle, { color: Colors.text, marginTop: 20 }]}>串連家庭成員</Text>
                                <Text style={styles.emptyHint}>同步購物需求，生活更輕鬆</Text>
                                <View style={[styles.row, { marginTop: 30, width: '100%' }]}>
                                    <TouchableOpacity style={[styles.entryBtn, { flex: 1, marginRight: 10 }]} onPress={() => { setFamilyAction('create'); setCreateJoinModalVisible(true); }}>
                                        <Text style={styles.entryBtnText}>建立</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={[styles.entryBtn, { flex: 1, backgroundColor: '#5DADE2' }]} onPress={() => { setFamilyAction('join'); setCreateJoinModalVisible(true); }}>
                                        <Text style={styles.entryBtnText}>加入</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ) : (
                            <View>
                                <View style={[styles.familyHeader, { backgroundColor: Colors.card }]}>
                                    <TouchableOpacity style={styles.familySelector} onPress={() => setFamilyModalVisible(true)}>
                                        <Text style={[styles.familyTitle, { color: Colors.text }]}>{currentFamily.name} ▽</Text>
                                        <Text style={{ color: Colors.subText, fontSize: 12, fontFamily: 'ZenKurenaido' }}>邀請碼: {currentFamily.inviteCode}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => Share.share({ message: `來加入我的家庭「${currentFamily.name}」一起購物吧！邀請碼：${currentFamily.inviteCode}` })}>
                                        <Ionicons name="share-outline" size={24} color={Colors.primary} />
                                    </TouchableOpacity>
                                </View>

                                <View style={[styles.section, { backgroundColor: Colors.card }]}>
                                    <View style={styles.sectionHeader}>
                                        <Text style={[styles.sectionTitle, { color: Colors.text }]}>家庭需購清單 🏠</Text>
                                        <TouchableOpacity onPress={() => setModalVisible(true)}>
                                            <Ionicons name="add-circle" size={36} color={Colors.primary} />
                                        </TouchableOpacity>
                                    </View>
                                    <View style={styles.listWrapperColumn}>
                                        {familyWishList.length === 0 ? <Text style={styles.emptyHint}>目前沒有共同需求</Text> : 
                                            familyWishList.map(item => (
                                                <View key={item.id} style={[styles.listItemRow, { backgroundColor: Colors.itemBg }]}>
                                                    <TouchableOpacity style={styles.deleteIcon} onPress={() => showConfirm("移除項目", `確定要移除「${item.name}」嗎？`, () => deleteDoc(doc(db, 'family_wishlist', item.id)))}>
                                                        <Ionicons name="trash-outline" size={20} color="#FF6F61" />
                                                    </TouchableOpacity>
                                                    <Text style={[styles.itemText, { color: Colors.text, flex: 1 }]}>{item.name}</Text>
                                                    <TouchableOpacity style={styles.checkIcon} onPress={() => showConfirm("完成購買", `確定已買好「${item.name}」並移除？`, () => deleteDoc(doc(db, 'family_wishlist', item.id)))}>
                                                        <Ionicons name="checkmark-circle" size={28} color="#4CAF50" />
                                                    </TouchableOpacity>
                                                </View>
                                            ))
                                        }
                                    </View>
                                </View>
                            </View>
                        )}
                    </View>
                )}
            </ScrollView>

            {/* --- Modals --- */}

            {/* 1. 新增項目 Modal */}
            <Modal animationType="fade" transparent visible={modalVisible}>
                <View style={styles.modalOverlay}>
                    <View style={[styles.bubbleModal, { backgroundColor: Colors.card }]}>
                        <Text style={[styles.modalTitle, { color: Colors.text }]}>想要買什麼？</Text>
                        <TextInput 
                            style={[styles.roundInput, { backgroundColor: Colors.inputBg, color: Colors.text }]} 
                            placeholder="輸入商品名稱..." 
                            placeholderTextColor={Colors.subText}
                            value={newItemName} 
                            onChangeText={setNewItemName} 
                            autoFocus 
                        />
                        <View style={styles.modalButtons}>
                            <TouchableOpacity onPress={() => { setModalVisible(false); setNewItemName(''); }} style={styles.textBtn}>
                                <Text style={[styles.textBtnLabel, { color: Colors.subText }]}>取消</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.pillBtn, { backgroundColor: Colors.primary }]} onPress={() => handleAddItem(mode === 'family')}>
                                <Text style={styles.pillBtnText}>加入</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* 2. 建立/加入家庭 Modal */}
            <Modal animationType="fade" transparent visible={createJoinModalVisible}>
                <View style={styles.modalOverlay}>
                    <View style={[styles.bubbleModal, { backgroundColor: Colors.card }]}>
                        <Text style={[styles.modalTitle, { color: Colors.text }]}>{familyAction === 'create' ? '新的開始' : '輸入邀請碼'}</Text>
                        <TextInput 
                            style={[styles.roundInput, { backgroundColor: Colors.inputBg, color: Colors.text, textAlign: 'center' }]} 
                            placeholder={familyAction === 'create' ? "為家庭取個名字" : "6 位代碼"} 
                            placeholderTextColor={Colors.subText}
                            value={inputVal} 
                            onChangeText={setInputVal} 
                            autoCapitalize={familyAction === 'join' ? "characters" : "none"}
                        />
                        <View style={styles.modalButtons}>
                            <TouchableOpacity onPress={() => { setCreateJoinModalVisible(false); setInputVal(''); }} style={styles.textBtn}>
                                <Text style={[styles.textBtnLabel, { color: Colors.subText }]}>返回</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.pillBtn, { backgroundColor: Colors.primary }]} onPress={handleFamilyAction}>
                                <Text style={styles.pillBtnText}>確認</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* 3. 自定義提示 Alert */}
            <Modal animationType="fade" transparent visible={customAlert.visible}>
                <View style={styles.modalOverlay}>
                    <View style={[styles.alertBubble, { backgroundColor: Colors.card }]}>
                        <View style={[styles.alertIconBg, { backgroundColor: customAlert.type === 'success' ? '#E8F5E9' : '#FFEBEE' }]}>
                            <Ionicons 
                                name={customAlert.type === 'success' ? "happy-outline" : "alert-circle-outline"} 
                                size={44} 
                                color={customAlert.type === 'success' ? "#4CAF50" : Colors.primary} 
                            />
                        </View>
                        <Text style={[styles.alertTitle, { color: Colors.text }]}>{customAlert.title}</Text>
                        <Text style={[styles.alertMessage, { color: Colors.subText }]}>{customAlert.message}</Text>
                        <TouchableOpacity style={[styles.widePillBtn, { backgroundColor: Colors.primary }]} onPress={() => setCustomAlert({ ...customAlert, visible: false })}>
                            <Text style={styles.pillBtnText}>好</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* 4. 自定義確認 Confirm */}
            <Modal animationType="fade" transparent visible={confirmConfig.visible}>
                <View style={styles.modalOverlay}>
                    <View style={[styles.alertBubble, { backgroundColor: Colors.card }]}>
                        <View style={[styles.alertIconBg, { backgroundColor: '#FFF9C4' }]}>
                            <Ionicons name="help-circle-outline" size={44} color="#FBC02D" />
                        </View>
                        <Text style={[styles.alertTitle, { color: Colors.text }]}>{confirmConfig.title}</Text>
                        <Text style={[styles.alertMessage, { color: Colors.subText }]}>{confirmConfig.message}</Text>
                        <View style={styles.modalButtons}>
                            <TouchableOpacity 
                                onPress={() => setConfirmConfig({ ...confirmConfig, visible: false })} 
                                style={[styles.pillBtn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#DDD' }]}
                            >
                                <Text style={[styles.pillBtnText, { color: Colors.subText }]}>取消</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                style={[styles.pillBtn, { backgroundColor: Colors.primary }]} 
                                onPress={() => {
                                    confirmConfig.onConfirm();
                                    setConfirmConfig({ ...confirmConfig, visible: false });
                                }}
                            >
                                <Text style={styles.pillBtnText}>確定</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* 5. 家庭切換 Drawer */}
            <Modal animationType="slide" transparent visible={familyModalVisible}>
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setFamilyModalVisible(false)}>
                    <View style={[styles.drawerModal, { backgroundColor: Colors.card }]}>
                        <View style={styles.drawerHandle} />
                        <Text style={[styles.modalTitle, { color: Colors.text, textAlign: 'center' }]}>我的家庭</Text>
                        <ScrollView style={{ width: '100%', maxHeight: 300 }}>
                            {families.map(f => (
                                <TouchableOpacity 
                                    key={f.id}
                                    style={[styles.familyRow, currentFamily?.id === f.id && { backgroundColor: Colors.itemBg }]} 
                                    onPress={async () => {
                                        setCurrentFamily(f);
                                        await AsyncStorage.setItem('currentFamilyId', f.id);
                                        setFamilyModalVisible(false);
                                    }}
                                >
                                    <Text style={[styles.familyRowText, { color: Colors.text }]}>{f.name}</Text>
                                    {currentFamily?.id === f.id && <Ionicons name="checkmark-circle" size={24} color={Colors.primary} />}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                        <TouchableOpacity style={[styles.entryBtn, { marginTop: 20, borderRadius: 20 }]} onPress={() => { setFamilyModalVisible(false); setCreateJoinModalVisible(true); setFamilyAction('join'); }}>
                            <Text style={styles.entryBtnText}>+ 加入或建立</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { paddingHorizontal: 20, zIndex: 10 },
    tabContainer: { flexDirection: 'row', height: 50, borderRadius: 25, backgroundColor: 'rgba(0,0,0,0.05)', position: 'relative', overflow: 'hidden', padding: 4 },
    tabButton: { flex: 1, justifyContent: 'center', alignItems: 'center', zIndex: 2 },
    tabText: { fontSize: 16, fontFamily: 'ZenKurenaido' },
    slidingIndicator: { position: 'absolute', width: '48%', height: '85%', top: '7.5%', borderRadius: 22, opacity: 0.15 },
    scrollBody: { padding: 20 },
    section: { padding: 25, borderRadius: 35, marginBottom: 20, elevation: 4, shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    sectionTitle: { fontSize: 24, fontFamily: 'ZenKurenaido' },
    listWrapper: { flexDirection: 'row', flexWrap: 'wrap' },
    listWrapperColumn: { flexDirection: 'column' },
    listItemBubble: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 25, marginRight: 10, marginBottom: 10 },
    listItemRow: { flexDirection: 'row', alignItems: 'center', padding: 15, borderRadius: 20, marginBottom: 10 },
    itemText: { fontSize: 18, fontFamily: 'ZenKurenaido' },
    deleteIcon: { marginRight: 15 },
    checkIcon: { marginLeft: 10 },
    emptyHint: { color: '#AAA', fontFamily: 'ZenKurenaido', fontSize: 16, textAlign: 'center', width: '100%', marginTop: 10 },
    row: { flexDirection: 'row', justifyContent: 'space-between' },
    familyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderRadius: 25, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
    familySelector: { flex: 1 },
    familyTitle: { fontSize: 22, fontFamily: 'ZenKurenaido' },
    
    // --- Modal 樣式 ---
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    bubbleModal: { width: '85%', padding: 30, borderRadius: 45, alignItems: 'center', elevation: 10 },
    drawerModal: { width: '100%', position: 'absolute', bottom: 0, padding: 30, borderTopLeftRadius: 40, borderTopRightRadius: 40, elevation: 20 },
    drawerHandle: { width: 40, height: 4, backgroundColor: '#DDD', borderRadius: 2, alignSelf: 'center', marginBottom: 15 },
    alertBubble: { width: '80%', padding: 30, borderRadius: 50, alignItems: 'center', elevation: 15 },
    alertIconBg: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
    
    modalTitle: { fontSize: 22, fontFamily: 'ZenKurenaido', marginBottom: 20 },
    alertTitle: { fontSize: 22, fontFamily: 'ZenKurenaido', marginBottom: 10 },
    alertMessage: { fontSize: 16, fontFamily: 'ZenKurenaido', textAlign: 'center', marginBottom: 25, lineHeight: 22 },
    
    roundInput: { width: '100%', padding: 18, borderRadius: 25, fontFamily: 'ZenKurenaido', marginBottom: 25, fontSize: 18 },
    modalButtons: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', alignItems: 'center' },
    textBtn: { padding: 10 },
    textBtnLabel: { fontFamily: 'ZenKurenaido', fontSize: 16 },
    pillBtn: { paddingVertical: 14, paddingHorizontal: 35, borderRadius: 25, elevation: 2 },
    widePillBtn: { width: '100%', paddingVertical: 16, borderRadius: 25, alignItems: 'center' },
    pillBtnText: { color: '#fff', fontFamily: 'ZenKurenaido', fontSize: 16 },
    
    familyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18, borderRadius: 20, marginBottom: 5 },
    familyRowText: { fontSize: 18, fontFamily: 'ZenKurenaido' },
    entryBtn: { backgroundColor: '#FF6F61', paddingVertical: 16, borderRadius: 25, alignItems: 'center' },
    entryBtnText: { color: '#fff', fontFamily: 'ZenKurenaido',  fontSize: 16 }
});