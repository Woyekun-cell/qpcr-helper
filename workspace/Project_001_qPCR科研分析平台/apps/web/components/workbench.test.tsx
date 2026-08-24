import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Workbench } from "./workbench";
import { guestProjects } from "@/lib/guest-projects";

describe("qPCR workbench", () => {
  it("loads one of six examples and supports bilingual qPCR Helper branding", async () => {
    const user = userEvent.setup();
    render(<Workbench />);
    expect(screen.getByRole("heading", { name: /qPCR Helper/i })).toBeInTheDocument();
    const examples = screen.getByRole("combobox", { name: /示例数据/i });
    expect(examples).toHaveDisplayValue(/选择合成示例/i);
    expect(screen.getAllByRole("option")).toHaveLength(7);
    await user.selectOptions(examples, "multi_gene");
    expect(screen.getByDisplayValue("多基因表达谱演示")).toBeInTheDocument();
    expect(screen.getAllByRole("textbox", { name: /目标基因/i })).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: /English/i }));
    expect(screen.getByRole("heading", { name: /qPCR Helper/i })).toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: /分析与作图/i }));
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

  it("lets researchers choose beta-actin and rename target genes and groups", async () => {
    const user = userEvent.setup();
    render(<Workbench />);
    await user.click(screen.getAllByRole("button", { name: /载入演示/i })[0]!);
    const reference = screen.getByRole("combobox", { name: /内参基因/i });
    await user.selectOptions(reference, "β-actin");
    expect(reference).toHaveValue("β-actin");
    expect(screen.getAllByText(/Reference/).length).toBeGreaterThan(0);

    const target = screen.getByRole("textbox", { name: /目标基因 1/i });
    await user.clear(target);
    await user.type(target, "IL6");
    await user.tab();
    expect(target).toHaveValue("IL6");

    const firstGroup = screen.getByRole("textbox", { name: /分组 1/i });
    await user.clear(firstGroup);
    await user.type(firstGroup, "Vehicle");
    await user.tab();
    expect(firstGroup).toHaveValue("Vehicle");
  });

  it("shows a three-column Ct summary and keeps well-level details collapsed", async () => {
    const user = userEvent.setup();
    render(<Workbench />);
    await user.click(screen.getAllByRole("button", { name: /载入演示/i })[0]!);
    const summary = screen.getByRole("table", { name: /Ct 数据概览/i });
    expect(within(summary).getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "基因名", "重复数", "分组"
    ]);
    const details = screen.getByText(/逐孔 Ct 明细/i).closest("details");
    expect(details).not.toHaveAttribute("open");
  });

  it("offers sub-90-mm widths, gradient swatches and selectable point shapes", async () => {
    const user = userEvent.setup();
    render(<Workbench />);
    await user.click(screen.getByRole("button", { name: /分析与作图/i }));
    const width = screen.getByRole("combobox", { name: /投稿宽度/i });
    expect(within(width).getByRole("option", { name: "60 mm" })).toBeInTheDocument();
    expect(within(width).getByRole("option", { name: "75 mm" })).toBeInTheDocument();
    await user.selectOptions(width, "60");
    expect(width).toHaveValue("60");
    expect(screen.getByRole("button", { name: /圆形点/i })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: /三角形点/i }));
    expect(screen.getByRole("button", { name: /三角形点/i })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: /渐变/i }));
    expect(screen.getByRole("button", { name: "Blue–red" }).querySelector("span"))
      .toHaveStyle({ background: "linear-gradient(90deg, #315B8A 0%, #FFFFFF 50%, #B64F4A 100%)" });
  });

  it("keeps only the data and analysis core views without explanatory workflow copy", async () => {
    render(<Workbench />);
    expect(screen.getByRole("button", { name: /^数据录入$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^分析与作图$/i })).toBeInTheDocument();
    expect(screen.queryByText(/01—07/)).not.toBeInTheDocument();
    expect(screen.queryByText(/统计推荐需人工确认/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\* < 0\.05/)).not.toBeInTheDocument();
  });

  it("provides eight presets in every scientific palette family", async () => {
    const user = userEvent.setup();
    render(<Workbench />);
    await user.click(screen.getByRole("button", { name: /分析与作图/i }));
    for (const category of ["期刊风格", "莫兰迪", "马卡龙", "通用安全", "渐变", "自定义"]) {
      await user.click(screen.getByRole("button", { name: category }));
      expect(within(screen.getByRole("group", { name: /配色方案/i })).getAllByRole("button")).toHaveLength(8);
    }
  });

  it("offers direct figure format and raster DPI controls without requiring a ZIP", async () => {
    const user = userEvent.setup();
    render(<Workbench />);
    await user.click(screen.getByRole("button", { name: /分析与作图/i }));
    const format = screen.getByRole("combobox", { name: /文件格式/i });
    expect(within(format).getAllByRole("option").map((option) => option.textContent)).toEqual(["SVG", "PDF", "PNG", "TIFF"]);
    await user.selectOptions(format, "png");
    expect(screen.getByRole("combobox", { name: /下载分辨率/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /^下载图形$/i })).toBeInTheDocument();
    expect(screen.getByText(/完整科研包（可选）/i).closest("details")).not.toHaveAttribute("open");
  });
});
