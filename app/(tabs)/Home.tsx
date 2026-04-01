import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    Dimensions,
    Keyboard,
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
    const [mode, setMode] = useState<'self' | 'family'>('self');
    const [wishList, setWishList] = useState<WishItem[]>([]);
    const [familyWishList, setFamilyWishList] = useState<WishItem[]>([]);
    const [families, setFamilies] = useState<Family[]>([]);
    const [currentFamily, setCurrentFamily] = useState<Family | null>(null);
    const [loading, setLoading] = useState(true);

    // Modals 狀態
    const [modalVisible, setModalVisible] = useState(false);
    const [familyModalVisible, setFamilyModalVisible] = useState(false);
    const [createJoinModalVisible, setCreateJoinModalVisible] = useState(false);
    
    // 美化版 Alert 狀態
    const [customAlert, setCustomAlert] = useState({ visible: false, title: '', message: '', type: 'success' as 'success' | 'error' });

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

    // 輔助函式：切換模式並執行動畫
    const switchMode = (target: 'self' | 'family') => {
        setMode(target);
        Animated.spring(scrollX, {
            toValue: target === 'self' ? 0 : width,
            useNativeDriver: true,
            friction: 8,
        }).start();
    };

    // 輔助函式：顯示美化 Alert
    const showAlert = (title: string, message: string, type: 'success' | 'error' = 'success') => {
        setCustomAlert({ visible: true, title, message, type });
    };

    // --- 1. 資料監聽 ---
    useEffect(() => {
        if (!auth.currentUser) return;

        const qSelf = query(collection(db, 'wishlist'), where('userId', '==', auth.currentUser.uid), orderBy('createdAt', 'desc'));
        const unsubSelf = onSnapshot(qSelf, (snap) => {
            setWishList(snap.docs.map(d => ({ id: d.id, name: d.data().name })));
            setLoading(false);
        });

        const qFamMember = query(collection(db, 'family_members'), where('userId', '==', auth.currentUser.uid));
        const unsubFam = onSnapshot(qFamMember, async (snap) => {
            const fams: Family[] = [];
            for (const memberDoc of snap.docs) {
                const fId = memberDoc.data().familyId;
                const fSnap = await getDocs(query(collection(db, 'families'), where('id', '==', fId)));
                fSnap.forEach(d => fams.push({ id: d.id, ...d.data() } as Family));
            }
            setFamilies(fams);
            if (fams.length > 0 && !currentFamily) setCurrentFamily(fams[0]);
        });

        return () => { unsubSelf(); unsubFam(); };
    }, []);

    useEffect(() => {
        if (!currentFamily) { setFamilyWishList([]); return; }
        const qFamWish = query(collection(db, 'family_wishlist'), where('familyId', '==', currentFamily.id), orderBy('createdAt', 'desc'));
        return onSnapshot(qFamWish, (snap) => {
            setFamilyWishList(snap.docs.map(d => ({ id: d.id, name: d.data().name })));
        });
    }, [currentFamily]);

    // --- 2. 邏輯處理 ---
    const handleAddItem = async (isFamily = false) => {
        const name = newItemName.trim();
        if (!name) return;
        setModalVisible(false);
        Keyboard.dismiss();
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
                const newFamRef = await addDoc(collection(db, 'families'), {
                    name: inputVal, inviteCode, creatorId: auth.currentUser?.uid, createdAt: serverTimestamp()
                });
                await addDoc(collection(db, 'family_members'), { familyId: newFamRef.id, userId: auth.currentUser?.uid });
                
                // 成功後邏輯：更新當前家庭並切換頁面
                setCurrentFamily({ id: newFamRef.id, name: inputVal, inviteCode });
                showAlert('建立成功', `您的邀請碼是: ${inviteCode}`);
                switchMode('family'); 
            } else {
                const q = query(collection(db, 'families'), where('inviteCode', '==', inputVal.toUpperCase()), limit(1));
                const snap = await getDocs(q);
                if (snap.empty) { showAlert('錯誤', '找不到該邀請碼，請檢查輸入是否正確', 'error'); return; }
                
                const famId = snap.docs[0].id;
                const famData = snap.docs[0].data() as Family;
                await addDoc(collection(db, 'family_members'), { familyId: famId, userId: auth.currentUser?.uid });
                
                setCurrentFamily({ ...famData, id: famId });
                showAlert('歡迎加入', `已成功加入 ${famData.name}`);
                switchMode('family');
            }
            setInputVal('');
        } catch (e) { showAlert('錯誤', '操作失敗，請稍後再試', 'error'); }
    };

    const translateX = scrollX.interpolate({ inputRange: [0, width], outputRange: [0, width / 2] });

    return (
        <View style={[styles.container, { backgroundColor: Colors.bg }]}>
            {/* 頂部切換 Tab */}
            <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
                <View style={styles.tabContainer}>
                    <Animated.View style={[styles.slidingIndicator, { backgroundColor: Colors.primary, transform: [{ translateX }] }]} />
                    <TouchableOpacity style={styles.tabButton} onPress={() => switchMode('self')}>
                        <Text style={[styles.tabText, { color: mode === 'self' ? Colors.primary : Colors.subText }]}>個人模式</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.tabButton} onPress={() => switchMode('family')}>
                        <Text style={[styles.tabText, { color: mode === 'family' ? Colors.primary : Colors.subText }]}>家庭模式</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView contentContainerStyle={[styles.scrollBody, { paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false}>
                {mode === 'self' ? (
                    <View>
                        <View style={[styles.section, { backgroundColor: Colors.card }]}>
                            <View style={styles.sectionHeader}>
                                <Text style={[styles.sectionTitle, { color: Colors.text }]}>購買清單🛒</Text>
                                <TouchableOpacity onPress={() => { setFamilyAction(null); setModalVisible(true); }}>
                                    <Ionicons name="add-circle" size={32} color={Colors.primary} />
                                </TouchableOpacity>
                            </View>
                            {loading ? <ActivityIndicator color={Colors.primary} /> : (
                                <View style={styles.listWrapper}>
                                    {wishList.map(item => (
                                        <View key={item.id} style={[styles.listItemBubble, { backgroundColor: Colors.itemBg }]}>
                                            <Text style={[styles.itemText, { color: Colors.text }]}>{item.name}</Text>
                                            <TouchableOpacity onPress={() => deleteDoc(doc(db, 'wishlist', item.id))}>
                                                <Ionicons name="close-circle" size={20} color="#CCC" />
                                            </TouchableOpacity>
                                        </View>
                                    ))}
                                </View>
                            )}
                        </View>
                        <View style={styles.row}>
                            <View style={[styles.bubbleCard, { backgroundColor: Colors.card }]}><Ionicons name="notifications" size={22} color={Colors.accent} /><Text style={[styles.cardTitle, { color: Colors.text }]}>預購牆</Text></View>
                            <View style={[styles.bubbleCard, { backgroundColor: Colors.card }]}><Ionicons name="timer-outline" size={22} color={Colors.primary} /><Text style={[styles.cardTitle, { color: Colors.text }]}>到期提醒</Text></View>
                        </View>
                    </View>
                ) : (
                    <View>
                        {!currentFamily ? (
                            <View style={[styles.section, { backgroundColor: Colors.card, alignItems: 'center', paddingVertical: 40 }]}>
                                <Ionicons name="people" size={60} color={Colors.primary} />
                                <Text style={[styles.sectionTitle, { color: Colors.text, marginTop: 20 }]}>尚未加入家庭</Text>
                                <View style={[styles.row, { marginTop: 20 }]}>
                                    <TouchableOpacity style={[styles.entryBtn, { marginRight: 10 }]} onPress={() => { setFamilyAction('create'); setCreateJoinModalVisible(true); }}>
                                        <Text style={styles.entryBtnText}>建立家庭</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={[styles.entryBtn, { backgroundColor: '#5DADE2' }]} onPress={() => { setFamilyAction('join'); setCreateJoinModalVisible(true); }}>
                                        <Text style={styles.entryBtnText}>加入家庭</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ) : (
                            <View>
                                <View style={[styles.familyHeader, { backgroundColor: Colors.card }]}>
                                    <TouchableOpacity style={styles.familySelector} onPress={() => setFamilyModalVisible(true)}>
                                        <Text style={[styles.familyTitle, { color: Colors.text }]}>{currentFamily.name} ▽</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => Share.share({ message: `快加入我的家庭「${currentFamily.name}」，邀請碼：${currentFamily.inviteCode}` })}>
                                        <Ionicons name="share-outline" size={24} color={Colors.primary} />
                                    </TouchableOpacity>
                                </View>

                                <View style={[styles.section, { backgroundColor: Colors.card }]}>
                                    <Text style={[styles.sectionTitle, { color: Colors.text, fontSize: 18 }]}>即時動態牆 ✨</Text>
                                    <View style={styles.emptyContent}>
                                        <Text style={{ color: Colors.subText, fontFamily: 'ZenKurenaido' }}>目前尚無動態</Text>
                                    </View>
                                </View>

                                <View style={[styles.section, { backgroundColor: Colors.card }]}>
                                    <View style={styles.sectionHeader}>
                                        <Text style={[styles.sectionTitle, { color: Colors.text }]}>家庭需購清單 🏠</Text>
                                        <TouchableOpacity onPress={() => setModalVisible(true)}>
                                            <Ionicons name="add-circle" size={32} color={Colors.primary} />
                                        </TouchableOpacity>
                                    </View>
                                    <View style={styles.listWrapper}>
                                        {familyWishList.map(item => (
                                            <View key={item.id} style={[styles.listItemBubble, { backgroundColor: Colors.itemBg }]}>
                                                <Text style={[styles.itemText, { color: Colors.text }]}>{item.name}</Text>
                                                <TouchableOpacity onPress={() => deleteDoc(doc(db, 'family_wishlist', item.id))}>
                                                    <Ionicons name="close-circle" size={20} color="#CCC" />
                                                </TouchableOpacity>
                                            </View>
                                        ))}
                                    </View>
                                </View>
                            </View>
                        )}
                    </View>
                )}
            </ScrollView>

            {/* --- 美化版 Modals --- */}

            {/* 美化 Alert (取代 Alert.alert) */}
            <Modal animationType="fade" transparent visible={customAlert.visible}>
                <View style={styles.modalOverlay}>
                    <View style={[styles.alertCard, { backgroundColor: Colors.card }]}>
                        <Ionicons 
                            name={customAlert.type === 'success' ? "checkmark-circle" : "alert-circle"} 
                            size={50} 
                            color={customAlert.type === 'success' ? "#4CAF50" : Colors.primary} 
                        />
                        <Text style={[styles.modalTitle, { color: Colors.text, marginTop: 10 }]}>{customAlert.title}</Text>
                        <Text style={[styles.alertMsg, { color: Colors.subText }]}>{customAlert.message}</Text>
                        <TouchableOpacity 
                            style={[styles.confirmBtn, { backgroundColor: Colors.primary, width: '100%', marginLeft: 0, marginTop: 10 }]} 
                            onPress={() => setCustomAlert({ ...customAlert, visible: false })}
                        >
                            <Text style={styles.confirmBtnText}>知道了</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* 通用新增 Modal */}
            <Modal animationType="slide" transparent visible={modalVisible}>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: Colors.card }]}>
                        <Text style={[styles.modalTitle, { color: Colors.text }]}>想要買什麼？</Text>
                        <TextInput style={[styles.input, { backgroundColor: Colors.inputBg, color: Colors.text }]} placeholder="例如：鮮乳" value={newItemName} onChangeText={setNewItemName} autoFocus />
                        <View style={styles.modalButtons}>
                            <TouchableOpacity onPress={() => setModalVisible(false)}><Text style={{ color: Colors.subText, fontFamily: 'ZenKurenaido' }}>取消</Text></TouchableOpacity>
                            <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: Colors.primary }]} onPress={() => handleAddItem(mode === 'family')}>
                                <Text style={styles.confirmBtnText}>加入清單</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* 建立/加入家庭 Modal */}
            <Modal animationType="fade" transparent visible={createJoinModalVisible}>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: Colors.card }]}>
                        <Text style={[styles.modalTitle, { color: Colors.text }]}>{familyAction === 'create' ? '建立家庭' : '加入家庭'}</Text>
                        <TextInput 
                            style={[styles.input, { backgroundColor: Colors.inputBg, color: Colors.text }]} 
                            placeholder={familyAction === 'create' ? "請輸入家庭名稱" : "請輸入 6 位邀請碼"} 
                            value={inputVal} 
                            onChangeText={setInputVal} 
                            autoCapitalize={familyAction === 'join' ? "characters" : "none"}
                        />
                        <View style={styles.modalButtons}>
                            <TouchableOpacity onPress={() => setCreateJoinModalVisible(false)}><Text style={{ color: Colors.subText, fontFamily: 'ZenKurenaido' }}>取消</Text></TouchableOpacity>
                            <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: Colors.primary }]} onPress={handleFamilyAction}>
                                <Text style={styles.confirmBtnText}>確定</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* 家庭切換 Modal */}
            <Modal animationType="fade" transparent visible={familyModalVisible}>
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setFamilyModalVisible(false)}>
                    <View style={[styles.modalContent, { backgroundColor: Colors.card }]}>
                        <Text style={[styles.modalTitle, { color: Colors.text }]}>切換家庭</Text>
                        {families.map(f => (
                            <TouchableOpacity key={f.id} style={styles.familyItem} onPress={() => { setCurrentFamily(f); setFamilyModalVisible(false); }}>
                                <Text style={{ color: Colors.text, fontFamily: 'ZenKurenaido', fontSize: 18 }}>{f.name}</Text>
                                {currentFamily?.id === f.id && <Ionicons name="checkmark-circle" size={24} color={Colors.primary} />}
                            </TouchableOpacity>
                        ))}
                        <TouchableOpacity style={[styles.entryBtn, { width: '100%', marginTop: 20 }]} onPress={() => { setFamilyModalVisible(false); setCreateJoinModalVisible(true); setFamilyAction('join'); }}>
                            <Text style={styles.entryBtnText}>+ 加入/建立新家庭</Text>
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
    tabContainer: { flexDirection: 'row', height: 50, borderRadius: 30, backgroundColor: 'rgba(0,0,0,0.05)', position: 'relative', overflow: 'hidden', padding: 4 },
    tabButton: { flex: 1, justifyContent: 'center', alignItems: 'center', zIndex: 2 },
    tabText: { fontSize: 16, fontFamily: 'ZenKurenaido', fontWeight: 'bold' },
    slidingIndicator: { position: 'absolute', width: '48%', height: '85%', top: '7.5%', borderRadius: 25, opacity: 0.15 },
    scrollBody: { padding: 20 },
    section: { padding: 20, borderRadius: 35, marginBottom: 20, elevation: 4, shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 5 } },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
    sectionTitle: { fontSize: 22, fontFamily: 'ZenKurenaido', fontWeight: '700' },
    listWrapper: { flexDirection: 'row', flexWrap: 'wrap' },
    listItemBubble: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 25, marginRight: 8, marginBottom: 8 },
    itemText: { fontSize: 16, fontFamily: 'ZenKurenaido', marginRight: 8 },
    row: { flexDirection: 'row', justifyContent: 'space-between' },
    bubbleCard: { width: '48%', padding: 20, borderRadius: 30, alignItems: 'center', elevation: 2 },
    cardTitle: { fontSize: 16, fontFamily: 'ZenKurenaido', marginTop: 8 },
    familyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18, borderRadius: 30, marginBottom: 20 },
    familyTitle: { fontSize: 20, fontFamily: 'ZenKurenaido', fontWeight: 'bold' },
    familyItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', paddingVertical: 15, borderBottomWidth: 0.5, borderBottomColor: '#EEE' },
    emptyContent: { alignItems: 'center', paddingVertical: 20 },
    familySelector: { 
    paddingVertical: 5, 
    paddingHorizontal: 10 
  },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    modalContent: { width: '85%', padding: 30, borderRadius: 35, alignItems: 'center' },
    alertCard: { width: '80%', padding: 30, borderRadius: 35, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
    alertMsg: { fontSize: 16, fontFamily: 'ZenKurenaido', textAlign: 'center', marginTop: 10, marginBottom: 20 },
    modalTitle: { fontSize: 22, fontFamily: 'ZenKurenaido', fontWeight: 'bold', textAlign: 'center' },
    input: { width: '100%', padding: 18, borderRadius: 22, fontFamily: 'ZenKurenaido', marginBottom: 25, fontSize: 16 },
    modalButtons: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', alignItems: 'center' },
    confirmBtn: { flex: 1, paddingVertical: 16, borderRadius: 22, alignItems: 'center', marginLeft: 20 },
    confirmBtnText: { color: '#fff', fontFamily: 'ZenKurenaido', fontWeight: 'bold', fontSize: 16 },
    entryBtn: { backgroundColor: '#FF6F61', paddingHorizontal: 25, paddingVertical: 14, borderRadius: 30, alignItems: 'center' },
    entryBtnText: { color: '#fff', fontFamily: 'ZenKurenaido', fontWeight: 'bold' }
});