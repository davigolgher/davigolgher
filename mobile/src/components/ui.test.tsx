/**
 * The shared UI kit: what Input tells iOS AutoFill, and how the segmented
 * control answers a tap. The native components are replaced by stand-ins that
 * record the props passed down (and a Pressable that's a plain button).
 */
import { fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const seen = vi.hoisted(() => ({ props: [] as Record<string, unknown>[], haptics: 0 }));

vi.mock("react-native", () => {
  const Pass = ({ children }: { children?: unknown }) => children ?? null;
  return {
    Animated: { View: Pass, Value: class {}, timing: () => ({ start: () => {} }) },
    AccessibilityInfo: { isReduceMotionEnabled: async () => false, addEventListener: () => ({ remove() {} }) },
    Easing: { bezier: () => () => 0, out: () => () => 0, cubic: () => 0 },
    Platform: { OS: "ios" },
    StyleSheet: { hairlineWidth: 0.5 },
    Pressable: ({ children, onPress }: { children?: unknown; onPress?: () => void }) => (
      <button onClick={onPress}>{children as never}</button>
    ),
    Text: Pass,
    View: Pass,
    TextInput: (props: Record<string, unknown>) => {
      seen.props.push(props);
      return null;
    },
  };
});

vi.mock("./icons", () => ({ ChevronRightIcon: () => null }));
vi.mock("~/lib/haptics", () => ({
  hapticSelection: () => {
    seen.haptics += 1;
  },
}));

const { Input, Segmented } = await import("./ui");
const last = () => seen.props[seen.props.length - 1];

describe("Input and iOS AutoFill", () => {
  beforeEach(() => {
    seen.props = [];
  });

  it("marks a plain field (an amount, a name) as having no AutoFill content", () => {
    render(<Input value="" onChangeText={() => {}} keyboardType="decimal-pad" placeholder="0" />);
    expect(last().textContentType).toBe("none");
    expect(last().autoComplete).toBe("off");
  });

  it("leaves the email and password fields their own content types", () => {
    render(<Input value="" textContentType="newPassword" autoComplete="new-password" secureTextEntry />);
    expect(last().textContentType).toBe("newPassword");
    expect(last().autoComplete).toBe("new-password");

    render(<Input value="" textContentType="password" secureTextEntry />);
    expect(last().textContentType).toBe("password");
    expect(last().autoComplete).toBeUndefined();

    render(<Input value="" autoComplete="email" textContentType="emailAddress" />);
    expect(last().textContentType).toBe("emailAddress");
  });
});

describe("Segmented", () => {
  const options = [
    { value: "weekly", label: "Weekly" },
    { value: "monthly", label: "Monthly" },
  ] as const;

  beforeEach(() => {
    seen.haptics = 0;
  });

  it("chooses another segment with one selection tick", () => {
    const onChange = vi.fn();
    const { getByText } = render(<Segmented options={options} value="weekly" onChange={onChange} />);
    fireEvent.click(getByText("Monthly"));
    expect(onChange).toHaveBeenCalledWith("monthly");
    expect(seen.haptics).toBe(1);
  });

  it("does nothing when the current segment is tapped again", () => {
    const onChange = vi.fn();
    const { getByText } = render(<Segmented options={options} value="weekly" onChange={onChange} />);
    fireEvent.click(getByText("Weekly"));
    expect(onChange).not.toHaveBeenCalled();
    expect(seen.haptics).toBe(0);
  });
});
