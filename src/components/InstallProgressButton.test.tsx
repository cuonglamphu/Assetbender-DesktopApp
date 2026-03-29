import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InstallProgressButton } from "./InstallProgressButton";

describe("InstallProgressButton", () => {
  it("shows label when not busy", () => {
    const onClick = vi.fn();
    render(
      <InstallProgressButton
        label="Install"
        busy={false}
        progress={null}
        onClick={onClick}
      />,
    );
    expect(screen.getByRole("button", { name: "Install" })).toBeEnabled();
  });

  it("calls onClick when idle", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <InstallProgressButton
        label="Install"
        busy={false}
        progress={null}
        onClick={onClick}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Install" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("shows cancel when busy with onCancel", async () => {
    const onCancel = vi.fn();
    render(
      <InstallProgressButton
        label="Install"
        busy
        progress={0.5}
        onClick={() => {}}
        onCancel={onCancel}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /cancel download/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
