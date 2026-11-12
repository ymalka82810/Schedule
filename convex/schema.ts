import { authTables } from '@convex-dev/auth/server'
import { defineSchema } from 'convex/server'

// כרגע רק טבלאות ההתחברות. נתוני המערכת יתווספו כשנעביר אותם לשרת
export default defineSchema({
  ...authTables,
})
