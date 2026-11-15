/**
 * `@luminsw/icon-standard` — makes one-shot icon work possible.
 *
 * The standard is carried three ways, because knowledge alone regresses:
 * a skill body for the rules, an `icon_blueprint` tool for the exact numbers and
 * compliant SVG, an `icon_render` tool so no one hand-writes a size table, and an
 * `icon_audit` tool that fails on the same mistakes the standard documents.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditPlatform, detectPlatforms } from './lib/audit.js';
import { findBrowser, renderOne } from './lib/render.js';
import { PLATFORMS, describeTarget } from './lib/spec.js';
import { buildSvg, geometryReport } from './lib/svg.js';

/** Stable Cordis plugin name. */
export const name = 'icon-standard';

/** The tool registry is the only hard dependency; skills and prompt text are optional. */
export const inject = ['tools'];

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL_FILE = path.join(HERE, 'assets', 'icon-design-standard.md');
const SKILL_NAME = 'icon-design-standard';

const PLATFORM_LABEL = { web: 'Web / PWA', android: 'Android', harmony: 'HarmonyOS' };

/**
 * Resolve the project root: an explicit path wins, then the session's working
 * directory, then the host process directory.
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {{agent?: {session?: unknown}}} exec - tool run context.
 * @param {string|undefined} root - caller-supplied root.
 * @returns {string} absolute root.
 */
function resolveRoot(ctx, exec, root) {
  if (typeof root === 'string' && root.trim() !== '') return path.resolve(root.trim());
  try {
    const service = ctx.get('workingDirectory');
    const session = exec?.agent?.session;
    if (service && session) {
      const directory = service.get(session);
      if (typeof directory === 'string' && directory !== '') return directory;
    }
  } catch {
    /* fall through to the process directory */
  }
  return process.cwd();
}

/**
 * Describe one platform's numeric contract.
 * @param {'web'|'android'|'harmony'} platform - platform key.
 * @returns {string} markdown text.
 */
function blueprintText(platform) {
  const spec = PLATFORMS[platform];
  const lines = [`# ${PLATFORM_LABEL[platform]} 图标几何`, ''];
  const report = geometryReport().find((entry) => entry.scope === (platform === 'web' ? 'web' : platform));
  if (report) {
    lines.push(`## 数值`, ...report.lines.map((line) => `- ${line}`), '');
  }
  lines.push('## 目标文件与验收带宽', '', '| 文件 | 尺寸 | 要求 |', '| --- | --- | --- |');
  for (const target of spec.targets) {
    lines.push(`| \`${target.file}\` | ${target.size} | ${describeTarget(target)} |`);
  }
  lines.push('', '## SVG 源', '');
  const seen = new Set();
  for (const target of spec.targets) {
    if (seen.has(target.kind)) continue;
    seen.add(target.kind);
    lines.push(`- \`${target.svg}\` ← 生成器 \`${target.kind}\``);
  }
  lines.push(
    '',
    '下一步：`icon_render { platform: "' + platform + '", scaffold: true }` 会把这些 SVG 写进仓库并出全部 PNG；',
    '需要直接看 SVG 源码时传 `includeSvg: true`。',
  );
  return lines.join('\n');
}

/**
 * Render every PNG a platform needs from its committed SVG sources.
 * @param {string} root - project root.
 * @param {'web'|'android'|'harmony'} platform - platform key.
 * @param {{scaffold?: boolean, overwrite?: boolean, browser?: string}} options - render options.
 * @returns {{rendered: Array<object>, scaffolded: Array<object>, browser: string, text: string}} result.
 */
function renderPlatform(root, platform, options) {
  const spec = PLATFORMS[platform];
  const browser = findBrowser(options.browser);
  if (browser === null) {
    throw new Error(
      '没有找到 Chrome/Edge。设置环境变量 CHROME，或用 browser 参数传可执行文件绝对路径（需要支持 --headless=new --screenshot）。',
    );
  }
  const scaffolded = [];
  if (options.scaffold === true) {
    const kinds = new Map();
    for (const target of spec.targets) if (!kinds.has(target.kind)) kinds.set(target.kind, target.svg);
    for (const [kind, relPath] of kinds) {
      const file = path.join(root, relPath);
      if (existsSync(file) && options.overwrite !== true) continue;
      writeFileSync(file, buildSvg(kind), 'utf8');
      scaffolded.push({ file: relPath, action: options.overwrite === true ? 'overwritten' : 'created' });
    }
  }
  const rendered = [];
  for (const target of spec.targets) {
    const svgPath = path.join(root, target.svg);
    if (!existsSync(svgPath)) {
      throw new Error(`缺少 SVG 源 ${target.svg}；先用 icon_render { platform: "${platform}", scaffold: true } 生成`);
    }
    const pngPath = path.join(root, target.file);
    const { bytes } = renderOne({ browser: browser.path, svgPath, pngPath, size: target.size });
    rendered.push({ file: target.file, size: target.size, bytes });
  }
  const lines = [`# ${PLATFORM_LABEL[platform]} 渲染完成`, '', `根目录：\`${root}\``, `浏览器：\`${browser.path}\`（${browser.source}）`, ''];
  if (scaffolded.length > 0) {
    lines.push('## 写入的 SVG 源', ...scaffolded.map((entry) => `- ${entry.action === 'created' ? '新建' : '覆盖'} \`${entry.file}\``), '');
  }
  lines.push('## 输出的 PNG', '', '| 文件 | 尺寸 | 字节 |', '| --- | --- | --- |');
  for (const entry of rendered) lines.push(`| \`${entry.file}\` | ${entry.size}×${entry.size} | ${entry.bytes} |`);
  lines.push('', '接着跑 `icon_audit` 验收，全绿再构建。');
  return { rendered, scaffolded, browser: browser.path, text: lines.join('\n') };
}

/**
 * Render an audit result as text the model can act on.
 * @param {string} root - project root.
 * @param {Array<{platform: string, ok: boolean, checks: Array<object>, notes: string[]}>} results - audit results.
 * @returns {string} markdown text.
 */
function auditText(root, results) {
  const lines = [`# 图标审校`, '', `根目录：\`${root}\``, ''];
  for (const result of results) {
    const failures = result.checks.filter((entry) => entry.level === 'fail');
    const warnings = result.checks.filter((entry) => entry.level === 'warn');
    const passes = result.checks.filter((entry) => entry.level === 'pass');
    lines.push(`## ${PLATFORM_LABEL[result.platform]} — ${result.ok ? '✅ 通过' : '❌ 未通过'}`);
    lines.push(`${passes.length} 项通过，${failures.length} 项失败，${warnings.length} 项提示`, '');
    for (const entry of failures) lines.push(`- ❌ **${entry.title}**`, `  - \`${entry.id}\`${entry.detail ? ` ${entry.detail}` : ''}`);
    for (const entry of warnings) lines.push(`- ⚠️ ${entry.title}`);
    for (const note of result.notes) lines.push(`- ℹ️ ${note}`);
    lines.push('');
  }
  const failed = results.filter((result) => !result.ok).map((result) => result.platform);
  lines.push(failed.length === 0 ? '全部通过：可以构建产物并目视确认遮罩效果。' : `先修 ${failed.join('、')}，再重跑审校。`);
  return lines.join('\n');
}

const ROOT_PARAM = {
  type: 'string',
  description: '工程根目录绝对路径。省略时用当前会话工作目录。',
};

const PLATFORM_PARAM = {
  type: 'string',
  enum: ['web', 'android', 'harmony'],
  description: 'web = Web/PWA，android = Android 自适应图标，harmony = HarmonyOS 分层图标。',
};

/**
 * Register the skill, the prompt nudge, and the three icon tools.
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 */
export function apply(ctx) {
  const skills = ctx.get('skills');
  if (skills !== undefined) {
    ctx.effect(() =>
      skills.register({
        name: SKILL_NAME,
        description:
          '设计或修改岐黄万里的图标资源（应用图标、启动图标、favicon、PWA 图标、maskable、鸿蒙分层图标）时的三端标准：品牌色、母版几何、各端尺寸与安全区、验收清单、已踩过的坑。',
        whenToUse:
          '当用户要求设计、生成、修改、审校任何图标/启动图/favicon/PWA 图标，或抱怨图标被裁、有黑角、太小、发虚、上架不合规时，先加载本技能。',
        source: 'custom',
        content: readSkillBody(),
      }),
    );
  }

  const systemPrompt = ctx.get('systemPrompt');
  if (systemPrompt !== undefined) {
    ctx.effect(() =>
      systemPrompt.section({
        name: 'icon:standard',
        order: 640,
        interpolate: false,
        text:
          '图标任务（应用图标 / 启动图标 / favicon / PWA 图标 / maskable / 鸿蒙分层图标）：先 `skill icon-design-standard`，' +
          '用 `icon_blueprint` 的精确数值作图、`icon_render` 出全尺寸、`icon_audit` 全绿后再交付；不手改 PNG，不让 SVG 源自带圆角或透明四角。',
      }),
    );
  }

  ctx.effect(() =>
    ctx.tools.register({
      name: 'icon_blueprint',
      description:
        '取图标设计标准里该端的精确几何数值（画布、圆盘直径、星环、朱印安全位置、验收带宽），以及可直接落盘的合规 SVG 生成配方。' +
        '要"一次就设计标准"时，先调它拿数值，不要凭记忆或按画布占比估算。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          platform: PLATFORM_PARAM,
          includeSvg: {
            type: 'boolean',
            description: '是否把该端各 SVG 源全文一起返回（默认 false）。',
          },
        },
        required: ['platform'],
      },
      output: {
        schema: { type: 'object' },
        render: (_args, value) => [{ type: 'text', text: /** @type {{text: string}} */ (value).text }],
      },
      execute(args) {
        const platform = args?.platform;
        if (!Object.hasOwn(PLATFORMS, platform)) throw new Error(`platform 必须是 web / android / harmony，收到 ${platform}`);
        const spec = PLATFORMS[platform];
        const kinds = new Map();
        for (const target of spec.targets) if (!kinds.has(target.kind)) kinds.set(target.kind, target.svg);
        const files = args?.includeSvg === true
          ? [...kinds].map(([kind, relPath]) => ({ path: relPath, content: buildSvg(kind) }))
          : [];
        let text = blueprintText(platform);
        if (files.length > 0) {
          text += `\n\n## 合规 SVG 源\n\n${files.map((file) => `### \`${file.path}\`\n\n\`\`\`svg\n${file.content}\`\`\``).join('\n\n')}`;
        }
        return Promise.resolve({ platform, text, files });
      },
      presentCall: (args) => ({ card: 'generic', title: `图标蓝图 · ${PLATFORM_LABEL[args?.platform] ?? args?.platform}`, kind: 'read', rawInput: args }),
    }),
  );

  ctx.effect(() =>
    ctx.tools.register({
      name: 'icon_render',
      description:
        '按标准把某端全部尺寸的 PNG 从 SVG 源重出（Web 五张、Android 五档密度、鸿蒙四张 1024），' +
        '可选 scaffold 先写入合规 SVG 源。改了图标就必须用它重出，不要手改 PNG，也不要另写渲染脚本漏尺寸。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          platform: PLATFORM_PARAM,
          root: ROOT_PARAM,
          scaffold: {
            type: 'boolean',
            description: '为 true 时先按标准生成缺失的 SVG 源（已存在的默认不覆盖）。',
          },
          overwrite: {
            type: 'boolean',
            description: '配合 scaffold 使用，为 true 时覆盖已存在的 SVG 源。',
          },
          browser: {
            type: 'string',
            description: 'Chrome/Edge 可执行文件路径。省略时自动探测（CHROME 环境变量、常见安装路径）。',
          },
        },
        required: ['platform'],
      },
      output: {
        schema: { type: 'object' },
        render: (_args, value) => [{ type: 'text', text: /** @type {{text: string}} */ (value).text }],
      },
      execute(args, exec) {
        const platform = args?.platform;
        if (!Object.hasOwn(PLATFORMS, platform)) throw new Error(`platform 必须是 web / android / harmony，收到 ${platform}`);
        const root = resolveRoot(ctx, exec, args?.root);
        const result = renderPlatform(root, platform, {
          scaffold: args?.scaffold === true,
          overwrite: args?.overwrite === true,
          browser: typeof args?.browser === 'string' ? args.browser : undefined,
        });
        return Promise.resolve({ platform, root, ...result });
      },
      presentCall: (args) => ({ card: 'generic', title: `渲染图标 · ${PLATFORM_LABEL[args?.platform] ?? args?.platform}`, kind: 'execute', rawInput: args }),
      timeoutMs: 180_000,
    }),
  );

  ctx.effect(() =>
    ctx.tools.register({
      name: 'icon_audit',
      description:
        '逐像素验收图标资源是否符合三端标准：尺寸、满版不透明/前景透明、四角 alpha、圆盘直径、朱印是否落进安全区、金环越界，' +
        '并检查 manifest / 自适应图标 XML / module.json5 / favicon 标签接线。交付前必须全绿；失败项直接给出该改的数字。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          platform: {
            type: 'string',
            enum: ['web', 'android', 'harmony', 'all'],
            description: '要审校的端；all 或省略时自动探测工程里存在哪些端。',
          },
          root: ROOT_PARAM,
        },
      },
      output: {
        schema: { type: 'object' },
        render: (_args, value) => [{ type: 'text', text: /** @type {{text: string}} */ (value).text }],
      },
      execute(args, exec) {
        const root = resolveRoot(ctx, exec, args?.root);
        const requested = typeof args?.platform === 'string' ? args.platform : 'all';
        const platforms = requested === 'all' ? detectPlatforms(root) : [requested];
        if (platforms.length === 0) {
          throw new Error(
            `${root} 里没有识别到图标工程（需要 index.html+public/、app/src/main/res/ 或 AppScope/ 之一）；用 root 参数指定工程根目录。`,
          );
        }
        const results = platforms.map((platform) => auditPlatform(root, platform));
        const ok = results.every((result) => result.ok);
        return Promise.resolve({
          root,
          ok,
          results: results.map((result) => ({
            platform: result.platform,
            ok: result.ok,
            passed: result.checks.filter((entry) => entry.level === 'pass').length,
            failures: result.checks
              .filter((entry) => entry.level === 'fail')
              .map((entry) => ({ id: entry.id, title: entry.title, detail: entry.detail ?? '' })),
            notes: result.notes,
          })),
          text: auditText(root, results),
        });
      },
      presentCall: (args) => ({ card: 'generic', title: '审校图标', kind: 'read', rawInput: args }),
    }),
  );
}

/** Read the skill body once at activation; a missing file must not break the tools. */
function readSkillBody() {
  try {
    return readFileSync(SKILL_FILE, 'utf8');
  } catch (error) {
    return `# 图标设计标准\n\n技能正文读取失败：${String(error?.message ?? error)}`;
  }
}
