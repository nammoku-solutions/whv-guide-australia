/**
 * Legacy import shim.
 *
 * New code must import from `./model`. This file is kept temporarily so older
 * monitor/backfill modules continue to compile while the retired AI pipeline is
 * preserved for reference. It contains no provider SDK/API calls and no network I/O.
 */

export { callModel as callGemini, parseJsonLoose } from "./model";
export type { ModelCaller } from "./model";
