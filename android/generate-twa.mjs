import { TwaManifest, TwaGenerator, ConsoleLog } from '@bubblewrap/core';
import fs from 'node:fs';
const out = process.argv[2];
const m = await TwaManifest.fromWebManifest('https://picchess.pages.dev/manifest.webmanifest');
Object.assign(m, {
  packageId: 'ai.thatched.picchess', host: 'picchess.pages.dev', name: 'PicChess', launcherName: 'PicChess',
  startUrl: '/index.html', iconUrl: 'https://picchess.pages.dev/icons/icon-512.png',
  maskableIconUrl: 'https://picchess.pages.dev/icons/icon-maskable-512.png',
  appVersionCode: 1, appVersionName: '1', appVersion: '1', minSdkVersion: 24, enableNotifications: false,
  signingKey: { path: process.env.HOME + '/.workflow/state/keys/picchess-upload.jks', alias: 'upload' },
  fallbackType: 'customtabs', generatorApp: 'bubblewrap-core',
});
m.fingerprints = [{ name: 'upload', value: 'E3:0D:54:A1:16:00:FB:09:B1:34:80:8B:EB:F7:9C:3C:6C:34:B2:49:DC:A6:35:77:A6:BE:8D:97:F4:1E:39:BA' }];
fs.mkdirSync(out, { recursive: true });
await m.saveToFile(out + '/twa-manifest.json');
await new TwaGenerator().createTwaProject(out, m, new ConsoleLog('gen'));
console.log('GEN_OK', m.startUrl, m.host, m.orientation, m.display);
