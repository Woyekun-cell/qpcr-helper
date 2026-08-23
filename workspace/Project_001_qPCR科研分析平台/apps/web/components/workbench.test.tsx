import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Workbench } from "./workbench";
import { guestProjects } from "@/lib/guest-projects";

describe("qPCR workbench", () => {
  it("loads the scientific demo and supports bilingual labels", async () => {
    const user = userEvent.setup();
    render(<Workbench />);
    expect(screen.getByRole("heading", { name: /qPCR 科研分析平台/i })).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: /载入演示/i })[0]!);
    expect(screen.getByText(/24 个孔/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /English/i }));
    expect(screen.getByRole("heading", { name: /qPCR Research Platform/i })).toBeInTheDocument();
  });

  it("saves and lists a guest project in the project library", async () => {
    await guestProjects.clear();
    const user = userEvent.setup();
    render(<Workbench />);
    await user.click(screen.getAllByRole("button", { name: /载入演示/i })[0]!);
    await user.click(screen.getByRole("button", { name: /保存项目/i }));
    await user.click(screen.getByRole("button", { name: /^项目$/i }));
    expect(await screen.findByText("八倍表达演示")).toBeInTheDocument();
  });
});
