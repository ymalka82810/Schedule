// מגדיר בשרת Convex את משתני הסביבה של ההתחברות. רץ ב-GitHub Actions (convex-setup.yml),
// כך שאף סוד לא צריך לעבור בצ'אט או להיכתב בקוד.
// קלט (משתני סביבה): CONVEX_DEPLOY_KEY (מכוון את הפקודות לפריסה הנכונה),
// ALLOWED_EMAIL (המייל היחיד שמורשה) ו-RESEND_API_KEY (מפתח API של Resend).
import { execFileSync } from 'node:child_process'
import { exportJWK, exportPKCS8, generateKeyPair } from 'jose'

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

const required = ['ALLOWED_EMAIL', 'RESEND_API_KEY']
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

setEnv('ALLOWED_EMAIL', process.env.ALLOWED_EMAIL.trim())
setEnv('AUTH_RESEND_KEY', process.env.RESEND_API_KEY.trim())
console.log('הסתיים. עכשיו אפשר להריץ מחדש את "Deploy to GitHub Pages".')
