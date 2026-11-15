/**
 * A build without Flow Family: its screens exist as files but can't be
 * reached — a link to one lands on Home — and the shared state reports the
 * feature as absent, so every entry point stays hidden.
 */
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

const redirect = vi.hoisted(() => vi.fn());
vi.mock("react-native", () => import("../../../../src/test/stubs/react-native-dom"));
vi.mock("react-native-svg", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children ?? null}</>;
  return { default: Pass, Svg: Pass, G: Pass, Path: () => null, Circle: () => null };
});
vi.mock("expo-router", () => ({
  Redirect: ({ href }: { href: string }) => {
    redirect(href);
    return null;
  },
  Stack: Object.assign(() => <div>family stack</div>, { Screen: () => null }),
  router: { push: vi.fn() },
  useFocusEffect: () => {},
}));
vi.mock("./flag", () => ({ FAMILY_ENABLED: false }));
vi.mock("./cache", () => ({ readCache: async () => null, writeCache: async () => "", dropCache: async () => {}, clearAllCaches: async () => {} }));
vi.mock("~/lib/haptics", () => ({ hapticSelection: () => {}, hapticSuccess: () => {} }));
vi.mock("@/features/auth/AuthProvider", () => ({ useAuth: () => ({ userId: "u", configured: true }) }));

const FamilyLayout = (await import("~/app/family/_layout")).default;
const { useFamily } = await import("./FamilyProvider");
const { FamilyHomeCard } = await import("./HomeCard");

describe("without the feature flag", () => {
  it("sends any Family link back to Home", () => {
    const { container } = render(<FamilyLayout />);
    expect(redirect).toHaveBeenCalledWith("/");
    expect(container).not.toHaveTextContent("family stack");
  });

  it("reports the feature as absent and shows no Home card", () => {
    let seen: ReturnType<typeof useFamily> | null = null;
    function Probe() {
      seen = useFamily();
      return null;
    }
    render(<Probe />);
    expect(seen).toMatchObject({ enabled: false, familyOnly: false, isGuardian: false, isDependent: false, isSharing: false });
    expect(render(<FamilyHomeCard />).container).toBeEmptyDOMElement();
  });
});
