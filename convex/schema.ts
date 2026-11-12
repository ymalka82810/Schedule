import { authTables } from '@convex-dev/auth/server'
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  ...authTables,

  // המערכת של הבעלים: מסמך אחד. data = ScheduleData (ראו src/types.ts), backup = המערכת שלפני הייבוא האחרון
  schedules: defineTable({
    userId: v.id('users'),
    data: v.any(),
    backup: v.any(),
    updatedAt: v.number(),
  }).index('by_user', ['userId']),
})
