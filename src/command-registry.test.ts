import { describe, expect, test } from "bun:test";
import {
  assertOverviewCoverage,
  assertProgramRegistrationCoverage,
  getOverviewCommandIds,
  getTopLevelCommandIds,
} from "./command-registry.js";

describe("command registry coverage", () => {
  test("requires overview coverage for all non-deprecated top-level commands", () => {
    expect(() => assertOverviewCoverage()).not.toThrow();
  });

  test("includes sync and label in no-command overview", () => {
    const overviewIds = getOverviewCommandIds();
    expect(overviewIds).toContain("list");
    expect(overviewIds).toContain("sync");
    expect(overviewIds).toContain("label");
  });

  test("passes when program registration matches top-level command registry", () => {
    expect(() =>
      assertProgramRegistrationCoverage(getTopLevelCommandIds()),
    ).not.toThrow();
  });

  test("throws when a top-level command registration is missing", () => {
    const ids = getTopLevelCommandIds();
    const missingLabel = ids.filter((id) => id !== "label");
    expect(() => assertProgramRegistrationCoverage(missingLabel)).toThrow(
      /missing registrations: label/i,
    );
  });

  test("throws when there is an unexpected top-level registration", () => {
    const ids = [...getTopLevelCommandIds(), "surprise"];
    expect(() => assertProgramRegistrationCoverage(ids)).toThrow(
      /unexpected registrations: surprise/i,
    );
  });
});
