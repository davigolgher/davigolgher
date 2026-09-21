/**
 * Pager for the charts: the category donut and the monthly spline sit side by
 * side, one swipe apart.
 *
 * The tabs are not decoration. A horizontal scroll view nested inside the
 * screen's vertical one can be fussy about which gesture it gets, and a chart
 * you can't reach is a chart that isn't there — so tapping a tab jumps to the
 * page directly, and the swipe is the shortcut rather than the only way in.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Pressable, ScrollView, Text, View } from "react-native";

export interface ChartPage {
  key: string;
  title: string;
  content: ReactNode;
}

export function ChartPager({ pages, trigger = 0 }: { pages: ChartPage[]; trigger?: number }) {
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const scroller = useRef<ScrollView>(null);

  const appear = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(appear, { toValue: 1, duration: 320, delay: 60, useNativeDriver: true }).start();
  }, [appear]);

  const go = (i: number) => {
    setIndex(i);
    scroller.current?.scrollTo({ x: i * width, animated: true });
  };

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View className="mb-4 flex-row gap-2">
        {pages.map((p, i) => {
          const on = i === index;
          return (
            <Pressable
              key={p.key}
              onPress={() => go(i)}
              className={`flex-1 items-center rounded-pill border py-2 active:opacity-80 ${
                on ? "border-chalk bg-chalk" : "border-line-strong bg-ink-800"
              }`}
            >
              <Text className={`text-[13px] font-semibold ${on ? "text-ink-950" : "text-chalk-mute"}`}>{p.title}</Text>
            </Pressable>
          );
        })}
      </View>

      {width > 0 ? (
        <Animated.View
          style={{
            opacity: appear,
            transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
          }}
        >
          <ScrollView
            ref={scroller}
            horizontal
            pagingEnabled
            directionalLockEnabled
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            snapToInterval={width}
            snapToAlignment="start"
            // Track during the drag, not after it settles. Waiting for
            // onMomentumScrollEnd left the tab highlighting a chart the user had
            // already swiped away from, which reads as lag.
            scrollEventThrottle={16}
            onScroll={(e) => {
              const i = Math.round(e.nativeEvent.contentOffset.x / width);
              if (i !== index && i >= 0 && i < pages.length) setIndex(i);
            }}
          >
            {pages.map((p) => (
              // The trigger is part of the key on purpose: remounting the chart
              // is what makes its draw-in animation play again on a return
              // visit. They're a handful of points each, so it's cheap.
              <View key={`${p.key}-${trigger}`} style={{ width }}>
                {p.content}
              </View>
            ))}
          </ScrollView>
        </Animated.View>
      ) : null}
    </View>
  );
}
