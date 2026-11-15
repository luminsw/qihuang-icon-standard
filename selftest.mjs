// Temporary self-test: generated SVGs must render into audited-passing assets,
// and each documented pitfall must actually fail the audit.
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { auditPlatform } from './lib/audit.js';
import { measure } from './lib/image.js';
import { decodePng } from './lib/png.js';
import { findBrowser, renderOne } from './lib/render.js';
import { PLATFORMS } from './lib/spec.js';
import { buildSvg } from './lib/svg.js';

const WORK = path.join(tmpdir(), 'icon-selftest');
rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

const browser = findBrowser();
if (!browser) throw new Error('no browser');
console.log('browser:', browser.path);

let failures = 0;
const expect = (label, condition, extra = '') => {
  if (condition) console.log(`  ok   ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label} ${extra}`);
  }
};

/** Render a generated kind to a PNG of a given size and return its measurements. */
function renderKind(kind, size, name) {
  const dir = path.join(WORK, 'kinds');
  mkdirSync(dir, { recursive: true });
  const svgPath = path.join(dir, `${name}.svg`);
  writeFileSync(svgPath, buildSvg(kind));
  const pngPath = path.join(dir, `${name}.png`);
  renderOne({ browser: browser.path, svgPath, pngPath, size });
  return measure(decodePng(readFileSync(pngPath)));
}

console.log('\n[A] generated SVG renders inside each platform band');
{
  const android = renderKind('android-foreground', 432, 'android');
  expect('android disc 0.40-0.46', android.discRatio >= 0.4 && android.discRatio <= 0.46, android.discRatio.toFixed(4));
  expect('android content radius <= 0.6111', android.contentRadius <= 0.6111, android.contentRadius.toFixed(4));
  expect('android corners transparent', android.cornerAlpha.every((a) => a === 0), String(android.cornerAlpha));
  const maskable = renderKind('web-maskable', 512, 'maskable');
  expect('maskable seal radius <= 0.80', maskable.seal.maxRadius <= 0.8, maskable.seal.maxRadius.toFixed(4));
  expect('maskable disc 0.50-0.555', maskable.discRatio > 0.49 && maskable.discRatio < 0.56, maskable.discRatio.toFixed(4));
  expect('maskable opaque', maskable.alphaMin === 255, String(maskable.alphaMin));
  const foreground = renderKind('harmony-foreground', 1024, 'harmony-fg');
  expect('harmony disc 0.615-0.675', foreground.discRatio > 0.6 && foreground.discRatio < 0.68, foreground.discRatio.toFixed(4));
  const inset = Math.min(...Object.values(foreground.contentInset));
  expect('harmony content inset >= 0.10', inset >= 0.1, inset.toFixed(4));
  const any = renderKind('web-any', 512, 'web-any');
  expect('web-any seal edge <= 0.90', any.seal.edge <= 0.9, any.seal.edge.toFixed(4));
  expect('web-any disc 0.565-0.63', any.discRatio > 0.56 && any.discRatio < 0.64, any.discRatio.toFixed(4));
}

console.log('\n[B] a scaffolded project passes its own audit');
{
  for (const [platform, source] of [
    ['web', 'C:/Users/lumin/game/pig'],
    ['android', 'C:/Users/lumin/game/qihuang-android'],
    ['harmony', 'C:/Users/lumin/game/qihuang-harmony'],
  ]) {
    const root = path.join(WORK, `scaffold-${platform}`);
    cpSync(source, root, {
      recursive: true,
      filter: (from) => !/node_modules|\.git([\\/]|$)|[\\/]dist[\\/]|screenshots/.test(from),
    });
    // Replace the committed sources with generated ones and re-render, then audit.
    for (const target of PLATFORMS[platform].targets) {
      const svgPath = path.join(root, target.svg);
      mkdirSync(path.dirname(svgPath), { recursive: true });
      writeFileSync(svgPath, buildSvg(target.kind));
    }
    for (const target of PLATFORMS[platform].targets) {
      renderOne({ browser: browser.path, svgPath: path.join(root, target.svg), pngPath: path.join(root, target.file), size: target.size });
    }
    const result = auditPlatform(root, platform);
    const failed = result.checks.filter((entry) => entry.level === 'fail');
    expect(`${platform} scaffolded audit green`, failed.length === 0, failed.map((entry) => `${entry.id}: ${entry.title}`).join(' | '));
  }
}

console.log('\n[C] every documented pitfall fails the audit');
{
  const make = (platform, source) => {
    const root = path.join(WORK, `bad-${platform}-${Math.random().toString(36).slice(2, 7)}`);
    cpSync(source, root, {
      recursive: true,
      filter: (from) => !/node_modules|[\\/]\.git([\\/]|$)|[\\/]dist[\\/]|screenshots/.test(from),
    });
    return root;
  };
  const failsWith = (platform, root, id) => {
    const result = auditPlatform(root, platform);
    return result.checks.some((entry) => entry.level === 'fail' && entry.id.startsWith(id));
  };
  const renderText = (dir, name, svgText, size) => {
    mkdirSync(dir, { recursive: true });
    const svgPath = path.join(dir, `${name}.svg`);
    writeFileSync(svgPath, svgText);
    const pngPath = path.join(dir, `${name}.png`);
    renderOne({ browser: browser.path, svgPath, pngPath, size });
    return pngPath;
  };

  // 1. rounded corners / transparent corners on a full-bleed layer
  let root = make('web', 'C:/Users/lumin/game/pig');
  const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" rx="200" fill="#1d2a24"/></svg>`;
  copyFileSync(renderText(path.join(WORK, 'bad1'), 'rounded', rounded, 180), path.join(root, 'public/apple-touch-icon.png'));
  expect('rounded-corners caught', failsWith('web', root, 'alpha:public/apple-touch-icon.png'));

  // 2. wrong size
  root = make('web', 'C:/Users/lumin/game/pig');
  copyFileSync(path.join(root, 'public/favicon-32.png'), path.join(root, 'public/icon-192.png'));
  expect('wrong dimension caught', failsWith('web', root, 'size:public/icon-192.png'));

  // 3. seal outside the maskable safe circle (master artwork used as maskable)
  root = make('web', 'C:/Users/lumin/game/pig');
  const sealAtCorner = buildSvg('web-any').replace('translate(688 688)', 'translate(830 830)');
  copyFileSync(renderText(path.join(WORK, 'bad3'), 'maskable', sealAtCorner, 512), path.join(root, 'public/maskable-512.png'));
  expect('seal outside maskable safe circle caught', failsWith('web', root, 'seal:public/maskable-512.png'));

  // 4. missing seal
  root = make('web', 'C:/Users/lumin/game/pig');
  const noSeal = buildSvg('web-any').replace(/<g transform="translate\(688 688\)">[\s\S]*?<\/g>\s*<\/svg>/, '</svg>');
  copyFileSync(renderText(path.join(WORK, 'bad4'), 'noseal', noSeal, 512), path.join(root, 'public/icon-512.png'));
  expect('missing seal caught', failsWith('web', root, 'seal:public/icon-512.png'));

  // 5. android foreground with the seal pushed outside the 33 dp safe circle
  root = make('android', 'C:/Users/lumin/game/qihuang-android');
  const sealOutside = buildSvg('android-foreground').replace('translate(65.5 65.5)', 'translate(80 80)');
  copyFileSync(renderText(path.join(WORK, 'bad5'), 'android', sealOutside, 432), path.join(root, 'app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png'));
  expect('android safe-circle overflow caught', failsWith('android', root, 'content:app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png'));

  // 6. favicon data URI with a raw < svg fragment + spilled residue
  root = make('web', 'C:/Users/lumin/game/pig');
  const indexHtml = readFileSync(path.join(root, 'index.html'), 'utf8');
  const broken = indexHtml.replace(
    /<link rel="icon" type="image\/svg\+xml"[^>]*\/>/,
    '<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 64 64\'><rect width=\'64\' height=\'64\' fill=\'#1d2a24\'/></svg>" />',
  );
  writeFileSync(path.join(root, 'index.html'), broken);
  expect('favicon residue caught', failsWith('web', root, 'web:favicon'));

  // 7. harmony splash colour drift
  root = make('harmony', 'C:/Users/lumin/game/qihuang-harmony');
  const colorJson = path.join(root, 'entry/src/main/resources/base/element/color.json');
  writeFileSync(colorJson, readFileSync(colorJson, 'utf8').replace('#1d2a24', '#2b4435'));
  expect('harmony splash colour caught', failsWith('harmony', root, 'harmony:color'));

  // 8. opaque foreground (forgot the transparent layer)
  root = make('harmony', 'C:/Users/lumin/game/qihuang-harmony');
  writeFileSync(path.join(root, 'design/icon/foreground.svg'), buildSvg('harmony-start'));
  renderOne({
    browser: browser.path,
    svgPath: path.join(root, 'design/icon/foreground.svg'),
    pngPath: path.join(root, 'entry/src/main/resources/base/media/foreground.png'),
    size: 1024,
  });
  expect('opaque foreground caught', failsWith('harmony', root, 'alpha:entry/src/main/resources/base/media/foreground.png'));
}

console.log('\n[D] committed repos stay green');
{
  for (const [platform, root] of [
    ['web', 'C:/Users/lumin/game/pig'],
    ['android', 'C:/Users/lumin/game/qihuang-android'],
    ['harmony', 'C:/Users/lumin/game/qihuang-harmony'],
  ]) {
    const result = auditPlatform(root, platform);
    expect(`${platform} committed assets green`, result.ok, result.checks.filter((e) => e.level === 'fail').map((e) => e.title).join(' | '));
  }
}

console.log('\n[E] apply() registers schemas the harness can project');
{
  // A boolean `required` on a property is invalid JSON Schema and took the whole
  // session down once; assert the registered shapes instead of trusting review.
  const registered = { tools: [], skills: [], sections: [] };
  const fakeCtx = {
    effect: (fn) => fn(),
    get: (service) => {
      if (service === 'skills') return { register: (skill) => (registered.skills.push(skill), () => {}) };
      if (service === 'systemPrompt') return { section: (section) => (registered.sections.push(section), () => {}) };
      if (service === 'workingDirectory') return { get: () => process.cwd() };
      return undefined;
    },
    tools: { register: (definition) => (registered.tools.push(definition), () => {}) },
  };
  const { apply } = await import('./index.js');
  apply(fakeCtx);

  const schemaProblems = (node, at = 'schema', problems = []) => {
    if (node === null || typeof node !== 'object') return problems;
    if (Object.hasOwn(node, 'required') && !Array.isArray(node.required)) problems.push(`${at}.required 必须是数组`);
    for (const [key, value] of Object.entries(node)) schemaProblems(value, `${at}.${key}`, problems);
    return problems;
  };

  expect('three tools registered', registered.tools.length === 3, String(registered.tools.length));
  for (const definition of registered.tools) {
    const problems = schemaProblems(definition.parameters, `${definition.name}.parameters`);
    expect(`${definition.name} parameter schema valid`, problems.length === 0, problems.join(' | '));
    expect(`${definition.name} declares object parameters`, definition.parameters.type === 'object');
    expect(`${definition.name} has output schema + render`, Boolean(definition.output?.schema && definition.output?.render));
    expect(`${definition.name} has description`, typeof definition.description === 'string' && definition.description.length > 40);
  }
  const unknownPlatform = registered.tools.find((tool) => tool.name === 'icon_blueprint');
  let rejected = false;
  try {
    unknownPlatform.execute({ platform: 'ios' }, {});
  } catch {
    rejected = true;
  }
  expect('unknown platform rejected with an error', rejected);
  expect('skill registered with body', registered.skills.length === 1 && registered.skills[0].content.length > 1000, String(registered.skills[0]?.content?.length ?? 0));
  expect('prompt section registered', registered.sections.length === 1 && registered.sections[0].text.includes('icon_blueprint'));
}

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURES`}`);
if (!existsSync(WORK)) console.log('work dir missing');
process.exit(failures === 0 ? 0 : 1);
