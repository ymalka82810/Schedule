import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/** קבצים גדולים מזה (ספריית ה-PDF וה-worker שלה) לא נשמרים מראש: הם נשמרים בשימוש הראשון */
const PRECACHE_MAX = 300_000

/**
 * אחרי הבנייה: כותב ל-sw.js את רשימת הקבצים של הגרסה ומזהה גרסה.
 * כך האתר עובד בלי אינטרנט כבר אחרי הביקור הראשון, כולל חלקים שנטענים רק בלחיצה,
 * וקבצים של גרסאות ישנות נמחקים מהמכשיר.
 */
function precacheServiceWorker(): Plugin {
  let outDir = 'dist'
  return {
    name: 'precache-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    writeBundle(_options, bundle) {
      const files = Object.values(bundle)
        .filter((f) => f.fileName !== 'index.html' && !f.fileName.endsWith('.map'))
        .filter((f) => (f.type === 'chunk' ? f.code.length : f.source.length) <= PRECACHE_MAX)
        .map((f) => `./${f.fileName}`)
        .sort()
      files.push('./manifest.webmanifest', './icon-192.png')
      const html = readFileSync(resolve(outDir, 'index.html'))
      const version = createHash('sha256').update(html).update(files.join('|')).digest('hex').slice(0, 10)
      const path = resolve(outDir, 'sw.js')
      const sw = readFileSync(path, 'utf8')
      if (!sw.includes("'__BUILD__'") || !sw.includes('/*__PRECACHE__*/')) {
        throw new Error('public/sw.js: חסרים הסימונים __BUILD__ או __PRECACHE__')
      }
      writeFileSync(
        path,
        sw.replace("'__BUILD__'", JSON.stringify(version)).replace('/*__PRECACHE__*/', files.map((f) => JSON.stringify(f)).join(', ')),
      )
    },
  }
}

// base תואם לכתובת של GitHub Pages: https://ymalka82810.github.io/Schedule/
export default defineConfig({
  base: '/Schedule/',
  plugins: [react(), precacheServiceWorker()],
  build: {
    rolldownOptions: {
      output: {
        // ספריות שכמעט לא משתנות בקבצים משלהן: עדכון של האתר לא מוריד אותן מחדש
        advancedChunks: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'hebcal', test: /node_modules[\\/]@hebcal[\\/]/ },
            { name: 'convex', test: /node_modules[\\/](convex|@convex-dev|@auth|oauth4webapi|jose|cookie|lucia|@oslojs|arctic|is-network-error)[\\/]/ },
          ],
        },
      },
    },
  },
})
