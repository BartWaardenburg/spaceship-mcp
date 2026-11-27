import { describe, expect, it } from "vitest";
import { changelogSection, parseArgs, releaseNotes, syncServerJson } from "./release.mjs";

const CHANGELOG = `# Changelog

## [1.2.1](https://example.com/compare/v1.2.0...v1.2.1) (2026-11-27)

### Bug Fixes

* fix one thing

# [1.2.0](https://example.com/compare/v1.1.0...v1.2.0) (2026-11-20)

### Features

* add a feature

# 1.1.0 (2026-01-01)

* first release
`;

describe("parseArgs", () => {
  it("accepts prepare with an increment or an exact version", () => {
    expect(parseArgs(["prepare", "patch"])).toEqual({ ok: true, data: { phase: "prepare", target: "patch", dryRun: false } });
    expect(parseArgs(["prepare", "2.0.0", "--dry-run"])).toEqual({ ok: true, data: { phase: "prepare", target: "2.0.0", dryRun: true } });
  });

  it("rejects a prerelease version", () => {
    expect(parseArgs(["prepare", "2.0.0-rc.1"]).ok).toBe(false);
  });

  it("accepts publish without a target", () => {
    expect(parseArgs(["publish"])).toEqual({ ok: true, data: { phase: "publish", target: null, dryRun: false } });
  });

  it("rejects a missing, unknown or extra argument", () => {
    for (const argv of [[], ["prepare"], ["prepare", "huge"], ["publish", "1.0.0"], ["prepare", "patch", "extra"], ["ship"]]) {
      expect(parseArgs(argv).ok).toBe(false);
    }
  });
});

describe("changelogSection", () => {
  it("returns the body of a linked level-2 section up to the next release", () => {
    expect(changelogSection(CHANGELOG, "1.2.1")).toBe("### Bug Fixes\n\n* fix one thing");
  });

  it("finds level-1 and unlinked headings", () => {
    expect(changelogSection(CHANGELOG, "1.2.0")).toBe("### Features\n\n* add a feature");
    expect(changelogSection(CHANGELOG, "1.1.0")).toBe("* first release");
  });

  it("does not match a version prefix", () => {
    expect(changelogSection(CHANGELOG, "1.2")).toBeNull();
    expect(changelogSection(CHANGELOG, "9.9.9")).toBeNull();
  });
});

describe("releaseNotes", () => {
  it("returns the section, a fixed text for an empty section, or null", () => {
    const changelog = "# Changelog\n\n## [1.0.1](https://example.com) (2026-11-27)\n\n## [1.0.0](https://example.com) (2026-11-20)\n\n* first\n";
    expect(releaseNotes(changelog, "1.0.0")).toBe("* first");
    expect(releaseNotes(changelog, "1.0.1")).toBe("No user-facing changes.");
    expect(releaseNotes(changelog, "2.0.0")).toBeNull();
  });
});

describe("syncServerJson", () => {
  it("sets the server version and only the matching npm package version", () => {
    const server = {
      name: "io.github.example/demo",
      version: "1.0.0",
      packages: [
        { registryType: "npm", identifier: "demo", version: "1.0.0" },
        { registryType: "npm", identifier: "other", version: "3.0.0" },
        { registryType: "oci", identifier: "ghcr.io/example/demo", version: "1.0.0" },
      ],
    };
    expect(syncServerJson(server, "demo", "1.1.0")).toEqual({
      name: "io.github.example/demo",
      version: "1.1.0",
      packages: [
        { registryType: "npm", identifier: "demo", version: "1.1.0" },
        { registryType: "npm", identifier: "other", version: "3.0.0" },
        { registryType: "oci", identifier: "ghcr.io/example/demo", version: "1.0.0" },
      ],
    });
  });

  it("handles a server without packages", () => {
    expect(syncServerJson({ version: "1.0.0" }, "demo", "1.0.1")).toEqual({ version: "1.0.1", packages: [] });
  });
});
