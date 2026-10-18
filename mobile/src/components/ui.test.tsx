/**
 * What the shared Input tells iOS AutoFill. The native components are replaced
 * by stand-ins that record the props the field passes down.
 */
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const seen = vi.hoisted(() => ({ props: [] as Record<string, unknown>[] }));

vi.mock("react-native", () => {
  const Pass = ({ children }: { children?: unknown }) => children ?? null;
  return {
    Animated: { View: Pass, Value: class {}, timing: () => ({ start: () => {} }) },
    AccessibilityInfo: { isReduceMotionEnabled: async () => false, addEventListener: () => ({ remove() {} }) },
    Easing: { bezier: () => () => 0, out: () => () => 0, cubic: () => 0 },
    Pressable: Pass,
    Text: Pass,
    View: Pass,
    TextInput: (props: Record<string, unknown>) => {
      seen.props.push(props);
      return null;
    },
  };
});

const { Input } = await import("./ui");
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
