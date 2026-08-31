import { expect, it } from "vitest";
import nextConfig from "./next.config.mjs";

it("allows the local in-app preview host to load Next dev resources", () => {
  expect(nextConfig.allowedDevOrigins).toContain("127.0.0.1");
});
