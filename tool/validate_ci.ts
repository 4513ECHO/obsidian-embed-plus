import $ from "dax";
import semver from "semver";
import manifest from "../manifest.json" with { type: "json" };

$.setPrintCommand(true);

const tag = process.env.GITHUB_REF?.replace("refs/tags/", "") ?? "";
if (manifest.version !== tag) {
  await $`echo "::error::Version mismatch: manifest version ${manifest.version} does not match tag ${tag}"`;
  process.exit(1);
}

const version = new semver.SemVer(manifest.version);
await $`echo prerelease=${version.prerelease.length > 0} > "$GITHUB_OUTPUT"`;
