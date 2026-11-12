// מגדיר בשרת Convex את משתני הסביבה של ההתחברות. רץ ב-GitHub Actions (convex-setup.yml),
// כך שאף סוד לא צריך לעבור בצ'אט או להיכתב בקוד.
// קלט (משתני סביבה): CONVEX_DEPLOY_KEY (מכוון את הפקודות לפריסה הנכונה),
// ALLOWED_EMAIL, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, ואופציונלית SITE_URL.
import { execFileSync } from 'node:child_process'
import { exportJWK, exportPKCS8, generateKeyPair } from 'jose'

const SITE_URL = process.env.SITE_URL || 'https://ymalka82810.github.io/Schedule'

function convex(args) {
  return execFileSync('npx', ['convex', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

function isSet(name) {
  try {
    return convex(['env', 'get', name]).trim().length > 0
  } catch {
    return false
  }
}

function setEnv(name, value) {
  convex(['env', 'set', '--force', name, '--', value])
  console.log(`הוגדר: ${name}`)
}

const required = ['ALLOWED_EMAIL', 'AUTH_GOOGLE_ID', 'AUTH_GOOGLE_SECRET']
const missing = required.filter((n) => !process.env[n]?.trim())
if (missing.length) {
  console.error(`חסרים ערכים ב-GitHub Secrets: ${missing.join(', ')}`)
  process.exit(1)
}

// מפתחות ההתחברות נוצרים פעם אחת. הרצה חוזרת לא מחליפה אותם (החלפה מנתקת את כל המחוברים)
if (isSet('JWT_PRIVATE_KEY') && isSet('JWKS')) {
  console.log('מפתחות ההתחברות כבר קיימים, לא משנים אותם')
} else {
  const keys = await generateKeyPair('RS256', { extractable: true })
  const privateKey = (await exportPKCS8(keys.privateKey)).trimEnd().replace(/\n/g, ' ')
  const jwks = JSON.stringify({ keys: [{ use: 'sig', ...(await exportJWK(keys.publicKey)) }] })
  console.log(`::add-mask::${privateKey}`)
  setEnv('JWT_PRIVATE_KEY', privateKey)
  setEnv('JWKS', jwks)
}

setEnv('SITE_URL', SITE_URL)
setEnv('ALLOWED_EMAIL', process.env.ALLOWED_EMAIL.trim())
setEnv('AUTH_GOOGLE_ID', process.env.AUTH_GOOGLE_ID.trim())
setEnv('AUTH_GOOGLE_SECRET', process.env.AUTH_GOOGLE_SECRET.trim())
console.log('הסתיים. עכשיו אפשר להריץ מחדש את "Deploy to GitHub Pages".')
