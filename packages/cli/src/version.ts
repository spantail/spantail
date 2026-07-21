import pkg from "../package.json";

export const VERSION: string = pkg.version;

/**
 * The oldest Spantail server this CLI is exercised against. The CLI and the
 * server release on separate tracks (`cli-vX.Y.Z` vs `vX.Y.Z`), so their
 * versions carry no relation. `/api/v1` grows by addition, which keeps an older
 * CLI working against a newer server; only the reverse can break, since the API
 * rejects request fields it does not know. Raise this whenever the CLI starts
 * relying on an endpoint or field that a newer server introduced.
 */
export const MIN_SERVER_VERSION = "v1.2.0";
