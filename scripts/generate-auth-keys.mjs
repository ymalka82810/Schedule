// יוצר זוג מפתחות להתחברות של Convex Auth ומדפיס שתי פקודות להגדרה ב-Convex.
// הרצה: node scripts/generate-auth-keys.mjs
// המפתח הפרטי הוא סוד: לא לשמור בקוד ולא לשלוח לאף אחד.
import { exportJWK, exportPKCS8, generateKeyPair } from 'jose'

const keys = await generateKeyPair('RS256', { extractable: true })
const privateKey = (await exportPKCS8(keys.privateKey)).trimEnd().replace(/\n/g, ' ')
const publicKey = await exportJWK(keys.publicKey)
const jwks = JSON.stringify({ keys: [{ use: 'sig', ...publicKey }] })

console.log('העתק והרץ את שתי הפקודות (הוסף --prod אחרי env אם מגדירים את סביבת הפרודקשן):\n')
console.log(`npx convex env set JWT_PRIVATE_KEY -- "${privateKey}"`)
console.log(`npx convex env set JWKS -- '${jwks}'`)
