import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { StoreProvider } from "@/data/store";
import { ToastProvider } from "@/components/ui";
import { ModalsProvider } from "@/features/modals/ModalsProvider";
import { AppShell } from "@/layout/AppShell";
import { HomeScreen } from "./HomeScreen";
import { ExpensesScreen } from "./ExpensesScreen";

function TestApp() {
  return (
    <StoreProvider simulateLoading={false}>
      <ToastProvider>
        <ModalsProvider>
          <MemoryRouter initialEntries={["/"]}>
            <Routes>
              <Route element={<AppShell />}>
                <Route path="/" element={<HomeScreen />} />
                <Route path="/expenses" element={<ExpensesScreen />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </ModalsProvider>
      </ToastProvider>
    </StoreProvider>
  );
}

describe("Flow: add an expense", () => {
  it("starts empty (from zero)", () => {
    render(<TestApp />);
    expect(screen.getByText("This month")).toBeInTheDocument();
    expect(screen.getByText("No transactions yet. Add one to get started.")).toBeInTheDocument();
  });

  it("adds an expense via the Add Expense button and shows it", async () => {
    const user = userEvent.setup();
    render(<TestApp />);

    await user.click(screen.getByRole("button", { name: "Add Expense" }));

    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Amount"), { target: { value: "2099" } });
    await user.type(within(dialog).getByLabelText("Category"), "Netflix");
    await user.click(within(dialog).getByRole("button", { name: "Save expense" }));

    expect(await screen.findByText("Expense added")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Netflix")).toBeInTheDocument());
  });
});
