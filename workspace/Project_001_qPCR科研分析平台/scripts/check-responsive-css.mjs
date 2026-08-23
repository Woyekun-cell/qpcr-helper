import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../apps/web/app/globals.css", import.meta.url), "utf8");
const buttonRule = css.match(/\.quiet-button,\s*\.primary-button,\s*\.icon-button\s*\{([^}]*)\}/s)?.[1] ?? "";
const mobileRule = css.match(/@media \(max-width: 860px\)\s*\{([\s\S]*)\}\s*@media \(prefers-reduced-motion/s)?.[1] ?? "";

if (!/white-space:\s*nowrap/.test(buttonRule)) {
  throw new Error("Toolbar buttons must not wrap at narrow widths");
}
if (!/\.top-actions\s*\{[^}]*gap:\s*6px/s.test(mobileRule)) {
  throw new Error("Mobile top actions must use a compact gap");
}
if (!/\.figure-toolbar\s*\{[^}]*flex-direction:\s*column/s.test(mobileRule)) {
  throw new Error("Mobile figure controls must stack without horizontal overflow");
}

console.log("responsive toolbar checks passed");
