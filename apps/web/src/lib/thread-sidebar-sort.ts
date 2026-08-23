import { DateTime } from "effect"

/** Creation order, newest first. Activity never reorders the list. */
export const sortThreadsForSidebar = <
  T extends { readonly id: string; readonly createdAt: DateTime.Utc },
>(
  threads: ReadonlyArray<T>,
): ReadonlyArray<T> =>
  threads.toSorted((left, right) => {
    const byCreated =
      DateTime.toEpochMillis(right.createdAt) - DateTime.toEpochMillis(left.createdAt)
    return byCreated !== 0 ? byCreated : left.id.localeCompare(right.id)
  })
