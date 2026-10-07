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
  /**
   * UnixTime(ms) of last download
   * @deprecated 現在は使用していない。旧バージョンが書き込んだ値が残っている場合がある。
   */
  downloadedMs?: number;
};

export type VersionStatus = {
  knownReleases?: Releases;
  /** UnixTime(ms) of last update check */
  updatedMs: number;
};
