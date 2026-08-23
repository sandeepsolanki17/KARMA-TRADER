const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const outDir = path.join(__dirname, '../assets');

// Brand colors
const voidBg = '#0B0D0F';
const amber = '#F5B942';

// 1. Core Geometric K symbol (centered for 1024x1024 canvas)
const geometricK = `
  <g transform="translate(280, 260)">
    <!-- Vertical stem -->
    <path d="M 60 40 L 160 40 L 160 460 L 60 460 Z" fill="${amber}" />
    <!-- Top diagonal -->
    <path d="M 180 240 L 320 80 L 420 120 L 260 280 Z" fill="${amber}" />
    <!-- Bottom diagonal -->
    <path d="M 220 220 L 420 440 L 320 480 L 160 300 Z" fill="${amber}" opacity="0.85" />
  </g>
`;

// 2. Monochrome K for notifications (centered for 96x96 canvas)
const geometricKMono = `
  <g transform="scale(0.09) translate(280, 260)">
    <path d="M 60 40 L 160 40 L 160 460 L 60 460 Z" fill="#ffffff" />
    <path d="M 180 240 L 320 80 L 420 120 L 260 280 Z" fill="#ffffff" />
    <path d="M 220 220 L 420 440 L 320 480 L 160 300 Z" fill="#ffffff" />
  </g>
`;

async function generateAssets() {
  console.log('Generating premium KARMA branding assets...');

  // --- 1. icon.png (1024x1024, opaque background) ---
  const iconSvg = `
    <svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
      <rect width="1024" height="1024" fill="${voidBg}" />
      ${geometricK}
    </svg>
  `;
  await sharp(Buffer.from(iconSvg))
    .png()
    .toFile(path.join(outDir, 'icon.png'));

  // --- 2. adaptive-icon-foreground.png (1024x1024, transparent background) ---
  const adaptiveFgSvg = `
    <svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
      <!-- Scale down slightly for the adaptive "safe zone" -->
      <g transform="scale(0.85) translate(80, 80)">
        ${geometricK}
      </g>
    </svg>
  `;
  await sharp(Buffer.from(adaptiveFgSvg))
    .png()
    .toFile(path.join(outDir, 'adaptive-icon-foreground.png'));

  // --- 3. adaptive-icon-background.png (1024x1024, opaque background) ---
  const adaptiveBgSvg = `
    <svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
      <rect width="1024" height="1024" fill="${voidBg}" />
    </svg>
  `;
  await sharp(Buffer.from(adaptiveBgSvg))
    .png()
    .toFile(path.join(outDir, 'adaptive-icon-background.png'));

  // --- 4. splash.png (1284x2778, opaque background, with wordmark) ---
  const splashSvg = `
    <svg width="1284" height="2778" viewBox="0 0 1284 2778" xmlns="http://www.w3.org/2000/svg">
      <rect width="1284" height="2778" fill="${voidBg}" />
      <g transform="translate(130, 950)">
        ${geometricK}
      </g>
      <text x="642" y="1650" font-family="sans-serif" font-weight="700" font-size="64" fill="#E7E9EA" text-anchor="middle" letter-spacing="8">KARMA</text>
      <text x="642" y="1720" font-family="monospace" font-weight="400" font-size="28" fill="#8A9199" text-anchor="middle" letter-spacing="12">TRADING SIGNALS</text>
    </svg>
  `;
  await sharp(Buffer.from(splashSvg))
    .png()
    .toFile(path.join(outDir, 'splash.png'));

  // --- 5. notification-icon.png (96x96, monochrome transparent) ---
  const notificationSvg = `
    <svg width="96" height="96" viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
      ${geometricKMono}
    </svg>
  `;
  await sharp(Buffer.from(notificationSvg))
    .png()
    .toFile(path.join(outDir, 'notification-icon.png'));

  // --- 6. favicon.png (256x256, transparent background) ---
  const faviconSvg = `
    <svg width="256" height="256" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
      ${geometricK}
    </svg>
  `;
  await sharp(Buffer.from(faviconSvg))
    .png()
    .toFile(path.join(outDir, 'favicon.png'));

  console.log('All branding assets generated successfully.');
}

generateAssets().catch(console.error);
