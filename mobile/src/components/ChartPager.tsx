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
import { Animated, ScrollView, View } from "react-native";
import { Segmented } from "./ui";
import { EASE_OUT, useReducedMotion } from "~/lib/motion";

export interface ChartPage {
  key: string;
  title: string;
  content: ReactNode;
}

export function ChartPager({ pages }: { pages: ChartPage[] }) {
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const scroller = useRef<ScrollView>(null);

  /**
   * Where a tap is taking us, until we arrive.
   *
   * `scrollTo` animates, and every frame of that animation fires `onScroll`.
   * The first frames still report the page we're leaving, so the handler set
   * the index straight back to it — the tap appeared to do nothing, and the
   * highlight only moved once the scroll crossed halfway. That's the stutter.
   *
   * It clears the moment we reach the target, and also the moment a finger
   * touches the pager, because a drag means the user is in charge now. Both
   * releases matter: a lock that only one of them could clear would eventually
   * stick and stop the tabs following a swipe at all.
   */
  const target = useRef<number | null>(null);

  const reduced = useReducedMotion();
  const appear = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(appear, { toValue: 1, duration: 260, delay: 60, easing: EASE_OUT, useNativeDriver: true }).start();
  }, [appear]);

  const go = (i: number) => {
    target.current = i;
    setIndex(i);
    scroller.current?.scrollTo({ x: i * width, animated: true });
  };

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Segmented
        role="tab"
        options={pages.map((p) => ({ value: p.key, label: p.title }))}
        value={pages[index]?.key ?? pages[0].key}
        onChange={(key) => go(pages.findIndex((p) => p.key === key))}
        className="mb-4"
      />

      {width > 0 ? (
        <Animated.View
          style={{
            opacity: appear,
            transform: reduced ? [] : [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
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
            onScrollBeginDrag={() => {
              target.current = null;
            }}
            onScroll={(e) => {
              const i = Math.round(e.nativeEvent.contentOffset.x / width);
              if (i < 0 || i >= pages.length) return;
              if (target.current !== null) {
                if (i === target.current) target.current = null;
                return;
              }
              if (i !== index) setIndex(i);
            }}
          >
            {pages.map((p) => (
              <View key={p.key} style={{ width }}>
                {p.content}
              </View>
            ))}
          </ScrollView>
        </Animated.View>
      ) : null}
    </View>
  );
}
