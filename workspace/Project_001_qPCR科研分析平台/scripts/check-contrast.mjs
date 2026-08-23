import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../apps/web/app/globals.css", import.meta.url), "utf8");
const variables = Object.fromEntries(
  [...css.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((match) => [match[1], match[2]])
);

function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map((part) => Number.parseInt(part, 16) / 255);
  const [red, green, blue] = channels.map((value) => value <= 0.03928
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function ratio(foreground, background) {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

const checks = [
  ["muted", "ivory"],
  ["muted", "paper"],
  ["moss", "paper"],
  ["moss-dark", "paper"],
  ["coral", "paper"],
  ["coral", "ivory"],
  ["warning", "paper"]
];
const results = checks.map(([foreground, background]) => ({
  foreground,
  background,
  ratio: ratio(variables[foreground], variables[background])
}));
const failures = results.filter((result) => result.ratio < 4.5);
console.log(JSON.stringify(results.map((result) => ({ ...result, ratio: Number(result.ratio.toFixed(2)) }))));
if (failures.length > 0) {
  throw new Error(`WCAG AA contrast failed: ${failures.map((result) => `${result.foreground}/${result.background}=${result.ratio.toFixed(2)}`).join(", ")}`);
}
