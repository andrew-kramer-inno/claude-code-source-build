/**
 * Flashy animated launch screen for Claude Code CLI.
 * Pure ANSI escape sequences — no dependencies.
 */

const ESC = '\x1b[';
const HIDE_CURSOR = `${ESC}?25l`;
const SHOW_CURSOR = `${ESC}?25h`;
const CLEAR = `${ESC}2J${ESC}H`;
const RESET = `${ESC}0m`;
const BOLD = `${ESC}1m`;
const DIM = `${ESC}2m`;

function rgb(r: number, g: number, b: number): string {
  return `${ESC}38;2;${r};${g};${b}m`;
}

function moveTo(row: number, col: number): string {
  return `${ESC}${row};${col}H`;
}

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

type Color = readonly [number, number, number];

function lerpColor(c1: Color, c2: Color, t: number): [number, number, number] {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Claude's brand palette
const AMBER: Color = [232, 140, 50];
const WARM: Color = [245, 180, 100];
const CREAM: Color = [255, 220, 170];
const FIRE: Color = [220, 80, 30];
const DEEP: Color = [180, 60, 20];
const BLACK: Color = [0, 0, 0];

// Claude asterisk logo — converted from communityIcon_97yk0vsmp4cf1.webp
const LOGO = [
  '         ███         █',
  '        █████      ████',
  '         █████     ████     ███',
  '          █████    ███    ██████',
  '  █████    █████   ███   ██████',
  '   ███████  █████  ██  ██████',
  '      ██████ ███████████████',
  '         █████████████████        ██',
  '            ████████████████████████████',
  '██████████████████████████████',
  '             ██████████████████████████',
  '          ███████████████  ██████████',
  '       █████  █████████████',
  '    ██████   ███ ███ ████████',
  '   ███     ███   ██   ████  ███',
  '         ████    ██    ████   ███',
  '        ███     ███      ███',
  '        █       ███',
  '                ██',
];

const TITLE = [
  ' ██████╗██╗      █████╗ ██╗   ██╗██████╗ ███████╗',
  '██╔════╝██║     ██╔══██╗██║   ██║██╔══██╗██╔════╝',
  '██║     ██║     ███████║██║   ██║██║  ██║█████╗  ',
  '██║     ██║     ██╔══██║██║   ██║██║  ██║██╔══╝  ',
  '╚██████╗███████╗██║  ██║╚██████╔╝██████╔╝███████╗',
  ' ╚═════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝',
];

const SUBTITLE = '  C  O  D  E';

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  char: string;
}

const SPARKLE_CHARS = ['✦', '✧', '·', '˚', '*', '⋆', '✴', '⊹'];

function createParticle(cx: number, cy: number): Particle {
  const angle = Math.random() * Math.PI * 2;
  const speed = 0.4 + Math.random() * 1.5;
  return {
    x: cx, y: cy,
    vx: Math.cos(angle) * speed * 2.5,
    vy: Math.sin(angle) * speed,
    life: 0,
    maxLife: 10 + Math.floor(Math.random() * 15),
    char: SPARKLE_CHARS[Math.floor(Math.random() * SPARKLE_CHARS.length)],
  };
}

function updateParticles(particles: Particle[], cols: number, rows: number): void {
  for (let p = particles.length - 1; p >= 0; p--) {
    const particle = particles[p];
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.vy += 0.03;
    particle.life++;
    if (particle.life >= particle.maxLife ||
        particle.x < 1 || particle.x >= cols ||
        particle.y < 1 || particle.y >= rows) {
      particles.splice(p, 1);
    }
  }
}

function renderParticles(particles: Particle[], globalFade: number): string {
  let buf = '';
  for (const p of particles) {
    const lifeT = p.life / p.maxLife;
    const fadeT = (lifeT < 0.3 ? lifeT / 0.3 : 1 - (lifeT - 0.3) / 0.7) * globalFade;
    const color = lerpColor(CREAM, FIRE, lifeT);
    buf += moveTo(Math.round(p.y), Math.round(p.x)) + rgb(
      Math.round(color[0] * fadeT),
      Math.round(color[1] * fadeT),
      Math.round(color[2] * fadeT),
    ) + p.char + RESET;
  }
  return buf;
}

export async function playLaunchScreen(): Promise<void> {
  if (!process.stdout.isTTY) return;
  if (process.env.NO_LAUNCH_SCREEN) return;

  const cols = process.stdout.columns || 80;
  const rows = process.stdout.rows || 24;
  if (cols < 60 || rows < 20) return;

  const out = process.stdout;
  const write = (s: string) => out.write(s);

  // [MOD] Skip on any keypress
  let aborted = false;
  const skipHandler = () => { aborted = true; };
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once('data', skipHandler);
  }

  const logoWidth = Math.max(...LOGO.map(l => l.length));
  const titleWidth = TITLE[0].length;
  const totalHeight = LOGO.length + 2 + TITLE.length + 1 + 1 + 2 + 1; // logo + gap + title + gap + subtitle + gap + version
  const logoCx = Math.floor((cols - logoWidth) / 2);
  const logoTop = Math.max(1, Math.floor((rows - totalHeight) / 2));
  const titleCx = Math.floor((cols - titleWidth) / 2);
  const titleTop = logoTop + LOGO.length + 2;
  const subtitleCx = titleCx + Math.floor((titleWidth - SUBTITLE.length) / 2);

  const particles: Particle[] = [];

  try {
    write(HIDE_CURSOR + CLEAR);

    // ═══════════════════════════════════════════════════════════
    // PHASE 1: Logo materializes from center outward (1.2s)
    // ═══════════════════════════════════════════════════════════
    for (let frame = 0; frame < 24 && !aborted; frame++) {
      let buf = CLEAR; // clear each frame for clean render
      const t = frame / 23;

      for (let row = 0; row < LOGO.length; row++) {
        const line = LOGO[row];
        const logoMidRow = Math.floor(LOGO.length / 2);
        const rowDelay = Math.abs(row - logoMidRow) / logoMidRow; // center-out
        const rowT = Math.max(0, Math.min(1, (t - rowDelay * 0.25) / 0.5));
        if (rowT <= 0) continue;

        buf += moveTo(logoTop + row, logoCx);
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === ' ') { buf += ' '; continue; }
          const colDelay = Math.abs(i - line.length / 2) / (line.length / 2);
          const charT = Math.max(0, Math.min(1, (rowT - colDelay * 0.3) / 0.6));
          if (charT <= 0) { buf += ' '; continue; }

          // Flash white at birth, settle to amber gradient
          const birthFlash = charT < 0.4 ? (0.4 - charT) / 0.4 : 0;
          const distFromCenter = colDelay;
          const baseColor = lerpColor(CREAM, FIRE, distFromCenter * 0.8);
          const wave = Math.sin(frame * 0.6 + i * 0.25 + row * 0.5) * 0.15;
          const color = lerpColor(baseColor, [255, 255, 255], birthFlash + wave);
          buf += rgb(
            Math.min(255, color[0]),
            Math.min(255, color[1]),
            Math.min(255, color[2]),
          ) + ch;
        }
        buf += RESET;
      }

      // Spawn particles during logo reveal
      if (frame > 5 && frame % 2 === 0) {
        for (let i = 0; i < 3; i++) {
          particles.push(createParticle(
            logoCx + logoWidth / 2 + (Math.random() - 0.5) * logoWidth * 0.8,
            logoTop + LOGO.length / 2 + (Math.random() - 0.5) * 4,
          ));
        }
      }

      updateParticles(particles, cols, rows);
      buf += renderParticles(particles, 1);
      write(buf);
      await sleep(50);
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 2: Title sweeps in + logo shimmers (1.5s)
    // ═══════════════════════════════════════════════════════════
    for (let frame = 0; frame < 30 && !aborted; frame++) {
      let buf = CLEAR;
      const t = frame / 29;

      // Logo shimmer
      for (let row = 0; row < LOGO.length; row++) {
        buf += moveTo(logoTop + row, logoCx);
        const line = LOGO[row];
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === ' ') { buf += ' '; continue; }
          const wave = Math.sin(frame * 0.4 + i * 0.2 + row * 0.5) * 0.5 + 0.5;
          const color = lerpColor(AMBER, CREAM, wave * 0.5);
          buf += rgb(color[0], color[1], color[2]) + ch;
        }
        buf += RESET;
      }

      // Title sweep left to right with glow
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      for (let row = 0; row < TITLE.length; row++) {
        const line = TITLE[row];
        const sweep = Math.floor(line.length * eased);
        if (sweep <= 0) continue;

        buf += moveTo(titleTop + row, titleCx);
        for (let i = 0; i < sweep; i++) {
          const ch = line[i];
          const edgeDist = (sweep - 1 - i) / Math.max(1, sweep);
          if (edgeDist < 0.05) {
            // Leading edge — bright white
            buf += BOLD + rgb(255, 255, 255) + ch + RESET;
          } else {
            const gradient = i / line.length;
            const color = lerpColor(FIRE, AMBER, gradient);
            const shimmer = Math.sin(frame * 0.5 + i * 0.12) * 0.12 + 0.88;
            buf += rgb(
              Math.min(255, Math.round(color[0] * shimmer)),
              Math.min(255, Math.round(color[1] * shimmer)),
              Math.min(255, Math.round(color[2] * shimmer)),
            ) + ch;
          }
        }
        buf += RESET;
      }

      // Subtitle letter-by-letter fade in (starts at 40%)
      if (t > 0.4) {
        const subT = (t - 0.4) / 0.6;
        buf += moveTo(titleTop + TITLE.length + 1, subtitleCx);
        for (let i = 0; i < SUBTITLE.length; i++) {
          const charDelay = i / SUBTITLE.length;
          const charT = Math.max(0, Math.min(1, (subT - charDelay * 0.4) / 0.6));
          const color = lerpColor(DEEP, WARM, charT);
          buf += rgb(color[0], color[1], color[2]) + SUBTITLE[i];
        }
        buf += RESET;
      }

      // Burst at frame 20
      if (frame === 20) {
        for (let i = 0; i < 20; i++) {
          particles.push(createParticle(
            titleCx + titleWidth / 2 + (Math.random() - 0.5) * titleWidth * 0.5,
            titleTop + TITLE.length / 2,
          ));
        }
      }

      updateParticles(particles, cols, rows);
      buf += renderParticles(particles, 1);
      write(buf);
      await sleep(50);
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 3: Hold + version appear (0.8s)
    // ═══════════════════════════════════════════════════════════
    const version = `v${MACRO.VERSION}`;
    for (let frame = 0; frame < 16 && !aborted; frame++) {
      let buf = CLEAR;
      const t = frame / 15;

      // Full logo
      for (let row = 0; row < LOGO.length; row++) {
        buf += moveTo(logoTop + row, logoCx);
        const line = LOGO[row];
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === ' ') { buf += ' '; continue; }
          const wave = Math.sin(frame * 0.3 + i * 0.15 + row * 0.4) * 0.3 + 0.7;
          const color = lerpColor(AMBER, CREAM, wave * 0.4);
          buf += rgb(color[0], color[1], color[2]) + ch;
        }
        buf += RESET;
      }

      // Full title
      for (let row = 0; row < TITLE.length; row++) {
        buf += moveTo(titleTop + row, titleCx);
        const line = TITLE[row];
        for (let i = 0; i < line.length; i++) {
          const gradient = i / line.length;
          const color = lerpColor(FIRE, AMBER, gradient);
          buf += rgb(color[0], color[1], color[2]) + line[i];
        }
        buf += RESET;
      }

      // Subtitle
      buf += moveTo(titleTop + TITLE.length + 1, subtitleCx);
      buf += rgb(WARM[0], WARM[1], WARM[2]) + SUBTITLE + RESET;

      // Version fade in
      const versionCx = Math.floor((cols - version.length) / 2);
      const vT = Math.min(t * 2, 1);
      const vColor = lerpColor(BLACK, [140, 100, 60], vT);
      buf += moveTo(titleTop + TITLE.length + 3, versionCx);
      buf += DIM + rgb(vColor[0], vColor[1], vColor[2]) + version + RESET;

      updateParticles(particles, cols, rows);
      buf += renderParticles(particles, 1);
      write(buf);
      await sleep(50);
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 4: Fade out (0.6s)
    // ═══════════════════════════════════════════════════════════
    for (let frame = 0; frame < 12 && !aborted; frame++) {
      let buf = CLEAR;
      const fade = 1 - frame / 11; // 1 → 0

      // Fading logo
      for (let row = 0; row < LOGO.length; row++) {
        buf += moveTo(logoTop + row, logoCx);
        const line = LOGO[row];
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === ' ') { buf += ' '; continue; }
          const color = lerpColor(BLACK, AMBER, fade);
          buf += rgb(color[0], color[1], color[2]) + ch;
        }
        buf += RESET;
      }

      // Fading title
      for (let row = 0; row < TITLE.length; row++) {
        buf += moveTo(titleTop + row, titleCx);
        const line = TITLE[row];
        for (let i = 0; i < line.length; i++) {
          const baseColor = lerpColor(FIRE, AMBER, i / line.length);
          const color = lerpColor(BLACK, baseColor, fade);
          buf += rgb(color[0], color[1], color[2]) + line[i];
        }
        buf += RESET;
      }

      // Fading subtitle + version
      const subColor = lerpColor(BLACK, WARM, fade);
      buf += moveTo(titleTop + TITLE.length + 1, subtitleCx);
      buf += rgb(subColor[0], subColor[1], subColor[2]) + SUBTITLE + RESET;

      const vColor = lerpColor(BLACK, [140, 100, 60], fade);
      const versionCx = Math.floor((cols - version.length) / 2);
      buf += moveTo(titleTop + TITLE.length + 3, versionCx);
      buf += DIM + rgb(vColor[0], vColor[1], vColor[2]) + version + RESET;

      updateParticles(particles, cols, rows);
      buf += renderParticles(particles, fade);
      write(buf);
      await sleep(50);
    }

    // Final clear — hand off to CLI
    await sleep(100);

  } finally {
    // [MOD] Clean up stdin listener
    if (process.stdin.isTTY) {
      process.stdin.removeListener('data', skipHandler);
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }
    write(CLEAR + SHOW_CURSOR + RESET);
  }
}

declare const MACRO: { VERSION: string };
