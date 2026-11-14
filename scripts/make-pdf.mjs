// 개발용: docs/presentation/slides.html을 PRESENTATION.pdf로 만든다.  실행: npx electron scripts/make-pdf.mjs
import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1280, height: 720 });
  try {
    await win.loadFile(path.join(root, 'docs', 'presentation', 'slides.html'));
    await new Promise((r) => setTimeout(r, 800));
    const pdf = await win.webContents.printToPDF({ preferCSSPageSize: true, printBackground: true });
    fs.writeFileSync(path.join(root, 'PRESENTATION.pdf'), pdf);
    console.log(`PRESENTATION.pdf ${pdf.length} bytes`);
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
