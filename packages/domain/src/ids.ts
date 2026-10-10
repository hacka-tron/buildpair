import { monotonicFactory } from "ulidx";

/** Monotonic ULIDs: sortable by creation time, unique even within one millisecond. */
export const newId = monotonicFactory();
