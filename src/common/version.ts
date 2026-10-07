export type Release = {
  /** strict semver */
  version: string;
  /** release tag */
  tag: string;
  /** link to GitHub release page */
  link: string;
};

export type Releases = {
  /** stable version */
  stable: Release;
  /** latest version */
  latest: Release;
  /** UnixTime(ms) of last download */
  downloadedMs?: number;
};

export type VersionStatus = {
  knownReleases?: Releases;
  /** UnixTime(ms) of last update check */
  updatedMs: number;
};
