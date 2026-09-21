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
import { Animated, Easing, Pressable, ScrollView, View } from "react-native";

export interface ChartPage {
  key: string;
  title: string;
  content: ReactNode;
}

/* Design tokens, as rgba so they interpolate against each other cleanly. */
const TAB = {
  bgOff: "rgba(245,245,246,1)", // ink-800
  bgOn: "rgba(10,10,10,1)", // chalk
  borderOff: "rgba(0,0,0,0.16)", // line-strong
  borderOn: "rgba(10,10,10,1)",
  textOff: "rgba(142,142,147,1)", // chalk-mute
  textOn: "rgba(255,255,255,1)", // ink-950
};

/**
 * One tab, cross-fading between states.
 *
 * Fill, border and label move together, so the label is never dark on a dark
 * pill mid-transition. Colours can't run on the native driver — it's two views
 * and one 180ms fade, which costs nothing.
 */
function Tab({ title, active, onPress }: { title: string; active: boolean; onPress: () => void }) {
  const t = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(t, {
      toValue: active ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [active, t]);

  const mix = (off: string, on: string) => t.interpolate({ inputRange: [0, 1], outputRange: [off, on] });

  return (
    <Pressable onPress={onPress} className="flex-1 active:opacity-80" accessibilityRole="tab">
      <Animated.View
        className="items-center rounded-pill border py-2"
        style={{ backgroundColor: mix(TAB.bgOff, TAB.bgOn), borderColor: mix(TAB.borderOff, TAB.borderOn) }}
      >
        <Animated.Text style={{ fontSize: 13, fontWeight: "600", color: mix(TAB.textOff, TAB.textOn) }}>
          {title}
        </Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

export function ChartPager({ pages, trigger = 0 }: { pages: ChartPage[]; trigger?: number }) {
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

  const appear = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(appear, { toValue: 1, duration: 320, delay: 60, useNativeDriver: true }).start();
  }, [appear]);

  const go = (i: number) => {
    target.current = i;
    setIndex(i);
    scroller.current?.scrollTo({ x: i * width, animated: true });
  };

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View className="mb-4 flex-row gap-2">
        {pages.map((p, i) => (
          <Tab key={p.key} title={p.title} active={i === index} onPress={() => go(i)} />
        ))}
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
