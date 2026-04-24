import { useFonts, ZenKurenaido_400Regular } from '@expo-google-fonts/zen-kurenaido';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useEffect, useRef, useState } from 'react';
// ⭐ 新增這行
import * as Haptics from 'expo-haptics';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Dimensions,
    Linking,
    Modal,
    Platform,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    UIManager,
    useColorScheme,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// 通知相關
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

// Firebase
import { onAuthStateChanged } from 'firebase/auth';
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    where
} from 'firebase/firestore';
import { auth, db } from './firebaseConfig';

// Moti 動畫
import { AnimatePresence, MotiView } from 'moti';

// 設定通知行為（App 在前台時也要彈出）
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,   // 為了相容性建議保留
    shouldPlaySound: true,
    shouldSetBadge: false,
    // 💡 補上這兩行以符合新版 TypeScript 定義
    shouldShowBanner: true, 
    shouldShowList: true,
  }),
});

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width } = Dimensions.get('window');

// --- Interfaces ---
interface WishItem { id: string; name: string; createdAt?: any; category?: 'shopping' | 'preorder'; }
interface PreorderItem extends WishItem {
    targetDate?: string;
    targetTime?: string;
    link?: string;
}
interface Family { id: string; name: string; inviteCode: string; }
interface Activity {
    id: string;
    type: 'self' | 'family' | 'owned' | 'preorder';
    itemName: string;
    time: number;
}

export default function Home() {
    let [fontsLoaded] = useFonts({ ZenKurenaido: ZenKurenaido_400Regular });

    const [mode, setMode] = useState<'self' | 'family'>('self');
    const [wishList, setWishList] = useState<WishItem[]>([]);
    const [familyWishList, setFamilyWishList] = useState<WishItem[]>([]);
    const [productActivities, setProductActivities] = useState<Activity[]>([]); 
    const [activities, setActivities] = useState<Activity[]>([]); 
    const [families, setFamilies] = useState<Family[]>([]);
    const [currentFamily, setCurrentFamily] = useState<Family | null>(null);
    const [isDataInitialized, setIsDataInitialized] = useState(false);

    // Modal 狀態
    const [modalType, setModalType] = useState<'shopping' | 'preorder'>('shopping');
    const [modalVisible, setModalVisible] = useState(false);
    const [newItemName, setNewItemName] = useState('');
    const [dateValue, setDateValue] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [preorderLink, setPreorderLink] = useState('');
    
    const [familyModalVisible, setFamilyModalVisible] = useState(false);
    const [familyAction, setFamilyAction] = useState<'create' | 'join'>('create');
    const [familyInput, setFamilyInput] = useState('');

    const isDarkMode = useColorScheme() === 'dark';
    const insets = useSafeAreaInsets();
    const scrollX = useRef(new Animated.Value(0)).current;

    const Colors = {
        bg: isDarkMode ? '#0F172A' : '#FBFBFF',
        card: isDarkMode ? '#1E293B' : '#FFFFFF',
        text: isDarkMode ? '#F8FAFC' : '#1E293B',
        subText: isDarkMode ? '#94A3B8' : '#64748B',
        primary: '#FF6F61',
        familyAccent: '#6366F1',
        selfAccent: '#10B981',
        preorderAccent: '#F43F5E',
        inputBg: isDarkMode ? '#2C2C2C' : '#F1F5F9',
    };
    const [inAppNotice, setInAppNotice] = useState<{
        text: string;
        type: 'success' | 'info';
    } | null>(null);
    const noticeAnim = useRef(new Animated.Value(0)).current;

    // --- 通知權限與監聽器 ---
    useEffect(() => {
        registerForPushNotificationsAsync();

        // 監聽使用者點擊通知
        const responseListener = Notifications.addNotificationResponseReceivedListener(response => {
            console.log('User clicked notification:', response);
        });

        return () => {
            // ✅ 修正：直接呼叫監聽器的 remove 方法
            responseListener.remove();
        };
    }, []);

    const registerForPushNotificationsAsync = async () => {
        if (Device.isDevice) {
            const { status: existingStatus } = await Notifications.getPermissionsAsync();
            let finalStatus = existingStatus;
            if (existingStatus !== 'granted') {
                const { status } = await Notifications.requestPermissionsAsync();
                finalStatus = status;
            }
            if (finalStatus !== 'granted') {
                console.log('Failed to get push token for push notification!');
                return;
            }
        } else {
            console.log('Must use physical device for Push Notifications');
        }

        if (Platform.OS === 'android') {
            Notifications.setNotificationChannelAsync('default', {
                name: 'default',
                importance: Notifications.AndroidImportance.MAX,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#FF231F7C',
            });
        }
    };

    // 排程本地通知功能
    const schedulePreorderNotification = async (itemName: string, date: Date) => {
        const triggerTime = date.getTime();
        const now = Date.now();

        if (triggerTime <= now) return;

        await Notifications.scheduleNotificationAsync({
            content: {
                title: "⏰ 預購提醒",
                body: `🛒 ${itemName}\n即將開賣！記得搶購 ✨`,
                data: { itemName },
            },
            trigger: {
                type: Notifications.SchedulableTriggerInputTypes.DATE,
                date: date,
            },
        });

        // ⭐ App內通知 + 動畫 + 震動
        setInAppNotice({
            text: `⏰ ${itemName} 即將開賣！`,
            type: 'info'
        });

        Animated.sequence([
            Animated.timing(noticeAnim, {
                toValue: 1,
                duration: 300,
                useNativeDriver: true,
            }),
            Animated.delay(2500),
            Animated.timing(noticeAnim, {
                toValue: 0,
                duration: 300,
                useNativeDriver: true,
            })
        ]).start(() => setInAppNotice(null));

        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    };

    const switchMode = (target: 'self' | 'family') => {
        setMode(target);
        Animated.spring(scrollX, {
            toValue: target === 'self' ? 0 : width / 2 - 24,
            useNativeDriver: true,
            friction: 8,
        }).start();
    };

    // Firebase 監聽 (保持原樣)
    useEffect(() => {
        let unsubSelf: (() => void) | undefined;
        let unsubFamMembers: (() => void) | undefined;
        let unsubProducts: (() => void) | undefined;

        const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
            if (!user) { setIsDataInitialized(true); return; }

            const qSelf = query(collection(db, 'wishlist'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
            unsubSelf = onSnapshot(qSelf, (snap) => {
                setWishList(snap.docs.map(d => ({ id: d.id, ...d.data() } as WishItem)));
            });

            const qProducts = query(collection(db, 'products'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
            unsubProducts = onSnapshot(qProducts, (snap) => {
                const prods = snap.docs.map(d => ({
                    id: d.id,
                    type: d.data().type,
                    itemName: d.data().name,
                    time: d.data().createdAt?.toMillis() || Date.now()
                } as Activity));
                setProductActivities(prods);
            });

            const qFamMember = query(collection(db, 'family_members'), where('userId', '==', user.uid));
            unsubFamMembers = onSnapshot(qFamMember, async (snap) => {
                if (snap.empty) { 
                    setFamilies([]); 
                    setCurrentFamily(null); 
                    setIsDataInitialized(true); 

                    // ⭐ 清掉殘留 familyId
                    await AsyncStorage.removeItem('currentFamilyId');

                    return; 
                }
                const famIds = Array.from(new Set(
                snap.docs
                    .map(d => d.data().familyId)
                    .filter(id => id && id.trim() !== "")
                ));
                const famDataList: Family[] = await Promise.all(
                famIds.map(async (fId) => {
                    const snap = await getDoc(doc(db, 'families', fId));
                    if (!snap.exists()) return null;

                    return {
                    id: snap.id,
                    ...snap.data()
                    } as Family;
                })
                ).then(res => res.filter(Boolean) as Family[]);
                setFamilies(famDataList);
                const savedId = await AsyncStorage.getItem('currentFamilyId');
                let targetFamily = famDataList.find(f => f.id === savedId);

                // ❗ 如果 AsyncStorage 裡的 ID 已經失效（被刪掉的家庭）
                if (!targetFamily && famDataList.length > 0) {
                    targetFamily = famDataList[0];

                    // ⭐ 關鍵：同步更新 AsyncStorage（避免一直抓舊的）
                    await AsyncStorage.setItem('currentFamilyId', targetFamily.id);
                }
                if (!targetFamily || !famDataList.find(f => f.id === savedId)) {
                await AsyncStorage.setItem('currentFamilyId', targetFamily?.id || '');
                }
                console.log("🏠 families:", famDataList.map(f => f.id));
                console.log("💾 savedId:", savedId);
                console.log("🔥 famDataList:", famDataList.map(f => f.id));
                console.log("🎯 targetFamily:", targetFamily?.id);              

                const finalFamily = targetFamily || famDataList[0] || null;
                setCurrentFamily(finalFamily);

                if (finalFamily) {
                    await AsyncStorage.setItem('currentFamilyId', finalFamily.id);
                }
                setIsDataInitialized(true);
            });
        });
        return () => { unsubscribeAuth(); unsubSelf?.(); unsubFamMembers?.(); unsubProducts?.(); };
    }, []);

    useEffect(() => {
        if (!currentFamily) { setFamilyWishList([]); return; }
        console.log("👀 currentFamily:", currentFamily.id);
        const qFamWish = query(collection(db, 'family_wishlist'), where('familyId', '==', currentFamily.id), orderBy('createdAt', 'desc'));
        return onSnapshot(qFamWish, (snap) => {
            setFamilyWishList(snap.docs.map(d => ({ id: d.id, ...d.data() } as WishItem)));
        });
    }, [currentFamily]);

    useEffect(() => {
        const selfActs: Activity[] = wishList.map(item => ({ 
            id: `act-s-${item.id}`, type: 'self', itemName: item.name, time: item.createdAt?.toMillis() || Date.now() 
        }));
        const famActs: Activity[] = familyWishList.map(item => ({ 
            id: `act-f-${item.id}`, type: 'family', itemName: item.name, time: item.createdAt?.toMillis() || Date.now() 
        }));
        const allActivities = [...selfActs, ...famActs, ...productActivities].sort((a, b) => b.time - a.time).slice(0, 10);
        setActivities(allActivities);
    }, [wishList, familyWishList, productActivities]);

    // --- 功能函式 ---
    const handleAddItem = async () => {
        const name = newItemName.trim();
        if (!name) return;
        setModalVisible(false);
        try {
            const isFamily = mode === 'family';
            const coll = isFamily ? 'family_wishlist' : 'wishlist';
            const data: any = { 
                name, 
                userId: auth.currentUser?.uid, 
                createdAt: serverTimestamp(),
                category: modalType 
            };
            
            if (modalType === 'preorder') {
                data.targetDate = `${(dateValue.getMonth() + 1).toString().padStart(2, '0')}/${dateValue.getDate().toString().padStart(2, '0')}`;
                data.targetTime = `${dateValue.getHours().toString().padStart(2, '0')}:${dateValue.getMinutes().toString().padStart(2, '0')}`;
                data.link = preorderLink;

                // 【核心新增】排程本地通知
                await schedulePreorderNotification(name, dateValue);
                setInAppNotice({
                    text: `已成功設定 ${data.targetDate} ${data.targetTime} 的提醒 ⏰`,
                    type: 'success'
                });

                Animated.sequence([
                    Animated.timing(noticeAnim, {
                        toValue: 1,
                        duration: 300,
                        useNativeDriver: true,
                    }),
                    Animated.delay(2500),
                    Animated.timing(noticeAnim, {
                        toValue: 0,
                        duration: 300,
                        useNativeDriver: true,
                    })
                ]).start(() => setInAppNotice(null));

                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }

            if (isFamily && currentFamily) data.familyId = currentFamily.id;
            await addDoc(collection(db, coll), data);
            
            setNewItemName(''); setDateValue(new Date()); setPreorderLink('');
        } catch (e) { console.error(e); }
    };

    const onDateChange = (event: any, selectedDate?: Date) => {
        setShowDatePicker(Platform.OS === 'ios');
        if (selectedDate) setDateValue(selectedDate);
    };

    const onTimeChange = (event: any, selectedDate?: Date) => {
        setShowTimePicker(Platform.OS === 'ios');
        if (selectedDate) setDateValue(selectedDate);
    };

    const handleShareList = (list: WishItem[], title: string) => {
        const shoppingList = list.filter(i => i.category !== 'preorder');
        if (shoppingList.length === 0) {
            Alert.alert("清單是空的", "請先加入商品再分享唷！");
            return;
        }
        const text = `📝 ${title}：\n` + shoppingList.map((item, index) => `${index + 1}. ${item.name}`).join('\n');
        Share.share({ message: text });
    };

    const handleFamilyAction = async () => {
        const input = familyInput.trim();
        if (!input || !auth.currentUser) return;
        try {
            if (familyAction === 'create') {
                const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
                const famRef = await addDoc(collection(db, 'families'), { name: input, inviteCode, ownerId: auth.currentUser.uid, createdAt: serverTimestamp() });
                await addDoc(collection(db, 'family_members'), { familyId: famRef.id, userId: auth.currentUser.uid, joinedAt: serverTimestamp() });
                await AsyncStorage.setItem('currentFamilyId', famRef.id);
            } else {
                const q = query(collection(db, 'families'), where('inviteCode', '==', input));
                const snap = await getDocs(q);
                if (snap.empty) { Alert.alert("錯誤", "找不到該邀請碼"); return; }
                const targetFamId = snap.docs[0].id;
                await addDoc(collection(db, 'family_members'), { familyId: targetFamId, userId: auth.currentUser.uid, joinedAt: serverTimestamp() });
                await AsyncStorage.setItem('currentFamilyId', targetFamId);
            }
            setFamilyModalVisible(false); setFamilyInput('');
        } catch (e) { Alert.alert("失敗", "操作錯誤"); }
    };

    const openLink = (url?: string) => {
        if (url) Linking.openURL(url).catch(() => Alert.alert("錯誤", "無法開啟網址"));
    };

    const getTagConfig = (type: string) => {
        switch(type) {
            case 'self': return { label: '個人心願', color: Colors.primary };
            case 'family': return { label: '家庭需購', color: Colors.familyAccent };
            case 'owned': return { label: '新入手', color: Colors.selfAccent };
            case 'preorder': return { label: '新預購', color: Colors.preorderAccent };
            default: return { label: '更新', color: Colors.subText };
        }
    };

    if (!fontsLoaded || !isDataInitialized) return (
        <View style={{flex:1, justifyContent:'center', backgroundColor:Colors.bg}}>
            <ActivityIndicator size="large" color={Colors.primary}/>
        </View>
    );

    // --- 輔助組件：清單區塊 ---
    const WishSection = ({ title, items, onAdd, onShare, collName }: any) => {
        const shoppingItems = items.filter((i: any) => i.category !== 'preorder');
        const preorderItems = items.filter((i: any) => i.category === 'preorder');

        return (
            <View style={[styles.mainCard, { backgroundColor: Colors.card, marginBottom: 20 }]}>
                <View style={styles.cardHeader}>
                    <Text style={[styles.cardTitle, { color: Colors.text }]}>{title}</Text>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                        <TouchableOpacity onPress={onShare}>
                            <Ionicons name="share-outline" size={28} color={Colors.subText} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={onAdd}>
                            <Ionicons name="add-circle" size={42} color={mode === 'self' ? Colors.primary : Colors.familyAccent} />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* 1. 購買備忘錄 */}
                <Text style={[styles.subSectionTitle, { color: Colors.subText }]}>🛒 購買清單 (備忘錄)</Text>
                <View style={styles.wishGrid}>
                    {shoppingItems.map((item: any) => (
                        <MotiView key={item.id} from={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} style={[styles.wishBubble, { backgroundColor: isDarkMode ? '#2C3E50' : '#F1F5F9' }]}>
                            <Text style={[styles.itemText, { color: Colors.text }]}>{item.name}</Text>
                            <TouchableOpacity onPress={() => deleteDoc(doc(db, collName, item.id))} style={{marginLeft: 8}}>
                                <Ionicons name="close-circle" size={18} color="#CBD5E1" />
                            </TouchableOpacity>
                        </MotiView>
                    ))}
                    {shoppingItems.length === 0 && <Text style={styles.emptyText}>暫無購買項</Text>}
                </View>

                {/* 2. 預購搶購清單 */}
                <Text style={[styles.subSectionTitle, { color: Colors.subText, marginTop: 20 }]}>⏰ 預購搶購清單</Text>
                {preorderItems.map((item: any) => (
                    <MotiView key={item.id} style={[styles.preorderRow, { backgroundColor: isDarkMode ? '#2C3E50' : '#F8FAFC' }]}>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.itemText, { color: Colors.text}]}>{item.name}</Text>
                            <Text style={[styles.timeText, { fontSize: 12 }]}>開賣：{item.targetDate} {item.targetTime}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 12 }}>
                            {item.link && (
                                <TouchableOpacity onPress={() => openLink(item.link)}>
                                    <Ionicons name="link" size={24} color={Colors.primary} />
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity onPress={() => deleteDoc(doc(db, collName, item.id))}>
                                <Ionicons name="trash-outline" size={22} color="#F43F5E" />
                            </TouchableOpacity>
                        </View>
                    </MotiView>
                ))}
                {preorderItems.length === 0 && <Text style={styles.emptyText}>暫無搶購項</Text>}
            </View>
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: Colors.bg }]}>
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
                <View style={[styles.tabContainer, { backgroundColor: isDarkMode ? '#1E293B' : '#F1F5F9' }]}>
                    <Animated.View style={[styles.slidingIndicator, { backgroundColor: Colors.card, transform: [{ translateX: scrollX }] }]} />
                    <TouchableOpacity style={styles.tabButton} onPress={() => switchMode('self')}>
                        <Text style={[styles.tabText, { color: mode === 'self' ? Colors.primary : Colors.subText, fontWeight: mode === 'self' ? 'bold' : 'normal' }]}>個人</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.tabButton} onPress={() => switchMode('family')}>
                        <Text style={[styles.tabText, { color: mode === 'family' ? Colors.familyAccent : Colors.subText, fontWeight: mode === 'family' ? 'bold' : 'normal' }]}>家庭</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
                {/* 動態牆 */}
                <View style={styles.activitySection}>
                    <View style={styles.sectionTitleRow}>
                        <Ionicons name="flash" size={18} color="#FFD700" />
                        <Text style={[styles.smallLabel, { color: Colors.text }]}> 最新動態同步</Text>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: 20 }}>
                        <AnimatePresence>
                            {activities.map(act => {
                                const config = getTagConfig(act.type);
                                return (
                                    <MotiView key={act.id} from={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={[styles.activityCard, { backgroundColor: Colors.card, borderLeftColor: config.color }]}>
                                        <View style={[styles.actTag, { backgroundColor: config.color + '20' }]}>
                                            <Text style={[styles.actTagText, { color: config.color }]}>{config.label}</Text>
                                        </View>
                                        <Text style={[styles.actItemName, { color: Colors.text }]} numberOfLines={1}>{act.itemName}</Text>
                                        <Text style={styles.timeText}>{new Date(act.time).toLocaleDateString()}</Text>
                                    </MotiView>
                                );
                            })}
                        </AnimatePresence>
                    </ScrollView>
                </View>

                {/* 主內容區 */}
                <View style={styles.mainPadding}>
                    {mode === 'self' ? (
                        <WishSection 
                            title="我的心願單 🛒" 
                            items={wishList} 
                            collName="wishlist"
                            onAdd={() => { setModalType('shopping'); setModalVisible(true); }}
                            onShare={() => handleShareList(wishList, "我的採購清單")}
                        />
                    ) : (
                        families.length === 0 ? (
                             <View style={[styles.mainCard, { backgroundColor: Colors.card, alignItems: 'center', paddingVertical: 40 }]}>
                                <Ionicons name="people-circle-outline" size={80} color={Colors.subText} style={{ marginBottom: 15 }} />
                                <Text style={[styles.cardTitle, { color: Colors.text, marginBottom: 10 }]}>尚未加入家庭</Text>
                                <TouchableOpacity style={[styles.modalBtn, { backgroundColor: Colors.familyAccent, width: '100%', marginBottom: 12, borderRadius: 20 }]} onPress={() => { setFamilyAction('create'); setFamilyModalVisible(true); }}>
                                    <Text style={styles.btnText}>建立新家庭</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.modalBtn, { backgroundColor: Colors.selfAccent, width: '100%', borderRadius: 20 }]} onPress={() => { setFamilyAction('join'); setFamilyModalVisible(true); }}>
                                    <Text style={styles.btnText}>加入現有家庭</Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <>
                                {currentFamily && (
                                    <View style={[styles.familyInfoBar, { backgroundColor: Colors.card }]}>
                                        <Text style={[styles.familyBarTitle, { color: Colors.text }]}>{currentFamily.name}</Text>
                                        <TouchableOpacity onPress={() => Share.share({ message: `我的家庭邀請碼：${currentFamily.inviteCode}` })}>
                                            <Ionicons name="share-social" size={24} color={Colors.familyAccent} />
                                        </TouchableOpacity>
                                    </View>
                                )}
                                
                                <WishSection 
                                    title="家庭需購 🏠" 
                                    items={familyWishList} 
                                    collName="family_wishlist"
                                    onAdd={() => { setModalType('shopping'); setModalVisible(true); }}
                                    onShare={() => handleShareList(familyWishList, `${currentFamily?.name} 的採購清單`)}
                                />
                            </>
                        )
                    )}
                </View>
            </ScrollView>

            {/* 新增物品 Modal */}
            <Modal visible={modalVisible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalCard, { backgroundColor: Colors.card }]}>
                        {/* 類型切換器 */}
                        <View style={styles.modalTabRow}>
                            <TouchableOpacity onPress={() => setModalType('shopping')} style={[styles.modalTab, modalType === 'shopping' && { borderBottomColor: Colors.primary, borderBottomWidth: 2 }]}>
                                <Text style={[styles.tabText, { color: modalType === 'shopping' ? Colors.primary : Colors.subText }]}>一般購買</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setModalType('preorder')} style={[styles.modalTab, modalType === 'preorder' && { borderBottomColor: Colors.preorderAccent, borderBottomWidth: 2 }]}>
                                <Text style={[styles.tabText, { color: modalType === 'preorder' ? Colors.preorderAccent : Colors.subText }]}>預購搶購</Text>
                            </TouchableOpacity>
                        </View>

                        <TextInput 
                            style={[styles.input, { backgroundColor: Colors.inputBg, color: Colors.text }]}
                            placeholder="商品名稱..."
                            placeholderTextColor={Colors.subText}
                            value={newItemName}
                            onChangeText={setNewItemName}
                            autoFocus
                        />

                        {modalType === 'preorder' && (
                            <View>
                                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 15 }}>
                                    <TouchableOpacity 
                                        style={[styles.input, { flex: 1, backgroundColor: Colors.inputBg, marginBottom: 0, justifyContent: 'center', height: 50 }]} 
                                        onPress={() => setShowDatePicker(true)}
                                    >
                                        <Text style={{ color: Colors.text, fontFamily: 'ZenKurenaido' }}>
                                            📅 {`${(dateValue.getMonth() + 1).toString().padStart(2, '0')}/${dateValue.getDate().toString().padStart(2, '0')}`}
                                        </Text>
                                    </TouchableOpacity>
                                    
                                    <TouchableOpacity 
                                        style={[styles.input, { flex: 1, backgroundColor: Colors.inputBg, marginBottom: 0, justifyContent: 'center', height: 50 }]} 
                                        onPress={() => setShowTimePicker(true)}
                                    >
                                        <Text style={{ color: Colors.text, fontFamily: 'ZenKurenaido' }}>
                                            🕒 {`${dateValue.getHours().toString().padStart(2, '0')}:${dateValue.getMinutes().toString().padStart(2, '0')}`}
                                        </Text>
                                    </TouchableOpacity>
                                </View>

                                {showDatePicker && (
                                    <DateTimePicker
                                        value={dateValue}
                                        mode="date"
                                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                        onChange={onDateChange}
                                    />
                                )}
                                {showTimePicker && (
                                    <DateTimePicker
                                        value={dateValue}
                                        mode="time"
                                        is24Hour={true}
                                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                        onChange={onTimeChange}
                                    />
                                )}

                                <TextInput 
                                    style={[styles.input, { backgroundColor: Colors.inputBg, color: Colors.text }]}
                                    placeholder="購買網址 (https://...)"
                                    placeholderTextColor={Colors.subText}
                                    value={preorderLink}
                                    onChangeText={setPreorderLink}
                                />
                            </View>
                        )}

                        <View style={{ flexDirection: 'row', gap: 15 }}>
                            <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#94A3B8' }]} onPress={() => setModalVisible(false)}>
                                <Text style={styles.btnText}>取消</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.modalBtn, { backgroundColor: modalType === 'shopping' ? Colors.primary : Colors.preorderAccent }]} onPress={handleAddItem}>
                                <Text style={styles.btnText}>確認加入</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* 家庭操作 Modal */}
            <Modal visible={familyModalVisible} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalCard, { backgroundColor: Colors.card }]}>
                        <Text style={[styles.cardTitle, { color: Colors.text, textAlign: 'center', marginBottom: 20 }]}>{familyAction === 'create' ? '建立家庭空間' : '加入家庭'}</Text>
                        <TextInput style={[styles.input, { backgroundColor: Colors.inputBg, color: Colors.text }]} placeholder={familyAction === 'create' ? "給家庭取個名字..." : "請輸入 6 位數邀請碼"} placeholderTextColor={Colors.subText} value={familyInput} onChangeText={setFamilyInput} autoCapitalize={familyAction === 'join' ? "characters" : "none"} autoFocus />
                        <View style={{ flexDirection: 'row', gap: 15 }}>
                            <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#94A3B8' }]} onPress={() => setFamilyModalVisible(false)}><Text style={styles.btnText}>取消</Text></TouchableOpacity>
                            <TouchableOpacity style={[styles.modalBtn, { backgroundColor: familyAction === 'create' ? Colors.familyAccent : Colors.selfAccent }]} onPress={handleFamilyAction}><Text style={styles.btnText}>確定</Text></TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
            {inAppNotice && (
                <Animated.View
                    style={[
                        styles.noticeCard,
                        {
                            backgroundColor: inAppNotice.type === 'success' ? '#10B981' : Colors.card,
                            opacity: noticeAnim,
                            transform: [
                                {
                                    translateY: noticeAnim.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: [50, 0],
                                    }),
                                },
                            ],
                        },
                    ]}
                >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Ionicons 
                            name={inAppNotice.type === 'success' ? 'checkmark-circle' : 'notifications'} 
                            size={18} 
                            color="#fff" 
                        />
                        <Text style={styles.noticeText}>
                            {inAppNotice.text}
                        </Text>
                    </View>
                </Animated.View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { paddingHorizontal: 20, marginBottom: 10 },
    tabContainer: { flexDirection: 'row', height: 48, borderRadius: 24, padding: 4 },
    tabButton: { flex: 1, justifyContent: 'center', alignItems: 'center', zIndex: 2 },
    tabText: { fontSize: 15, fontFamily: 'ZenKurenaido' },
    slidingIndicator: { position: 'absolute', width: '48%', height: '84%', top: '8%', left: 4, borderRadius: 20, elevation: 3 },
    activitySection: { marginVertical: 10, marginBottom: 20 },
    sectionTitleRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 25, marginBottom: 12 },
    smallLabel: { fontSize: 14, fontFamily: 'ZenKurenaido' },
    activityCard: { width: 150, padding: 15, borderRadius: 22, marginRight: 12, borderLeftWidth: 5, elevation: 5 },
    actTag: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginBottom: 8 },
    actTagText: { fontSize: 10, fontFamily: 'ZenKurenaido' },
    actItemName: { fontSize: 16, fontFamily: 'ZenKurenaido' },
    timeText: { fontSize: 10, color: '#94A3B8', marginTop: 4,fontFamily: 'ZenKurenaido' },
    mainPadding: { paddingHorizontal: 20 },
    mainCard: { borderRadius: 30, padding: 20, elevation: 8 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
    cardTitle: { fontSize: 22, fontFamily: 'ZenKurenaido' },
    subSectionTitle: { fontSize: 14, marginBottom: 10, fontFamily: 'ZenKurenaido' },
    wishGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    wishBubble: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, marginRight: 8, marginBottom: 8 },
    itemText: { fontSize: 16, fontFamily: 'ZenKurenaido' },
    emptyText: { fontSize: 12, color: '#94A3B8', marginLeft: 5 ,fontFamily: 'ZenKurenaido'},
    preorderRow: { flexDirection: 'row', alignItems: 'center', padding: 15, borderRadius: 15, marginBottom: 8 },
    familyInfoBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18, borderRadius: 25, marginBottom: 15, elevation: 5 },
    familyBarTitle: { fontSize: 18, fontFamily: 'ZenKurenaido' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
    modalCard: { width: '85%', padding: 25, borderRadius: 30 },
    modalTabRow: { flexDirection: 'row', marginBottom: 20, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
    modalTab: { flex: 1, paddingBottom: 10, alignItems: 'center' },
    input: { borderRadius: 12, padding: 12, fontSize: 16, marginBottom: 15, fontFamily: 'ZenKurenaido' },
    modalBtn: { flex: 1, padding: 15, borderRadius: 15, alignItems: 'center' },
    btnText: { color: '#FFF', fontSize: 16,fontFamily: 'ZenKurenaido' },
    subText: { color: '#94A3B8' ,fontFamily: 'ZenKurenaido'},
    noticeCard: {
        position: 'absolute',
        bottom: 110,
        alignSelf: 'center',
        paddingHorizontal: 18,
        paddingVertical: 12,
        borderRadius: 999, // ⭐ 超圓角（膠囊）
        elevation: 12,

        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
    },

    noticeText: {
        fontSize: 14,
        color: '#fff',
        fontFamily: 'ZenKurenaido',
    },
});