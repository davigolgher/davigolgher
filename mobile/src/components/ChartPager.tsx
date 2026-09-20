/**
 * Swipeable pager for the charts: the category donut and the monthly line live
 * side by side, one swipe apart, rather than stacked down the screen.
 *
 * Both pages get the same entrance micro-animation — a short fade and rise —
 * so a chart arrives rather than blinking into place. Driven natively, so it
 * stays smooth while the list below is still rendering.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, ScrollView, Text, View } from "react-native";

export interface ChartPage {
  key: string;
  title: string;
  content: ReactNode;
}

export function ChartPager({ pages }: { pages: ChartPage[] }) {
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);

  const appear = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(appear, {
      toValue: 1,
      duration: 320,
      delay: 60,
      useNativeDriver: true,
    }).start();
  }, [appear]);

  const animation = {
    opacity: appear,
    transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
  };

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="text-[15px] font-semibold text-chalk">{pages[index]?.title}</Text>
        {/* Dots double as the hint that there's more than one page here. */}
        <View className="flex-row items-center gap-1.5">
          {pages.map((p, i) => (
            <View
              key={p.key}
              className={`h-1.5 rounded-pill ${i === index ? "w-4 bg-chalk" : "w-1.5 bg-line-strong"}`}
            />
          ))}
        </View>
      </View>

      {width > 0 ? (
        <Animated.View style={animation}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
            scrollEventThrottle={16}
          >
            {pages.map((p) => (
              <View key={p.key} style={{ width }}>
                {p.content}
              </View>
            ))}
          </ScrollView>
        </Animated.View>
      ) : null}

      <Text className="mt-3 text-center text-[12px] text-chalk-faint">Swipe to switch chart</Text>
    </View>
  );
}
