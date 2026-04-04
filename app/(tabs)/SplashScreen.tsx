import { Ionicons } from '@expo/vector-icons';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming
} from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');

SplashScreen.preventAutoHideAsync();

interface Props {
  onAnimationFinished: () => void;
}

export default function AppSplashScreen({ onAnimationFinished }: Props) {
  // --- 動畫變數 ---
  const containerScale = useSharedValue(1);
  const containerOpacity = useSharedValue(1);
  
  // Logo 相關
  const logoScale = useSharedValue(0);
  const logoRotate = useSharedValue(-20); // 初始帶一點旋轉
  const checkScale = useSharedValue(0);
  
  // 文字與裝飾
  const textY = useSharedValue(30);
  const textOpacity = useSharedValue(0);
  const lineTranslateX = useSharedValue(-width); // 底部裝飾線

  useEffect(() => {
    const startAnimation = async () => {
      await SplashScreen.hideAsync();

      // 1. Logo 彈出 (使用 Spring 更生動)
      logoScale.value = withSpring(1, { damping: 12, stiffness: 90 });
      logoRotate.value = withSpring(0, { damping: 12, stiffness: 90 });

      // 2. 打勾圖示延遲彈出
      checkScale.value = withDelay(
        400,
        withSpring(1, { damping: 8, stiffness: 100 })
      );

      // 3. 文字由下而上浮現
      textY.value = withDelay(
        600,
        withTiming(0, { duration: 800, easing: Easing.out(Easing.back(1)) })
      );
      textOpacity.value = withDelay(600, withTiming(1, { duration: 800 }));

      // 4. 底部裝飾線劃過
      lineTranslateX.value = withDelay(
        400,
        withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.exp) })
      );

      // 5. 結束：先縮小吸入感，再淡出
      const EXIT_DELAY = 2800;
      containerScale.value = withDelay(
        EXIT_DELAY,
        withSequence(
          withTiming(0.95, { duration: 200 }), // 微縮
          withTiming(1.2, { duration: 400 })   // 爆開
        )
      );
      
      containerOpacity.value = withDelay(
        EXIT_DELAY + 200,
        withTiming(0, { duration: 300 }, (finished) => {
          if (finished) runOnJS(onAnimationFinished)();
        })
      );
    };

    startAnimation();
  }, []);

  // --- 動畫樣式 ---
  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: containerScale.value }],
    opacity: containerOpacity.value,
  }));

  const logoStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: logoScale.value },
      { rotate: `${logoRotate.value}deg` }
    ],
  }));

  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  const textStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: textY.value }],
    opacity: textOpacity.value,
  }));

  const lineStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: lineTranslateX.value }],
  }));

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      {/* 底部裝飾線條 */}
      <Animated.View style={[styles.bgLine, lineStyle]} />

      <View style={styles.content}>
        {/* Logo 容器 */}
        <Animated.View style={[styles.logoCircle, logoStyle]}>
          <Ionicons name="cart" size={80} color="white" />
          
          {/* 獨立動畫的小勾勾 */}
          <Animated.View style={[styles.checkBadge, checkStyle]}>
            <Ionicons name="checkmark" size={24} color="#8B5CF6" />
          </Animated.View>
        </Animated.View>

        {/* 文字區塊 */}
        <Animated.View style={[styles.textContainer, textStyle]}>
          <Text style={styles.brandName}>購了沒</Text>
          <View style={styles.sloganWrapper}>
            <View style={styles.sloganLine} />
            <Text style={styles.slogan}>你專屬的消費管家</Text>
            <View style={styles.sloganLine} />
          </View>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#8B5CF6',
    zIndex: 9999,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  bgLine: {
    position: 'absolute',
    bottom: height * 0.2,
    width: width * 2,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    transform: [{ rotate: '-15deg' }],
  },
  content: {
    alignItems: 'center',
  },
  logoCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    // 增加內發光感
    shadowColor: "#fff",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  checkBadge: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 4,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
  },
  textContainer: {
    marginTop: 40,
    alignItems: 'center',
  },
  brandName: {
    fontSize: 48,
    color: 'white',
    letterSpacing: 8,
    fontFamily: 'ZenKurenaido', 
    textShadowColor: 'rgba(0, 0, 0, 0.1)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  sloganWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  slogan: {
    fontSize: 14,
    fontFamily: 'ZenKurenaido', 
    color: 'rgba(255,255,255,0.8)',
    marginHorizontal: 10,
    letterSpacing: 3,
  },
  sloganLine: {
    width: 20,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
});