import { beforeEach, describe, expect, it, vi } from "vitest";

const updateUser = vi.fn();
vi.mock("./client", () => ({ getSupabase: () => ({ auth: { updateUser } }) }));

const { changePassword, MIN_PASSWORD_LENGTH } = await import("./auth.native");

describe("changing the password", () => {
  beforeEach(() => updateUser.mockReset());

  it("sends the current password along with the new one, for the server to check", async () => {
    updateUser.mockResolvedValue({ data: {}, error: null });
    await changePassword("old-secret", "new-secret-1");
    expect(updateUser).toHaveBeenCalledWith({ password: "new-secret-1", current_password: "old-secret" });
  });

  it("says plainly when the current password is wrong", async () => {
    updateUser.mockResolvedValue({ data: {}, error: { message: "Invalid current password", code: "current_password_mismatch" } });
    await expect(changePassword("guess", "new-secret-1")).rejects.toThrow("current password isn't right");
  });

  it("passes any other refusal through unchanged", async () => {
    const err = { message: "Password should be at least 8 characters.", code: "weak_password" };
    updateUser.mockResolvedValue({ data: {}, error: err });
    await expect(changePassword("old-secret", "short")).rejects.toBe(err);
  });

  it("asks new passwords for at least 8 characters", () => {
    expect(MIN_PASSWORD_LENGTH).toBeGreaterThanOrEqual(8);
  });
});
