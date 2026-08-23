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

  it("supports keyboard focus and Escape dismissal for account access", async () => {
    const user = userEvent.setup();
    render(<Workbench />);
    await user.click(screen.getByRole("button", { name: /^登录$/i }));
    const dialog = screen.getByRole("dialog", { name: /邮箱登录/i });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /email/i })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: /邮箱登录/i })).not.toBeInTheDocument();
  });

  it("dismisses the modal project library with Escape", async () => {
    const user = userEvent.setup();
    render(<Workbench />);
    await user.click(screen.getByRole("button", { name: /^项目$/i }));
    expect(screen.getByRole("dialog", { name: /项目库/i })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: /项目库/i })).not.toBeInTheDocument();
  });

  it("lets the researcher confirm alpha and confidence level", async () => {
    const user = userEvent.setup();
    render(<Workbench />);
    await user.click(screen.getAllByRole("button", { name: /载入演示/i })[0]!);
    await user.click(screen.getByRole("button", { name: /统计方案/i }));
    const alpha = screen.getByRole("combobox", { name: /显著性水平/i });
    const confidence = screen.getByRole("combobox", { name: /置信水平/i });
    const method = screen.getByRole("combobox", { name: /统计方法/i });
    await user.selectOptions(alpha, "0.01");
    await user.selectOptions(confidence, "0.9");
    await user.selectOptions(method, "mann_whitney");
    expect(alpha).toHaveValue("0.01");
    expect(confidence).toHaveValue("0.9");
    expect(method).toHaveValue("mann_whitney");
  });
});
