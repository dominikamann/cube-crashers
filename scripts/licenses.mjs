// Writes src/ui/licenses.json: every third-party part the game ships with, its license and the license text,
// for the Licenses screen under Credits & Legal. The packages come from package-lock.json (all that are not
// development-only), plus Electron (the desktop app) and the open data the Town is built from.
// Run after every change to the dependencies:  npm run licenses
// (tests/licenses.test.ts fails when the file no longer matches package-lock.json)
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = join(ROOT, 'src/ui/licenses.json');

/** the license file of a package in node_modules, as it ships */
function licenseText(dir) {
  const file = readdirSync(dir).find(f => /^licen[cs]e(\.(md|txt))?$/i.test(f));
  return file ? readFileSync(join(dir, file), 'utf8').replace(/\r\n?/g, '\n').trim() : '';
}

/** the MIT license, for a package that names it but ships no license file (its author from package.json) */
function mit(author) {
  return `MIT License

Copyright (c) ${author}

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the Software without restriction, including without limitation
the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of
the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;
}

/** the first line of a license text that starts with a copyright, else the package's author */
function copyright(text, author = '') {
  const line = text.split('\n').find(l => /^\s*(Copyright|COPYRIGHT)\s+(\([cC]\)|©|\d|[A-Z])/.test(l) && !/^\s*Copyright and related/.test(l));
  return line ? line.trim() : author ? `© ${author}` : '';
}

// where the first copyright line of the license text is not the holder (argparse: an older notice comes first)
const HOLDER = { argparse: 'Copyright (c) 2001-2020 Python Software Foundation; JavaScript port by Vitaly Puzrin and Alex Kocharin' };

const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8'));
const packages = Object.entries(lock.packages)
  .filter(([path, p]) => path && !p.dev)
  .map(([path, p]) => {
    const name = path.replace(/^.*node_modules\//, '');
    const meta = JSON.parse(readFileSync(join(ROOT, path, 'package.json'), 'utf8'));
    const author = typeof meta.author === 'string' ? meta.author : meta.author?.name;
    const text = licenseText(join(ROOT, path)) || (p.license === 'MIT' && author ? mit(author) : '');
    if (!text) throw new Error(`no license text for ${name}`);
    return { name, version: p.version, license: p.license, copyright: HOLDER[name] ?? copyright(text, author), text };
  });

const electronDir = join(ROOT, 'node_modules/electron');
const electronText = licenseText(electronDir);
const extra = [
  {
    name: 'Electron',
    version: JSON.parse(readFileSync(join(electronDir, 'package.json'), 'utf8')).version,
    license: 'MIT',
    copyright: copyright(electronText),
    text:
      electronText +
      '\n\nThe desktop app is built on Electron, which contains Chromium, Node.js and their components. Their ' +
      'licenses come with the app in the file LICENSES.chromium.html.',
  },
  {
    name: 'The Town: building models and house coordinates',
    license: 'dl-de/by-2-0',
    copyright: '© LGL, www.lgl-bw.de',
    text:
      'The buildings and addresses of the Town are made from the 3D building models (LoD2) and house coordinates ' +
      'of Baden-Württemberg, © LGL, www.lgl-bw.de, under the Datenlizenz Deutschland – Namensnennung – Version 2.0 ' +
      '(https://www.govdata.de/dl-de/by-2-0). They were changed for the game.',
  },
  {
    name: 'The Town: streets and lake',
    license: 'ODbL-1.0',
    copyright: '© OpenStreetMap contributors',
    text:
      'The streets and the lake of the Town are made from OpenStreetMap data, © OpenStreetMap contributors, ' +
      'available under the Open Database License (https://opendatacommons.org/licenses/odbl/). ' +
      'See https://www.openstreetmap.org/copyright.',
  },
];

// the game's own license, shown first (src/ui/licenses.ts)
const own = {
  name: 'Cube Crashers',
  license: 'PolyForm-Noncommercial-1.0.0',
  copyright: 'Copyright (c) 2026 Dominik Amann (https://amannlabs.eu)',
  text:
    readFileSync(join(ROOT, 'LICENSE'), 'utf8').replace(/\r\n?/g, '\n').trim() +
    '\n\nStreams and videos of the game, monetized ones too, and LAN parties are expressly allowed. For commercial ' +
    'licenses get in touch through https://cubecrashers.amannlabs.eu.',
};
writeFileSync(join(ROOT, 'src/ui/license-own.json'), JSON.stringify(own, null, 1) + '\n');

const all = [...packages.sort((a, b) => a.name.localeCompare(b.name)), ...extra];
writeFileSync(OUT, JSON.stringify(all, null, 1) + '\n');
console.log(`wrote ${all.length} entries to ${OUT}`);
