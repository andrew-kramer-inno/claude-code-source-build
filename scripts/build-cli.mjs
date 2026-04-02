#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { builtinModules } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const versionRoot = path.resolve(__dirname, '..');

const sourceRoot = path.join(versionRoot, 'source');
const installedPackageJson = path.join(sourceRoot, 'package.json');
const installedSourceMap = path.join(sourceRoot, 'cli.js.map');
const defaultOutfile = path.join(versionRoot, 'dist', 'cli.js');
const workspaceRoot = path.join(versionRoot, '.cache', 'workspace');
const markerPath = path.join(workspaceRoot, '.prepared.json');
const overlayStampPath = path.join(workspaceRoot, '.overlay-install.json');
const builderVersion = 7;

const sourceExtensions = ['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs'];
const assetExtensions = ['.md', '.txt'];
const candidateExtensions = [...sourceExtensions, '.d.ts', ...assetExtensions];
const builtinSpecifiers = new Set(
  builtinModules.flatMap(specifier =>
    specifier.startsWith('node:')
      ? [specifier, specifier.slice(5)]
      : [specifier, `node:${specifier}`],
  ),
);

const baseOverlayDependencyPackages = [
  '@anthropic-ai/mcpb',
  '@anthropic-ai/foundry-sdk',
  '@anthropic-ai/sandbox-runtime',
  '@anthropic-ai/sdk',
  '@anthropic-ai/vertex-sdk',
  '@aws-sdk/client-bedrock',
  '@aws-sdk/client-bedrock-runtime',
  '@aws-sdk/client-sso',
  '@aws-sdk/client-sts',
  '@aws-sdk/credential-provider-node',
  '@azure/identity',
  '@azure/msal-common',
  '@commander-js/extra-typings',
  '@growthbook/growthbook',
  '@modelcontextprotocol/sdk',
  '@opentelemetry/api',
  '@opentelemetry/api-logs',
  '@opentelemetry/core',
  '@opentelemetry/exporter-logs-otlp-grpc',
  '@opentelemetry/exporter-logs-otlp-http',
  '@opentelemetry/exporter-logs-otlp-proto',
  '@opentelemetry/exporter-metrics-otlp-grpc',
  '@opentelemetry/exporter-metrics-otlp-http',
  '@opentelemetry/exporter-metrics-otlp-proto',
  '@opentelemetry/exporter-prometheus',
  '@opentelemetry/exporter-trace-otlp-grpc',
  '@opentelemetry/exporter-trace-otlp-http',
  '@opentelemetry/exporter-trace-otlp-proto',
  '@opentelemetry/resources',
  '@opentelemetry/sdk-logs',
  '@opentelemetry/sdk-metrics',
  '@opentelemetry/sdk-trace-base',
  '@opentelemetry/semantic-conventions',
  '@smithy/core',
  '@smithy/eventstream-serde-node',
  '@smithy/fetch-http-handler',
  '@smithy/node-http-handler',
  '@smithy/protocol-http',
  '@smithy/signature-v4',
  '@smithy/smithy-client',
  '@smithy/util-base64',
  '@typespec/ts-http-runtime',
  '@alcalzone/ansi-tokenize',
  'ajv',
  'asciichart',
  'auto-bind',
  'axios',
  'bidi-js',
  'chalk',
  'chokidar',
  'code-excerpt',
  'detect-libc',
  'diff',
  'env-paths',
  'execa',
  'figures',
  'form-data',
  'fs-extra',
  'fuse.js',
  'get-east-asian-width',
  'google-auth-library',
  'graceful-fs',
  'highlight.js',
  'human-signals',
  'indent-string',
  'jsonc-parser',
  'lodash-es',
  'lru-cache',
  'marked',
  'p-map',
  'picomatch',
  'proper-lockfile',
  'qrcode',
  'react',
  'react-reconciler',
  'retry',
  'scheduler',
  'semver',
  'sharp',
  'shell-quote',
  'signal-exit',
  'supports-hyperlinks',
  'tree-kill',
  'turndown',
  'undici',
  'usehooks-ts',
  'vscode-jsonrpc',
  'which',
  'xss',
  'yaml',
  'zod',
];

const overlayManagedPackages = new Set(baseOverlayDependencyPackages);
const unavailableOverlayPackages = new Set([
  '@ant/claude-for-chrome-mcp',
  '@ant/computer-use-input',
  '@ant/computer-use-mcp',
  '@ant/computer-use-swift',
  'src',
]);

const nativePackageTargets = new Map([
  ['audio-capture-napi', 'vendor/audio-capture-src/index.ts'],
  ['modifiers-napi', 'vendor/modifiers-napi-src/index.ts'],
  ['color-diff-napi', 'src/native-ts/color-diff/index.ts'],
]);

const specialPackageTargets = new Map([
  ['react/compiler-runtime', 'node_modules/react/cjs/react-compiler-runtime.production.js'],
  [
    'react-reconciler/constants.js',
    'node_modules/react-reconciler/cjs/react-reconciler-constants.production.js',
  ],
]);

const pinnedOverlaySourceMapPaths = new Set([
  'node_modules/react/cjs/react.production.js',
  'node_modules/react/cjs/react-compiler-runtime.production.js',
  'node_modules/react-reconciler/cjs/react-reconciler.production.js',
  'node_modules/react-reconciler/cjs/react-reconciler-constants.production.js',
]);

const args = parseArgs(process.argv.slice(2));
const packageJson = JSON.parse(fs.readFileSync(installedPackageJson, 'utf8'));
const outputPath = path.resolve(args.outfile ?? defaultOutfile);
const tempOutputPath = `${outputPath}.tmp`;
const bundleName = `${path.basename(outputPath, path.extname(outputPath))}.bundle`;
const bundlePath = path.join(path.dirname(outputPath), bundleName);
const tempBundlePath = `${bundlePath}.tmp`;
const referenceVendorRoot = path.join(sourceRoot, 'runtime-vendor');
const publicMacroValues = {
  ISSUES_EXPLAINER: 'report the issue at https://github.com/anthropics/claude-code/issues',
  PACKAGE_URL: packageJson.name,
  README_URL: 'https://code.claude.com/docs/en/overview',
  VERSION: packageJson.version,
  FEEDBACK_CHANNEL: 'https://github.com/anthropics/claude-code/issues',
  BUILD_TIME: '2026-03-30T21:59:52Z',
  NATIVE_PACKAGE_URL: null,
  VERSION_CHANGELOG: null,
};

const extraOverlayPackages = new Set();
const stubExportAugmentations = new Map();
const enabledBundleFeatures = new Set([
  // ── Original 4 ──
  'BUILDING_CLAUDE_APPS',
  'BASH_CLASSIFIER',
  'TRANSCRIPT_CLASSIFIER',
  'CHICAGO_MCP',
  // ── Unlocked: AI & Agent ──
  'ABLATION_BASELINE',
  'AGENT_MEMORY_SNAPSHOT',
  'AGENT_TRIGGERS',
  'AGENT_TRIGGERS_REMOTE',
  'BUILTIN_EXPLORE_PLAN_AGENTS',
  'BYOC_ENVIRONMENT_RUNNER',
  'COORDINATOR_MODE',
  'FORK_SUBAGENT',
  'KAIROS',
  'KAIROS_BRIEF',
  'KAIROS_CHANNELS',
  'KAIROS_DREAM',
  'KAIROS_GITHUB_WEBHOOKS',
  'KAIROS_PUSH_NOTIFICATION',
  'LODESTONE',
  'MONITOR_TOOL',
  'PROACTIVE',
  'SELF_HOSTED_RUNNER',
  'ULTRAPLAN',
  'ULTRATHINK',
  'UNATTENDED_RETRY',
  'VERIFICATION_AGENT',
  'WORKFLOW_SCRIPTS',
  // ── Unlocked: Tools & UI ──
  'AUTO_THEME',
  'CONTEXT_COLLAPSE',
  'DUMP_SYSTEM_PROMPT',
  'EXPERIMENTAL_SKILL_SEARCH',
  'HISTORY_PICKER',
  'HISTORY_SNIP',
  'HOOK_PROMPTS',
  'MCP_RICH_OUTPUT',
  'MCP_SKILLS',
  'MESSAGE_ACTIONS',
  'NATIVE_CLIPBOARD_IMAGE',
  'NEW_INIT',
  'OVERFLOW_TEST_TOOL',
  'QUICK_SEARCH',
  'REVIEW_ARTIFACT',
  'RUN_SKILL_GENERATOR',
  'SKILL_IMPROVEMENT',
  'STREAMLINED_OUTPUT',
  'TEMPLATES',
  'TERMINAL_PANEL',
  'TOKEN_BUDGET',
  'TORCH',
  'VOICE_MODE',
  'WEB_BROWSER_TOOL',
  // ── Unlocked: Networking & Bridge ──
  'BRIDGE_MODE',
  'CCR_AUTO_CONNECT',
  'CCR_MIRROR',
  'CCR_REMOTE_SETUP',
  'DAEMON',
  'DIRECT_CONNECT',
  'SSH_REMOTE',
  'UDS_INBOX',
  // ── Unlocked: Memory & Compaction ──
  'AWAY_SUMMARY',
  'CACHED_MICROCOMPACT',
  'COMPACTION_REMINDERS',
  'EXTRACT_MEMORIES',
  'REACTIVE_COMPACT',
  'TEAMMEM',
  // ── Unlocked: Telemetry & Internal ──
  'ALLOW_TEST_VERSIONS',
  'ANTI_DISTILLATION_CC',
  'BREAK_CACHE_COMMAND',
  'COMMIT_ATTRIBUTION',
  'CONNECTOR_TEXT',
  'COWORKER_TYPE_TELEMETRY',
  'DOWNLOAD_USER_SETTINGS',
  'ENHANCED_TELEMETRY_BETA',
  'FILE_PERSISTENCE',
  'HARD_FAIL',
  'MEMORY_SHAPE_TELEMETRY',
  'NATIVE_CLIENT_ATTESTATION',
  'PERFETTO_TRACING',
  'POWERSHELL_AUTO_MODE',
  'PROMPT_CACHE_BREAK_DETECTION',
  'SHOT_STATS',
  'SKIP_DETECTION_WHEN_AUTOUPDATES_DISABLED',
  'SLOW_OPERATION_LOGGING',
  'TREE_SITTER_BASH',
  'TREE_SITTER_BASH_SHADOW',
  'UPLOAD_USER_SETTINGS',
  // ── Platform detection (conditional) ──
  'IS_LIBC_GLIBC',
  'BG_SESSIONS',
]);

main();

function main() {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    prepareWorkspace(getOverlayPackages());
    ensureOverlayDependencies(getOverlayPackages());
    generateWorkspaceAugmentations();

    const buildResult = runBunBuild();
    if (buildResult.status === 0) {
      finalizeBuild();
      return;
    }

    const changed = reconcileBuildErrors(buildResult.stderr);
    if (!changed) {
      process.stdout.write(buildResult.stdout);
      process.stderr.write(buildResult.stderr);
      process.exit(buildResult.status ?? 1);
    }
  }

  console.error('Build failed after exhausting retry attempts.');
  process.exit(1);
}

function getOverlayPackages() {
  return [...new Set([...baseOverlayDependencyPackages, ...extraOverlayPackages])].sort();
}

function prepareWorkspace(overlayPackages) {
  const overlaySet = new Set(overlayPackages);
  const marker = readJsonIfExists(markerPath);
  const currentMapStat = fs.statSync(installedSourceMap);

  if (
    marker &&
    marker.builderVersion === builderVersion &&
    marker.sourceMapMtimeMs === currentMapStat.mtimeMs &&
    marker.sourceMapSize === currentMapStat.size
  ) {
    return;
  }

  const sourceMap = JSON.parse(fs.readFileSync(installedSourceMap, 'utf8'));
  const keepPaths = new Set();
  fs.mkdirSync(workspaceRoot, { recursive: true });

  for (let index = 0; index < sourceMap.sources.length; index += 1) {
    const source = sourceMap.sources[index];
    const contents = sourceMap.sourcesContent[index];
    if (contents == null) {
      continue;
    }

    const relativePath = source.replace(/^\.\.\//, '');
    if (shouldSkipSourceMapWrite(relativePath, overlaySet)) {
      continue;
    }

    const destination = path.join(workspaceRoot, relativePath);
    keepPaths.add(destination);

    fs.mkdirSync(path.dirname(destination), { recursive: true });
    if (!isFileContentEqual(destination, contents)) {
      fs.writeFileSync(destination, contents, 'utf8');
    }
  }

  writeWorkspaceTsconfig(keepPaths);
  writeWorkspacePackageJson(keepPaths);
  restorePinnedOverlaySourceMapFiles(keepPaths);
  generateSourceAliasShims(keepPaths);
  generateNativePackageShims(keepPaths);
  generatePackageEntryShims(keepPaths);
  generatePackageSubpathShims(keepPaths);
  ensureSharpPackageJson(keepPaths);

  pruneMissingFiles(workspaceRoot, keepPaths, overlaySet);

  fs.writeFileSync(
    markerPath,
    JSON.stringify(
      {
        builderVersion,
        sourceMapMtimeMs: currentMapStat.mtimeMs,
        sourceMapSize: currentMapStat.size,
        version: packageJson.version,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
}

function ensureOverlayDependencies(packageNames) {
  const stamp = readJsonIfExists(overlayStampPath);
  const desiredKey = JSON.stringify(packageNames);
  const allPresent = packageNames.every(packageName =>
    isDirectory(packageRootPath(path.join(workspaceRoot, 'node_modules'), packageName)),
  );

  if (stamp?.packagesKey === desiredKey && allPresent) {
    return;
  }

  fs.mkdirSync(workspaceRoot, { recursive: true });
  writeWorkspacePackageJson(new Set([path.join(workspaceRoot, 'package.json')]));

  for (const packageName of packageNames) {
    removePath(packageRootPath(path.join(workspaceRoot, 'node_modules'), packageName));
  }

  const installArgs = [
    'install',
    '--no-package-lock',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    '--legacy-peer-deps',
    ...packageNames,
  ];
  const install = spawnSync('npm', installArgs, {
    cwd: workspaceRoot,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });

  if (install.status !== 0) {
    if (install.stdout) process.stdout.write(install.stdout);
    if (install.stderr) process.stderr.write(install.stderr);
    process.exit(install.status ?? 1);
  }

  fs.writeFileSync(
    overlayStampPath,
    JSON.stringify({ packagesKey: desiredKey }, null, 2) + '\n',
    'utf8',
  );
}

function generateWorkspaceAugmentations() {
  restoreSourceMapFiles(new Set(getOverlayPackages()));
  restorePinnedOverlaySourceMapFiles(new Set());
  generateSourceAliasShims(new Set());
  generateNativePackageShims(new Set());
  generatePackageEntryShims(new Set());
  generatePackageSubpathShims(new Set());
  ensureSharpPackageJson(new Set());
  ensureCliBoxesAsset(new Set());
  generateMissingLocalStubs();
  generateSourceAliasShims(new Set());
  overlaySourceAssets();
  restoreMissingSourceMapFiles();
  ensureNativeAddonPrebuilds();
  ensureUnavailablePackageEntries();
  patchMissingExports();
  patchFeatureFlags();
}

/**
 * Copy native addon .node files to workspace prebuilds/ directories.
 * Bun hardcodes __dirname at build time, so the bundled code resolves
 * native requires to the workspace path, not the dist path.
 */
function ensureNativeAddonPrebuilds() {
  const nativeAddonsDir = path.join(sourceRoot, 'native-addons');
  if (!isDirectory(nativeAddonsDir)) return;

  const prebuilds = [
    { src: 'computer-use-swift.node', pkg: '@ant/computer-use-swift', dest: 'computer_use.node' },
    { src: 'computer-use-input.node', pkg: '@ant/computer-use-input', dest: 'computer-use-input.node' },
  ];

  for (const { src, pkg, dest } of prebuilds) {
    const source = path.join(nativeAddonsDir, src);
    if (!isFile(source)) continue;
    const prebuildsDir = path.join(
      packageRootPath(path.join(workspaceRoot, 'node_modules'), pkg), 'prebuilds',
    );
    const destPath = path.join(prebuildsDir, dest);
    fs.mkdirSync(prebuildsDir, { recursive: true });
    if (!isFile(destPath) || fs.statSync(source).size !== fs.statSync(destPath).size) {
      fs.copyFileSync(source, destPath);
    }
  }
}

/**
 * Restore files that are imported by source-map-extracted code but missing
 * from the source map itself. These were reconstructed from the compiled
 * bundle and type definitions.
 */
function restoreMissingSourceMapFiles() {
  const files = [
    {
      path: 'node_modules/@ant/computer-use-mcp/src/executor.ts',
      content: [
        '// Reconstructed — type-only module (erased at build time)',
        '',
        'export interface ScreenshotResult {',
        '  base64: string; width: number; height: number;',
        '  displayId: number; scaleX: number; scaleY: number;',
        '}',
        '',
        'export interface DisplayGeometry {',
        '  displayId: number; x: number; y: number;',
        '  width: number; height: number; scaleFactor: number;',
        '}',
        '',
        'export interface FrontmostApp {',
        '  bundleId: string; name: string; pid: number;',
        '}',
        '',
        'export interface InstalledApp {',
        '  bundleId: string; name: string; path: string;',
        '}',
        '',
        'export interface RunningApp {',
        '  bundleId: string; name: string; pid: number; isHidden: boolean;',
        '}',
        '',
        'export interface ResolvePrepareCaptureResult {',
        '  displayId: number; geometry: DisplayGeometry;',
        '}',
        '',
        'export interface ComputerExecutor {',
        '  screenshot(): Promise<ScreenshotResult>;',
        '  click(x: number, y: number, button?: string): Promise<void>;',
        '  doubleClick(x: number, y: number): Promise<void>;',
        '  type(text: string): Promise<void>;',
        '  key(keys: string): Promise<void>;',
        '  moveMouse(x: number, y: number): Promise<void>;',
        '  drag(sx: number, sy: number, ex: number, ey: number): Promise<void>;',
        '  scroll(x: number, y: number, dir: string, amount: number): Promise<void>;',
        '  getInstalledApps(): Promise<InstalledApp[]>;',
        '  getRunningApps(): Promise<RunningApp[]>;',
        '  getFrontmostApp(): Promise<FrontmostApp>;',
        '  getDisplayGeometry(): Promise<DisplayGeometry[]>;',
        '  resolveAndPrepareCapture(): Promise<ResolvePrepareCaptureResult>;',
        '}',
        '',
      ].join('\n'),
    },
    {
      path: 'node_modules/@ant/computer-use-mcp/src/subGates.ts',
      content: [
        '// Reconstructed — CuSubGates on/off constants',
        'import type { CuSubGates } from "./types.js";',
        '',
        'export const ALL_SUB_GATES_OFF: CuSubGates = {',
        '  pixelValidation: false, clipboardPasteMultiline: false,',
        '  mouseAnimation: false, hideBeforeAction: false,',
        '  autoTargetDisplay: false, clipboardGuard: false,',
        '};',
        '',
        'export const ALL_SUB_GATES_ON: CuSubGates = {',
        '  pixelValidation: true, clipboardPasteMultiline: true,',
        '  mouseAnimation: true, hideBeforeAction: true,',
        '  autoTargetDisplay: true, clipboardGuard: true,',
        '};',
        '',
      ].join('\n'),
    },
  ];

  for (const { path: relPath, content } of files) {
    const dest = path.join(workspaceRoot, relPath);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (!isFileContentEqual(dest, content)) {
      fs.writeFileSync(dest, content, 'utf8');
    }
  }
}

function overlaySourceAssets() {
  const sourceSrc = path.join(sourceRoot, 'src');
  if (!isDirectory(sourceSrc)) {
    return;
  }
  const overlayExtensions = [...assetExtensions, ...sourceExtensions];
  for (const filePath of walkFiles(sourceSrc)) {
    const ext = path.extname(filePath);
    if (!overlayExtensions.includes(ext)) {
      continue;
    }
    const relativePath = path.relative(sourceSrc, filePath);
    const destination = path.join(workspaceRoot, 'src', relativePath);
    const contents = fs.readFileSync(filePath, 'utf8');
    if (contents && !contents.startsWith('Stub asset for ')) {
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      if (!isFileContentEqual(destination, contents)) {
        fs.writeFileSync(destination, contents, 'utf8');
      }
    }
  }
}

function ensureUnavailablePackageEntries() {
  const stubJs = '// AUTO-STUB: unavailable package\n' +
    'export default new Proxy({}, { get: (t, k) => () => {} });\n';
  for (const packageName of unavailableOverlayPackages) {
    if (packageName === 'src') {
      continue;
    }
    const pkgRoot = packageRootPath(path.join(workspaceRoot, 'node_modules'), packageName);
    fs.mkdirSync(pkgRoot, { recursive: true });

    // If this package has real source from the source map, use it instead of stubs
    const realEntryPaths = [
      { file: path.join(pkgRoot, 'src', 'index.ts'), main: 'src/index.ts' },
      { file: path.join(pkgRoot, 'js', 'index.js'), main: 'js/index.js' },
    ];
    const realEntry = realEntryPaths.find(e =>
      isFile(e.file) && !fs.readFileSync(e.file, 'utf8').includes('AUTO-STUB'));

    if (realEntry) {
      // Point package.json to real source entry
      const pkgJsonPath = path.join(pkgRoot, 'package.json');
      fs.writeFileSync(pkgJsonPath,
        JSON.stringify({ name: packageName, version: '0.0.0-stub', main: realEntry.main }, null, 2) + '\n',
        'utf8');
      // Remove extensionless proxy files that conflict
      for (const filePath of walkFiles(pkgRoot)) {
        if (!path.extname(filePath) && !filePath.endsWith('package.json') && isFile(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
      // Create re-export proxies for subpath imports (e.g. @pkg/sentinelApps → src/sentinelApps.ts)
      const srcDir = path.join(pkgRoot, 'src');
      if (isDirectory(srcDir)) {
        for (const srcFile of walkFiles(srcDir)) {
          const ext = path.extname(srcFile);
          if (!sourceExtensions.includes(ext)) continue;
          const basename = path.basename(srcFile, ext);
          if (basename === 'index') continue;
          const proxyPath = path.join(pkgRoot, basename + '.js');
          const relPath = './' + toPosix(path.relative(pkgRoot, srcFile));
          const srcContent = fs.readFileSync(srcFile, 'utf8');
          const hasDefault = /export\s+default\b/.test(srcContent);
          const proxyContent = `export * from ${JSON.stringify(relPath)};\n` +
            (hasDefault ? `export { default } from ${JSON.stringify(relPath)};\n` : '');
          if (!isFileContentEqual(proxyPath, proxyContent)) {
            fs.writeFileSync(proxyPath, proxyContent, 'utf8');
          }
        }
      }
      continue;
    }

    // Write stub index.js with any augmented exports from previous build attempts
    const indexPath = path.join(pkgRoot, 'index.js');
    const augmented = stubExportAugmentations.get(indexPath) ?? new Set();
    const namedExports = [...augmented].map(n => `export const ${n} = undefined;`).join('\n');
    const fullStub = stubJs + (namedExports ? '\n' + namedExports + '\n' : '');
    fs.writeFileSync(indexPath, fullStub, 'utf8');
    // Write package.json pointing to it
    const pkgJsonPath = path.join(pkgRoot, 'package.json');
    fs.writeFileSync(pkgJsonPath,
      JSON.stringify({ name: packageName, version: '0.0.0-stub', main: 'index.js' }, null, 2) + '\n',
      'utf8');
    // Stub any source map .ts files that have broken internal refs — but only once
    if (isDirectory(path.join(pkgRoot, 'src'))) {
      for (const filePath of walkFiles(pkgRoot)) {
        if ((filePath.endsWith('.ts') || filePath.endsWith('.tsx')) && !fs.readFileSync(filePath, 'utf8').includes('AUTO-STUB')) {
          // Collect named exports from the original source so stubs satisfy importers
          const origContent = fs.readFileSync(filePath, 'utf8');
          const exportNames = [...origContent.matchAll(/export\s+(?:const|let|var|function|class|type|interface|enum)\s+(\w+)/g)].map(m => m[1]);
          const exportLines = exportNames.map(n => `export const ${n} = undefined;`).join('\n');
          fs.writeFileSync(filePath, '// AUTO-STUB\n' + exportLines + '\nexport {};\n', 'utf8');
        }
      }
    }
    // Remove extensionless proxy files that conflict with .js stubs
    for (const filePath of walkFiles(pkgRoot)) {
      if (!path.extname(filePath) && !filePath.endsWith('package.json') && isFile(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    // Create stub files for known subpath imports, with augmented exports
    for (const subpath of ['sentinelApps', 'types', 'subGates']) {
      const subFile = path.join(pkgRoot, subpath + '.js');
      const subAugmented = stubExportAugmentations.get(subFile) ?? new Set();
      const subNamedExports = [...subAugmented].map(n => `export const ${n} = undefined;`).join('\n');
      fs.writeFileSync(subFile, stubJs + (subNamedExports ? '\n' + subNamedExports + '\n' : ''), 'utf8');
    }
  }
}

function patchMissingExports() {
  // Some exports are conditionally defined under feature flags we haven't enabled.
  // Add no-op stubs for them so bun can resolve the imports.
  const patches = [
    ['src/bootstrap/state.ts', 'export function isReplBridgeActive() { return false; }'],
  ];
  for (const [relPath, code] of patches) {
    const filePath = path.join(workspaceRoot, relPath);
    if (!isFile(filePath)) {
      continue;
    }
    const contents = fs.readFileSync(filePath, 'utf8');
    if (!contents.includes(code.split('(')[0])) {
      fs.writeFileSync(filePath, contents + '\n' + code + '\n', 'utf8');
    }
  }
}

function patchFeatureFlags() {
  const featureShim =
    `const feature = (flag) => (${JSON.stringify([...enabledBundleFeatures])}).includes(flag);\n`;
  for (const filePath of walkFiles(path.join(workspaceRoot, 'src'))) {
    if (!sourceExtensions.includes(path.extname(filePath))) {
      continue;
    }
    const contents = fs.readFileSync(filePath, 'utf8');
    if (!contents.includes('bun:bundle')) {
      continue;
    }
    const updated = contents
      .replace(/import\s*\{[^}]*\bfeature\b[^}]*\}\s*from\s*['"]bun:bundle['"]\s*;?\n?/g,
        featureShim);
    if (updated !== contents) {
      fs.writeFileSync(filePath, updated, 'utf8');
    }
  }
}

function runBunBuild() {
  removePath(tempOutputPath);
  removePath(tempBundlePath);

  const bunArgs = [
    'build',
    path.join(workspaceRoot, 'src/entrypoints/cli.tsx'),
    '--target=node',
    '--format=esm',
    '--loader=.md:text',
    '--loader=.txt:text',
    '--env=USER_TYPE*',
    '--env=CLAUDE_CODE_VERIFY_PLAN*',
    `--root=${workspaceRoot}`,
    `--outdir=${tempBundlePath}`,
  ];
  if (!args.noMinify) {
    bunArgs.push('--minify');
  }

  return spawnSync('bun', bunArgs, {
    cwd: workspaceRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      USER_TYPE: 'ant',
      CLAUDE_CODE_VERIFY_PLAN: 'false',
    },
    maxBuffer: 256 * 1024 * 1024,
  });
}

function finalizeBuild() {
  const bundleEntryPath = path.join(bundlePath, 'src', 'entrypoints', 'cli.js');
  const wrapperImportPath = ensureDotPath(
    toPosix(path.relative(path.dirname(outputPath), bundleEntryPath)),
  );
  const wrapperSource =
    `${createBanner(packageJson.version)}` +
    `// ── [MOD] Runtime environment overrides ──\n` +
    `process.env.USER_TYPE = 'ant';\n` +
    `process.env.NODE_ENV = 'development';\n` +
    `process.env.CLAUDE_CODE_ENABLE_TELEMETRY = '';\n` +
    `process.env.CLAUDE_CODE_DATADOG_FLUSH_INTERVAL_MS = '999999999';\n` +
    `process.env.CLAUDE_CODE_ALLOW_ALL_MODELS = '1';\n` +
    `process.env.DISABLE_AUTOUPDATER = '1';\n` +
    `process.env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS = '1';\n` +
    `\n` +
    `const __localStorageData = new Map();\n` +
    `Object.defineProperty(globalThis, 'localStorage', {\n` +
    `  configurable: true,\n` +
    `  enumerable: true,\n` +
    `  writable: true,\n` +
    `  value: {\n` +
    `  get length() {\n` +
    `    return __localStorageData.size;\n` +
    `  },\n` +
    `  clear() {\n` +
    `    __localStorageData.clear();\n` +
    `  },\n` +
    `  getItem(key) {\n` +
    `    const value = __localStorageData.get(String(key));\n` +
    `    return value === undefined ? null : value;\n` +
    `  },\n` +
    `  key(index) {\n` +
    `    return [...__localStorageData.keys()][index] ?? null;\n` +
    `  },\n` +
    `  removeItem(key) {\n` +
    `    __localStorageData.delete(String(key));\n` +
    `  },\n` +
    `  setItem(key, value) {\n` +
    `    __localStorageData.set(String(key), String(value));\n` +
    `  },\n` +
    `  },\n` +
    `});\n` +
    `globalThis.MACRO ??= Object.freeze(${JSON.stringify(publicMacroValues, null, 2)});\n` +
    `await import(${JSON.stringify(wrapperImportPath)});\n`;

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(tempOutputPath, wrapperSource, 'utf8');
  copyRuntimeVendorAssets(tempBundlePath);
  removePath(bundlePath);
  fs.renameSync(tempBundlePath, bundlePath);
  fs.chmodSync(tempOutputPath, 0o755);
  fs.renameSync(tempOutputPath, outputPath);
  console.log(`Built ${outputPath}`);
}


function reconcileBuildErrors(stderrText) {
  let changed = false;

  for (const match of stderrText.matchAll(
    /error: Could not resolve: "([^"]+)"[\s\S]*?\n\s+at ([^\n:]+):\d+:\d+/g,
  )) {
    const specifier = match[1];
    const importer = match[2];

    if (specifier.startsWith('.')) {
      continue;
    }
    if (specifier.startsWith('src/')) {
      continue;
    }
    if (specifier.startsWith('#')) {
      if (importer.includes(`${path.sep}chalk${path.sep}`) && !overlayManagedPackages.has('chalk')) {
        extraOverlayPackages.add('chalk');
        changed = true;
      }
      continue;
    }
    if (specifier.startsWith('node:') || specifier.startsWith('bun:') || builtinSpecifiers.has(specifier)) {
      continue;
    }

    const packageName = rootPackageName(specifier);
    if (!packageName || unavailableOverlayPackages.has(packageName)) {
      continue;
    }
    if (!overlayManagedPackages.has(packageName) && !extraOverlayPackages.has(packageName)) {
      extraOverlayPackages.add(packageName);
      changed = true;
    }
  }

  for (const match of stderrText.matchAll(
    /error: No matching export in "([^"]+)" for import "([^"]+)"/g,
  )) {
    const targetPath = resolveBuildPath(match[1]);
    const exportName = match[2];
    if (!isFile(targetPath)) {
      continue;
    }
    const contents = fs.readFileSync(targetPath, 'utf8');
    if (!contents.includes('// AUTO-STUB')) {
      continue;
    }
    const set = stubExportAugmentations.get(targetPath) ?? new Set();
    if (!set.has(exportName)) {
      set.add(exportName);
      stubExportAugmentations.set(targetPath, set);
      changed = true;
    }
  }

  if (changed) {
    ensureOverlayDependencies(getOverlayPackages());
    generateWorkspaceAugmentations();
  }

  return changed;
}

function generateMissingLocalStubs() {
  const missingByTarget = collectMissingLocalImports(path.join(workspaceRoot, 'src'));
  for (const [targetPath, refs] of missingByTarget.entries()) {
    writeLocalStub(targetPath, refs);
  }
}

function collectMissingLocalImports(root) {
  const missing = new Map();
  for (const importer of walkFiles(root)) {
    if (!sourceExtensions.includes(path.extname(importer))) {
      continue;
    }

    const contents = fs.readFileSync(importer, 'utf8');
    for (const match of contents.matchAll(
      /\bimport\s+['"]([^'"]+)['"]|\bfrom\s+['"]([^'"]+)['"]|\brequire\(\s*['"]([^'"]+)['"]\s*\)|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
    )) {
      const specifier = match[1] || match[2] || match[3] || match[4];
      if (!specifier) {
        continue;
      }

      const isRelativeImport = specifier.startsWith('.');
      const isSrcAliasImport = specifier.startsWith('src/');
      if (!isRelativeImport && !isSrcAliasImport) {
        continue;
      }

      const resolved = isRelativeImport
        ? resolveLike(importer, specifier)
        : resolveExistingPath(path.join(workspaceRoot, specifier));
      if (resolved && !isAutoStubFile(resolved)) {
        continue;
      }

      const targetPath = resolved ?? (
        isRelativeImport
          ? path.resolve(path.dirname(importer), specifier)
          : path.join(workspaceRoot, specifier)
      );
      const refs = missing.get(targetPath) ?? [];
      refs.push({ importer, specifier });
      missing.set(targetPath, refs);
    }
  }
  return missing;
}

function writeLocalStub(targetPath, refs) {
  const extension = path.extname(targetPath);
  if (assetExtensions.includes(extension)) {
    writeTextStub(targetPath);
    return;
  }
  if (targetPath.endsWith('.d.ts')) {
    writeTypedStub(targetPath);
    return;
  }

  const exportInfo = inferStubExports(targetPath, refs);
  const source = renderStubModule(targetPath, exportInfo);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  if (!isFileContentEqual(targetPath, source)) {
    fs.writeFileSync(targetPath, source, 'utf8');
  }
}

function writeTextStub(targetPath) {
  const source = `Stub asset for ${path.basename(targetPath)}\n`;
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  if (!isFileContentEqual(targetPath, source)) {
    fs.writeFileSync(targetPath, source, 'utf8');
  }
}

function writeTypedStub(targetPath) {
  const source = '// AUTO-STUB: generated declaration placeholder\nexport {}\n';
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  if (!isFileContentEqual(targetPath, source)) {
    fs.writeFileSync(targetPath, source, 'utf8');
  }
}

function inferStubExports(targetPath, refs) {
  const named = new Set(stubExportAugmentations.get(targetPath) ?? []);
  let hasDefault = false;

  for (const { importer, specifier } of refs) {
    const contents = fs.readFileSync(importer, 'utf8');
    const escapedSpecifier = escapeRegExp(specifier);
    for (const clause of findImportClauses(contents, specifier)) {
      if (clause.startsWith('{')) {
        parseNamedImports(clause).forEach(name => named.add(name));
      } else if (clause.startsWith('* as')) {
        // Namespace imports do not require explicit named exports.
      } else if (clause.includes('{')) {
        hasDefault = true;
        const braceStart = clause.indexOf('{');
        parseNamedImports(clause.slice(braceStart)).forEach(name => named.add(name));
      } else if (clause.length > 0) {
        hasDefault = true;
      }
    }

    for (const match of contents.matchAll(
      new RegExp(`require\\(['"]${escapedSpecifier}['"]\\)\\.([A-Za-z0-9_$]+)`, 'g'),
    )) {
      named.add(match[1]);
    }

    for (const match of contents.matchAll(
      new RegExp(`import\\(['"]${escapedSpecifier}['"]\\)\\.([A-Za-z0-9_$]+)`, 'g'),
    )) {
      named.add(match[1]);
    }

    for (const match of contents.matchAll(
      new RegExp(
        `(?:const|let|var)\\s*\\{([^}]+)\\}\\s*=\\s*await\\s+import\\(['"]${escapedSpecifier}['"]\\)`,
        'g',
      ),
    )) {
      parseNamedImports(`{${match[1]}}`).forEach(name => named.add(name));
    }
  }

  if (named.has('default')) {
    named.delete('default');
    hasDefault = true;
  }

  const basename = path.basename(targetPath, path.extname(targetPath));
  if (basename !== 'index' && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(basename)) {
    named.add(basename);
  }

  return { hasDefault, named: [...named].sort() };
}

function findImportClauses(contents, specifier) {
  const escapedSpecifier = escapeRegExp(specifier);
  const statementPattern = new RegExp(
    `(?:^|\\n)\\s*import\\s+(?!type\\b)((?:(?!\\n\\s*import\\b)[\\s\\S])*?)\\s+from\\s+['"]${escapedSpecifier}['"]`,
    'g',
  );

  return [...contents.matchAll(statementPattern)].map(match => match[1].trim());
}

function renderStubModule(targetPath, exportInfo) {
  const basename = path.basename(targetPath, path.extname(targetPath));
  const lines = [
    '// AUTO-STUB: generated from missing sourcemap-local module',
    'const __makeStub = name => {',
    '  const fn = (..._args) => undefined;',
    '  return new Proxy(fn, {',
    "    get(_target, prop) {",
    "      if (prop === 'then') return undefined;",
    "      if (prop === Symbol.toPrimitive) return () => 0;",
    "      if (prop === 'toString') return () => `[stub ${name}]`;",
    '      return __makeStub(`${name}.${String(prop)}`);',
    '    },',
    '    apply() {',
    '      return undefined;',
    '    },',
    '    construct() {',
    '      return {};',
    '    },',
    '  });',
    '};',
    '',
  ];

  if (exportInfo.hasDefault) {
    lines.push(`export default ${renderStubExpression('default', basename)};`);
  }

  for (const exportName of exportInfo.named) {
    lines.push(`export const ${exportName} = ${renderStubExpression(exportName, basename)};`);
  }

  if (!exportInfo.hasDefault && exportInfo.named.length === 0) {
    lines.push('export default __makeStub("default");');
  }

  lines.push('');
  return lines.join('\n');
}

function renderStubExpression(exportName, basename) {
  if (/^(is|has|should|can)[A-Z_]/.test(exportName)) {
    return '(..._args) => false';
  }
  if (/^(get|create|build|load|parse|compute|find|fetch|read|write|launch|normalize)[A-Z_]/.test(exportName)) {
    return `__makeStub(${JSON.stringify(exportName)})`;
  }
  if (/^use[A-Z_]/.test(exportName)) {
    return '(..._args) => ({})';
  }
  if (exportName === 'BROWSER_TOOLS') {
    return '[]';
  }
  if (/_NAME$/.test(exportName)) {
    return JSON.stringify(basename);
  }
  if (/(Dialog|Message|Callout|Panel|View|Layout|Wrapper|Chooser|Wizard|Provider|Box|Text|App)$/.test(exportName)) {
    return '() => null';
  }
  return `__makeStub(${JSON.stringify(exportName)})`;
}

function generateSourceAliasShims(keepPaths) {
  const srcRoot = path.join(workspaceRoot, 'src');
  const aliasRoot = path.join(workspaceRoot, 'node_modules', 'src');
  for (const actualFile of walkFiles(srcRoot)) {
    const extension = path.extname(actualFile);
    if (!sourceExtensions.includes(extension)) {
      continue;
    }
    const relativePath = path.relative(srcRoot, actualFile);
    const proxyRelativePath = relativePath.replace(/\.[^.]+$/, getProxyExtension(extension));
    const proxyPath = path.join(aliasRoot, proxyRelativePath);
    keepPaths.add(proxyPath);
    writeProxyModule(proxyPath, actualFile);
  }
}

function generateNativePackageShims(keepPaths) {
  for (const [packageName, relativeTarget] of nativePackageTargets) {
    const proxyPath = path.join(
      packageRootPath(path.join(workspaceRoot, 'node_modules'), packageName),
      'index.js',
    );
    const targetPath = path.join(workspaceRoot, relativeTarget);
    keepPaths.add(proxyPath);
    writeProxyModule(proxyPath, targetPath);
  }
}

function generatePackageEntryShims(keepPaths) {
  walkPackageRoots(path.join(workspaceRoot, 'node_modules'), (packageName, packageRoot) => {
    if (overlayManagedPackages.has(packageName) || nativePackageTargets.has(packageName)) {
      return;
    }

    const indexProxy = path.join(packageRoot, 'index.js');
    if (isFile(indexProxy)) {
      return;
    }

    const targetPath = findPackageEntry(packageName, packageRoot);
    if (!targetPath) {
      return;
    }

    keepPaths.add(indexProxy);
    writeProxyModule(indexProxy, targetPath);
  });
}

function generatePackageSubpathShims(keepPaths) {
  const imported = collectBareSpecifiers([
    path.join(workspaceRoot, 'src'),
    path.join(workspaceRoot, 'vendor'),
    path.join(workspaceRoot, 'node_modules'),
  ]);

  for (const specifier of imported.fullSpecifiers) {
    if (specifier.startsWith('.') || specifier.startsWith('#')) {
      continue;
    }
    if (specialPackageTargets.has(specifier)) {
      const target = path.join(workspaceRoot, specialPackageTargets.get(specifier));
      const proxy = packageSubpathProxyPath(specifier);
      keepPaths.add(proxy);
      writeProxyModule(proxy, target);
      continue;
    }

    const parsed = splitPackageSpecifier(specifier);
    if (!parsed?.subpath || overlayManagedPackages.has(parsed.packageName)) {
      continue;
    }

    const packageRoot = packageRootPath(path.join(workspaceRoot, 'node_modules'), parsed.packageName);
    if (!isDirectory(packageRoot)) {
      continue;
    }

    const exactPath = path.join(packageRoot, parsed.subpath);
    if (resolveExistingPath(exactPath)) {
      continue;
    }

    const candidates = [
      path.join(packageRoot, 'dist', 'esm', parsed.subpath),
      path.join(packageRoot, 'dist', parsed.subpath),
      path.join(packageRoot, 'src', parsed.subpath),
      path.join(packageRoot, 'lib', parsed.subpath),
      path.join(packageRoot, 'esm', parsed.subpath),
      path.join(packageRoot, 'cjs', parsed.subpath),
      path.join(packageRoot, 'source', parsed.subpath),
    ];
    const target = candidates.map(resolveExistingPath).find(Boolean);
    if (!target) {
      continue;
    }

    const proxy = packageSubpathProxyPath(specifier);
    keepPaths.add(proxy);
    writeProxyModule(proxy, target);
  }
}

function ensureSharpPackageJson(keepPaths) {
  const sharpRoot = path.join(workspaceRoot, 'node_modules', 'sharp');
  if (!isDirectory(sharpRoot)) {
    return;
  }
  const packageJsonPath = path.join(sharpRoot, 'package.json');
  const packageJsonSource =
    JSON.stringify(
      {
        name: 'sharp',
        version: '0.0.0-stub',
        main: './lib/index.js',
      },
      null,
      2,
    ) + '\n';
  keepPaths.add(packageJsonPath);
  const existing = readJsonIfExists(packageJsonPath);
  if (!existing || existing.version === '0.0.0-stub') {
    fs.writeFileSync(packageJsonPath, packageJsonSource, 'utf8');
  }
}

function ensureCliBoxesAsset(keepPaths) {
  const boxesPath = path.join(workspaceRoot, 'node_modules', 'cli-boxes', 'boxes.json');
  // Include both old-style (top/bottom/left/right) and new-style (horizontal/vertical)
  // properties so both the extracted source code and the npm cli-boxes consumers work.
  const boxesSource =
    JSON.stringify(
      {
        single: {
          topLeft: '┌',
          top: '─',
          topRight: '┐',
          right: '│',
          bottomRight: '┘',
          bottom: '─',
          bottomLeft: '└',
          left: '│',
          vertical: '│',
          horizontal: '─',
        },
        double: {
          topLeft: '╔',
          top: '═',
          topRight: '╗',
          right: '║',
          bottomRight: '╝',
          bottom: '═',
          bottomLeft: '╚',
          left: '║',
          vertical: '║',
          horizontal: '═',
        },
        round: {
          topLeft: '╭',
          top: '─',
          topRight: '╮',
          right: '│',
          bottomRight: '╯',
          bottom: '─',
          bottomLeft: '╰',
          left: '│',
          vertical: '│',
          horizontal: '─',
        },
        bold: {
          topLeft: '┏',
          top: '━',
          topRight: '┓',
          right: '┃',
          bottomRight: '┛',
          bottom: '━',
          bottomLeft: '┗',
          left: '┃',
          vertical: '┃',
          horizontal: '━',
        },
      },
      null,
      2,
    ) + '\n';
  keepPaths.add(boxesPath);
  if (!isFileContentEqual(boxesPath, boxesSource)) {
    fs.mkdirSync(path.dirname(boxesPath), { recursive: true });
    fs.writeFileSync(boxesPath, boxesSource, 'utf8');
  }
}

function writeWorkspacePackageJson(keepPaths) {
  const packageJsonPath = path.join(workspaceRoot, 'package.json');
  const packageJsonSource =
    JSON.stringify(
      {
        name: '@anthropic-ai/claude-code-build-workspace',
        private: true,
        type: 'module',
      },
      null,
      2,
    ) + '\n';
  keepPaths.add(packageJsonPath);
  if (!isFileContentEqual(packageJsonPath, packageJsonSource)) {
    fs.writeFileSync(packageJsonPath, packageJsonSource, 'utf8');
  }
}

function writeWorkspaceTsconfig(keepPaths) {
  const tsconfigPath = path.join(workspaceRoot, 'tsconfig.json');
  const tsconfigSource =
    JSON.stringify(
      {
        compilerOptions: {
          jsx: 'react',
        },
      },
      null,
      2,
    ) + '\n';
  keepPaths.add(tsconfigPath);
  if (!isFileContentEqual(tsconfigPath, tsconfigSource)) {
    fs.writeFileSync(tsconfigPath, tsconfigSource, 'utf8');
  }
}

function writeProxyModule(proxyPath, targetPath) {
  fs.mkdirSync(path.dirname(proxyPath), { recursive: true });
  const relativeTarget = ensureDotPath(toPosix(path.relative(path.dirname(proxyPath), targetPath)));
  const proxySource = [
    `import * as module_0 from ${JSON.stringify(relativeTarget)};`,
    `export * from ${JSON.stringify(relativeTarget)};`,
    'export default module_0.default;',
    '',
  ].join('\n');
  if (!isFileContentEqual(proxyPath, proxySource)) {
    fs.writeFileSync(proxyPath, proxySource, 'utf8');
  }
}

function findPackageEntry(packageName, packageRoot) {
  const leafName = packageName.split('/').pop();
  const candidates = [
    'index.js',
    'index.mjs',
    'index.cjs',
    'src/index.ts',
    'src/index.tsx',
    'src/index.js',
    'src/index.mjs',
    'dist/index.js',
    'dist/index.mjs',
    'dist/index.cjs',
    'dist/esm/index.js',
    'dist/esm/index.mjs',
    'dist/cjs/index.js',
    'dist/cjs/index.cjs',
    'esm/index.js',
    'esm/index.mjs',
    'lib/index.js',
    'lib/index.mjs',
    'lib/index.cjs',
    'source/index.js',
    'source/index.mjs',
    `lib/${leafName}.esm.js`,
    `cjs/${leafName}.production.js`,
    `cjs/${leafName}.js`,
    'cjs/index.js',
  ];

  for (const candidate of candidates) {
    const fullPath = resolveExistingPath(path.join(packageRoot, candidate));
    if (fullPath) {
      return fullPath;
    }
  }

  return null;
}

function collectBareSpecifiers(roots) {
  const rootPackages = new Set();
  const fullSpecifiers = new Set();

  for (const root of roots) {
    if (!isDirectory(root)) {
      continue;
    }
    for (const filePath of walkFiles(root)) {
      if (!sourceExtensions.includes(path.extname(filePath))) {
        continue;
      }
      const contents = fs.readFileSync(filePath, 'utf8');
      for (const match of contents.matchAll(
        /\bimport\s+['"]([^'"]+)['"]|\bfrom\s+['"]([^'"]+)['"]|\brequire\(\s*['"]([^'"]+)['"]\s*\)|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
      )) {
        const specifier = match[1] || match[2] || match[3] || match[4];
        if (!specifier || specifier.startsWith('.') || specifier.startsWith('#')) {
          continue;
        }
        fullSpecifiers.add(specifier);
        const packageName = rootPackageName(specifier);
        if (packageName) {
          rootPackages.add(packageName);
        }
      }
    }
  }

  return { rootPackages, fullSpecifiers };
}

function walkPackageRoots(nodeModulesRoot, callback) {
  if (!isDirectory(nodeModulesRoot)) {
    return;
  }

  for (const entry of fs.readdirSync(nodeModulesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const firstPath = path.join(nodeModulesRoot, entry.name);
    if (entry.name.startsWith('@')) {
      for (const scopedEntry of fs.readdirSync(firstPath, { withFileTypes: true })) {
        if (!scopedEntry.isDirectory()) {
          continue;
        }
        callback(`${entry.name}/${scopedEntry.name}`, path.join(firstPath, scopedEntry.name));
      }
      continue;
    }
    callback(entry.name, firstPath);
  }
}

function walkFiles(root) {
  const files = [];
  const pending = [root];

  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '.git') {
          continue;
        }
        pending.push(fullPath);
        continue;
      }
      files.push(fullPath);
    }
  }

  return files;
}

function pruneMissingFiles(root, keepPaths, overlayPackages) {
  if (!isDirectory(root)) {
    return;
  }

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (fullPath === markerPath || fullPath === overlayStampPath) {
      continue;
    }
    if (fullPath === path.join(root, 'node_modules')) {
      continue;
    }

    if (entry.isDirectory()) {
      pruneMissingFiles(fullPath, keepPaths, overlayPackages);
      if (fs.readdirSync(fullPath).length === 0) {
        fs.rmdirSync(fullPath);
      }
      continue;
    }

    if (!keepPaths.has(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  }
}

function shouldSkipSourceMapWrite(relativePath, overlayPackages) {
  const packageName = packageNameFromRelativePath(relativePath);
  return packageName ? overlayPackages.has(packageName) : false;
}

function packageNameFromRelativePath(relativePath) {
  if (!relativePath.startsWith('node_modules/')) {
    return null;
  }
  const remainder = relativePath.slice('node_modules/'.length);
  const parts = remainder.split('/');
  if (parts[0].startsWith('@')) {
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null;
  }
  return parts[0] || null;
}

function packageRootPath(nodeModulesRoot, packageName) {
  const parts = packageName.split('/');
  return path.join(nodeModulesRoot, ...parts);
}

function packageSubpathProxyPath(specifier) {
  const parsed = splitPackageSpecifier(specifier);
  return path.join(
    packageRootPath(path.join(workspaceRoot, 'node_modules'), parsed.packageName),
    parsed.subpath,
  );
}

function rootPackageName(specifier) {
  const parsed = splitPackageSpecifier(specifier);
  return parsed?.packageName ?? null;
}

function splitPackageSpecifier(specifier) {
  if (specifier.startsWith('@')) {
    const parts = specifier.split('/');
    if (parts.length < 2) {
      return null;
    }
    return {
      packageName: parts.slice(0, 2).join('/'),
      subpath: parts.slice(2).join('/'),
    };
  }

  const parts = specifier.split('/');
  if (parts.length === 0 || !parts[0]) {
    return null;
  }
  return {
    packageName: parts[0],
    subpath: parts.slice(1).join('/'),
  };
}

function resolveLike(importer, specifier) {
  return resolveExistingPath(path.resolve(path.dirname(importer), specifier));
}

function resolveExistingPath(candidate) {
  if (isFile(candidate)) {
    return candidate;
  }

  const extension = path.extname(candidate);
  if (extension && extension !== '.d.ts') {
    const stem = candidate.slice(0, -extension.length);
    for (const alternative of candidateExtensions) {
      const resolved = `${stem}${alternative}`;
      if (isFile(resolved)) {
        return resolved;
      }
    }
  } else if (!extension) {
    for (const alternative of candidateExtensions) {
      const resolved = `${candidate}${alternative}`;
      if (isFile(resolved)) {
        return resolved;
      }
    }
  }

  if (isDirectory(candidate)) {
    for (const alternative of candidateExtensions) {
      const resolved = path.join(candidate, `index${alternative}`);
      if (isFile(resolved)) {
        return resolved;
      }
    }
  }

  return null;
}

function parseNamedImports(clause) {
  const body = clause.replace(/^[^{]*\{/, '').replace(/\}[^}]*$/, '');
  return body
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => part.replace(/^type\s+/, '').trim())
    .map(part => part.split(/\s+as\s+/i)[0].trim())
    .filter(name => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name));
}

function restoreSourceMapFiles(overlaySet) {
  const sourceMap = JSON.parse(fs.readFileSync(installedSourceMap, 'utf8'));
  for (let index = 0; index < sourceMap.sources.length; index += 1) {
    const source = sourceMap.sources[index];
    const contents = sourceMap.sourcesContent[index];
    if (contents == null) {
      continue;
    }

    const relativePath = source.replace(/^\.\.\//, '');
    if (shouldSkipSourceMapWrite(relativePath, overlaySet)) {
      continue;
    }

    const destination = path.join(workspaceRoot, relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    if (!isFileContentEqual(destination, contents)) {
      fs.writeFileSync(destination, contents, 'utf8');
    }
  }
}

function restorePinnedOverlaySourceMapFiles(keepPaths) {
  const sourceMap = JSON.parse(fs.readFileSync(installedSourceMap, 'utf8'));
  for (let index = 0; index < sourceMap.sources.length; index += 1) {
    const source = sourceMap.sources[index];
    const contents = sourceMap.sourcesContent[index];
    if (contents == null) {
      continue;
    }

    const relativePath = source.replace(/^\.\.\//, '');
    if (!pinnedOverlaySourceMapPaths.has(relativePath)) {
      continue;
    }

    const destination = path.join(workspaceRoot, relativePath);
    keepPaths.add(destination);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    if (!isFileContentEqual(destination, contents)) {
      fs.writeFileSync(destination, contents, 'utf8');
    }
  }
}

function getProxyExtension(extension) {
  if (extension === '.mjs') return '.mjs';
  if (extension === '.cjs') return '.cjs';
  return '.js';
}

function ensureDotPath(candidate) {
  return candidate.startsWith('.') ? candidate : `./${candidate}`;
}

function toPosix(candidate) {
  return candidate.split(path.sep).join('/');
}

function escapeRegExp(candidate) {
  return candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveBuildPath(candidate) {
  const resolved = path.isAbsolute(candidate) ? candidate : path.resolve(workspaceRoot, candidate);
  if (isFile(resolved)) {
    return resolved;
  }
  for (const ext of ['.js', '.ts', '.tsx', '.mjs']) {
    if (isFile(resolved + ext)) {
      return resolved + ext;
    }
  }
  return resolved;
}

function copyRuntimeVendorAssets(bundleRoot) {
  if (!isDirectory(referenceVendorRoot)) {
    return;
  }

  const destinationRoot = path.join(bundleRoot, 'src', 'entrypoints', 'vendor');
  removePath(destinationRoot);
  fs.mkdirSync(path.dirname(destinationRoot), { recursive: true });
  fs.cpSync(referenceVendorRoot, destinationRoot, {
    recursive: true,
    force: true,
    preserveTimestamps: true,
  });
}

function removePath(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return;
  }
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function isDirectory(candidate) {
  try {
    return fs.statSync(candidate).isDirectory();
  } catch {
    return false;
  }
}

function isFile(candidate) {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function isFileContentEqual(candidate, expected) {
  if (!isFile(candidate)) {
    return false;
  }
  return fs.readFileSync(candidate, 'utf8') === expected;
}

function isAutoStubFile(candidate) {
  if (!isFile(candidate)) {
    return false;
  }
  return fs.readFileSync(candidate, 'utf8').startsWith('// AUTO-STUB:');
}

function readJsonIfExists(candidate) {
  try {
    return JSON.parse(fs.readFileSync(candidate, 'utf8'));
  } catch {
    return null;
  }
}

function createBanner(version) {
  return `#!/usr/bin/env node
// Code-Folks — Claude Code ${version} (modded build)
// All 90 feature flags enabled | ANT mode | Telemetry killed
// Bypass permissions killswitch disabled | GrowthBook overrides unlocked
`;
}

function parseArgs(argv) {
  const parsed = {
    outfile: undefined,
    noMinify: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === '--outfile') {
      parsed.outfile = argv[index + 1];
      index += 1;
      continue;
    }
    if (current.startsWith('--outfile=')) {
      parsed.outfile = current.slice('--outfile='.length);
      continue;
    }
    if (current === '--no-minify') {
      parsed.noMinify = true;
      continue;
    }
    throw new Error(`Unknown argument: ${current}`);
  }

  return parsed;
}
