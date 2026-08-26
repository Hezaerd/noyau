import { ProjectId, ThreadId } from "@noyau/protocol/ids"
import { Schema } from "effect"

export const SET_BADGE_COUNT_CHANNEL = "noyau:set-badge-count"
export const SHOW_TURN_NOTIFICATION_CHANNEL = "noyau:show-turn-notification"
export const OPEN_THREAD_FROM_NOTIFICATION_CHANNEL = "noyau:open-thread-from-notification"

export const BadgeCount = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
export type BadgeCount = typeof BadgeCount.Type

export const TurnNotification = Schema.Struct({
  projectId: ProjectId,
  threadId: ThreadId,
  title: Schema.NonEmptyString,
  body: Schema.NonEmptyString,
})
export type TurnNotification = typeof TurnNotification.Type

export const OpenThreadFromNotification = Schema.Struct({
  projectId: ProjectId,
  threadId: ThreadId,
})
export type OpenThreadFromNotification = typeof OpenThreadFromNotification.Type

export const decodeBadgeCount = Schema.decodeUnknownEffect(BadgeCount)
export const decodeTurnNotification = Schema.decodeUnknownEffect(TurnNotification)
export const decodeOpenThreadFromNotification = Schema.decodeUnknownEffect(
  OpenThreadFromNotification,
)
export const decodeOpenThreadFromNotificationOption = Schema.decodeUnknownOption(
  OpenThreadFromNotification,
)
