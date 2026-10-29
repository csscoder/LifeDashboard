export interface Seed {
  bg: string
  surface: [string, string, string]
  text: [string, string, string, string]
  border: string
  accent: string
  success: string
  warning: string
  danger: string
  info: string
}

export interface Palette {
  slug: string
  name: string
  source: string
  light: Seed
  dark: Seed
}

// Source roles follow the Task 4 palette table. Hex values are upstream sRGB colours.
// One uses the exact sRGB equivalents of its upstream HSL literals.
// Tuned colours retain upstream chroma/hue; only OKLCH lightness changes.
export const BUILTIN_PALETTES: readonly Palette[] = [
  {
    slug: 'lifedashboard',
    name: 'LifeDashboard',
    source: 'repo: apps/ui/app/theme/styles/themes/glass.css, paper.css',
    dark: {
      bg: 'oklch(0.2 0.02 280)',
      surface: ['oklch(0.27 0.03 280)', 'oklch(0.31 0.03 280)', 'oklch(0.35 0.03 280)'],
      text: ['oklch(0.97 0.005 280)', 'oklch(0.89 0.01 280)', 'oklch(0.82 0.015 280)', 'oklch(0.55 0.015 280)'],
      border: 'oklch(0.55 0.03 280)',
      accent: 'oklch(0.72 0.14 285)',
      success: 'oklch(0.75 0.15 150)',
      warning: 'oklch(0.82 0.14 80)',
      danger: 'oklch(0.7 0.17 25)',
      info: 'oklch(0.74 0.12 240)',
    },
    light: {
      bg: 'oklch(0.95 0.01 85)',
      surface: ['oklch(0.99 0.004 85)', 'oklch(0.965 0.008 85)', 'oklch(0.93 0.01 85)'],
      text: ['oklch(0.22 0.01 85)', 'oklch(0.36 0.01 85)', 'oklch(0.47 0.012 85)', 'oklch(0.65 0.01 85)'],
      border: 'oklch(0.62 0.015 85)',
      accent: 'oklch(0.48 0.13 255)', // tuned for contrast: upstream 'oklch(0.5 0.13 255)'
      success: 'oklch(0.48 0.12 150)',
      warning: 'oklch(0.52 0.12 65)',
      danger: 'oklch(0.5 0.17 27)',
      info: 'oklch(0.5 0.11 240)',
    },
  },
  {
    slug: 'catppuccin',
    name: 'Catppuccin',
    source: 'https://github.com/catppuccin/palette/blob/main/palette.json',
    dark: {
      bg: '#181825',
      surface: ['#1e1e2e', '#313244', '#45475a'],
      text: ['oklch(0.9587 0.0426 272.28)', 'oklch(0.8899 0.0403 272.86)', 'oklch(0.821 0.0396 273.93)', '#6c7086'], // secondary midway between primary and muted; tuned for contrast: upstream ['#cdd6f4', '#bac2de', '#a6adc8', '#6c7086']
      border: '#585b70',
      accent: '#cba6f7',
      success: '#a6e3a1',
      warning: '#f9e2af',
      danger: '#f38ba8',
      info: '#89b4fa',
    },
    light: {
      bg: '#e6e9ef',
      surface: ['#eff1f5', '#ccd0da', '#bcc0cc'],
      text: ['oklch(0.3755 0.043 279.33)', 'oklch(0.4013 0.0385 279.3)', 'oklch(0.4271 0.0343 279.08)', '#9ca0b0'], // secondary midway between primary and muted; tuned for contrast: upstream ['#4c4f69', '#5c5f77', '#6c6f85', '#9ca0b0']
      border: '#acb0be',
      accent: 'oklch(0.4947 0.2503 297.02)', // tuned for contrast: upstream '#8839ef'
      success: 'oklch(0.495 0.1772 140.44)', // tuned for contrast: upstream '#40a02b'
      warning: 'oklch(0.524 0.1494 67.78)', // tuned for contrast: upstream '#df8e1d'
      danger: 'oklch(0.5405 0.2155 19.81)', // tuned for contrast: upstream '#d20f39'
      info: 'oklch(0.5286 0.2255 262.09)', // tuned for contrast: upstream '#1e66f5'
    },
  },
  {
    slug: 'gruvbox',
    name: 'Gruvbox',
    source: 'https://github.com/morhetz/gruvbox/blob/master/colors/gruvbox.vim',
    dark: {
      bg: '#1d2021',
      surface: ['#282828', '#3c3836', '#504945'],
      text: ['oklch(0.9441 0.0566 89.24)', 'oklch(0.8753 0.0507 85.12)', 'oklch(0.8064 0.041 82.28)', '#a89984'], // secondary midway between primary and muted; tuned for contrast: upstream ['#ebdbb2', '#d5c4a1', '#bdae93', '#a89984']
      border: '#665c54',
      accent: '#fe8019',
      success: '#b8bb26',
      warning: '#fabd2f',
      danger: '#fb4934',
      info: '#83a598',
    },
    light: {
      bg: '#ebdbb2',
      surface: ['#f9f5d7', '#fbf1c7', '#d5c4a1'],
      text: ['#3c3836', '#504945', 'oklch(0.4418 0.0181 61.04)', '#7c6f64'], // tuned for contrast: upstream ['#3c3836', '#504945', '#665c54', '#7c6f64']
      border: '#bdae93',
      accent: 'oklch(0.4526 0.1616 39.3)', // tuned for contrast: upstream '#af3a03'
      success: 'oklch(0.4863 0.1124 106.46)', // tuned for contrast: upstream '#79740e'
      warning: 'oklch(0.4976 0.1277 70.67)', // tuned for contrast: upstream '#b57614'
      danger: '#9d0006',
      info: '#076678',
    },
  },
  {
    slug: 'github',
    name: 'GitHub',
    source: 'https://github.com/primer/github-vscode-theme/blob/main/src/colors.js (Primer primitives 7.10.0)',
    dark: {
      bg: '#010409',
      surface: ['#0d1117', '#161b22', '#161b22'],
      text: ['oklch(0.9525 0.0111 243.66)', 'oklch(0.8827 0.0191 256.32)', 'oklch(0.8129 0.0196 256.33)', '#6e7681'], // secondary midway between primary and muted; tuned for contrast: upstream ['#e6edf3', '#7d8590', '#6e7681', '#6e7681']
      border: '#30363d',
      accent: 'oklch(0.6282 0.1935 258.33)', // tuned for contrast: upstream '#2f81f7'
      success: '#3fb950',
      warning: '#d29922',
      danger: '#f85149',
      info: '#a371f7',
    },
    light: {
      bg: '#f6f8fa',
      surface: ['#ffffff', '#f6f8fa', '#ffffff'],
      text: ['#1f2328', 'oklch(0.3947 0.0172 251.29)', 'oklch(0.5351 0.0189 250.97)', '#6e7781'], // secondary midway between primary and muted; tuned for contrast: upstream ['#1f2328', '#656d76', '#6e7781', '#6e7781']
      border: '#d0d7de',
      accent: 'oklch(0.4999 0.1906 257.48)', // tuned for contrast: upstream '#0969da'
      success: '#1a7f37',
      warning: '#9a6700',
      danger: '#cf222e',
      info: '#8250df',
    },
  },
  {
    slug: 'solarized',
    name: 'Solarized',
    source: 'https://github.com/altercation/solarized/blob/master/README.md',
    dark: {
      bg: '#002b36',
      surface: ['#073642', 'oklch(0.3392 0.0518 219.65)', 'oklch(0.3692 0.0518 219.65)'], // derived: base02, then L +0.03 and +0.06
      text: ['oklch(0.9579 0.0159 196.79)', 'oklch(0.8904 0.0197 205.26)', 'oklch(0.823 0.0283 219.14)', '#657b83'], // secondary midway between primary and muted; tuned for contrast: upstream ['#93a1a1', '#839496', '#586e75', '#657b83']
      border: '#586e75',
      accent: 'oklch(0.6949 0.1394 244.93)', // tuned for contrast: upstream '#268bd2'
      success: '#859900',
      warning: '#b58900',
      danger: 'oklch(0.6763 0.2064 27.12)', // tuned for contrast: upstream '#dc322f'
      info: '#2aa198',
    },
    light: {
      bg: '#eee8d5',
      surface: ['#fdf6e3', 'oklch(0.9435 0.0261 90.1)', 'oklch(0.9135 0.0261 90.1)'], // derived: base3, then L −0.03 and −0.06
      text: ['oklch(0.433 0.0283 219.14)', 'oklch(0.4655 0.0285 221.9)', 'oklch(0.4979 0.0159 196.79)', '#93a1a1'], // secondary midway between primary and muted; tuned for contrast: upstream ['#586e75', '#657b83', '#93a1a1', '#93a1a1']
      border: '#93a1a1',
      accent: 'oklch(0.4649 0.1394 244.93)', // tuned for contrast: upstream '#268bd2'
      success: 'oklch(0.5044 0.1508 118.6)', // tuned for contrast: upstream '#859900'
      warning: 'oklch(0.5145 0.134 85.72)', // tuned for contrast: upstream '#b58900'
      danger: 'oklch(0.5363 0.2064 27.12)', // tuned for contrast: upstream '#dc322f'
      info: 'oklch(0.4937 0.1019 187.38)', // tuned for contrast: upstream '#2aa198'
    },
  },
  {
    slug: 'tokyo-night',
    name: 'Tokyo Night',
    source: 'https://github.com/tokyo-night/tokyo-night-vscode-theme (README.md and themes/tokyo-night[-light]-color-theme.json)',
    dark: {
      bg: '#16161e',
      surface: ['#1a1b26', '#1e202e', '#2b2f41'], // mapped: editor.selectionBackground composited over editor.background
      text: ['oklch(0.9666 0.0537 275.49)', 'oklch(0.8961 0.0609 273.09)', 'oklch(0.8255 0.0682 274.37)', '#414868'], // secondary midway between primary and muted; mapped: secondary = Markdown Text; dark comment = Terminal Black
      // tuned for contrast: upstream ['#a9b1d6', '#9aa5ce', '#565f89', '#414868']
      border: '#101014', // mapped: editorGroup.border
      accent: '#7aa2f7',
      success: '#9ece6a',
      warning: '#e0af68',
      danger: '#f7768e',
      info: '#7dcfff',
    },
    light: {
      bg: '#d6d8df',
      surface: ['#e6e7ed', '#dcdee3', '#d7d9e1'], // mapped: editor.selectionBackground composited over editor.background
      text: ['#343b58', '#40434f', 'oklch(0.4789 0.0111 273.23)', '#6c6e75'], // mapped: secondary = Markdown Text; dark comment = Comments
      // tuned for contrast: upstream ['#343b58', '#40434f', '#6c6e75', '#6c6e75']
      border: '#c1c2c7', // mapped: editorGroup.border
      accent: 'oklch(0.4362 0.1402 260.22)', // tuned for contrast: upstream '#2959aa'
      success: '#385f0d',
      warning: 'oklch(0.4831 0.1044 71.02)', // tuned for contrast: upstream '#8f5e15'
      danger: '#8c4351',
      info: '#0f4b6e',
    },
  },
  {
    slug: 'rose-pine',
    name: 'Rosé Pine',
    source: 'https://github.com/rose-pine/neovim/blob/main/lua/rose-pine/palette.lua',
    dark: {
      bg: '#191724',
      surface: ['#1f1d2e', '#26233a', '#403d52'],
      text: ['oklch(0.9588 0.0299 289.97)', 'oklch(0.8885 0.0444 291.23)', 'oklch(0.8183 0.0435 291.41)', '#6e6a86'], // secondary midway between primary and muted; tuned for contrast: upstream ['#e0def4', '#908caa', '#6e6a86', '#6e6a86']
      border: '#524f67',
      accent: '#c4a7e7',
      success: 'oklch(0.5977 0.0793 227.72)', // tuned for contrast: upstream '#31748f'
      warning: '#f6c177',
      danger: '#eb6f92',
      info: '#9ccfd8',
    },
    light: {
      bg: '#faf4ed',
      surface: ['#fffaf3', '#f2e9e1', '#dfdad9'],
      text: ['#464261', 'oklch(0.4399 0.0458 291)', 'oklch(0.4834 0.0268 298.37)', '#9893a5'], // secondary midway between primary and muted; tuned for contrast: upstream ['#464261', '#797593', '#9893a5', '#9893a5']
      border: '#cecacd',
      accent: 'oklch(0.4971 0.0738 305.7)', // tuned for contrast: upstream '#907aa9'
      success: '#286983',
      warning: 'oklch(0.5455 0.1459 69.74)', // tuned for contrast: upstream '#ea9d34'
      danger: 'oklch(0.5589 0.1071 2.66)', // tuned for contrast: upstream '#b4637a'
      info: 'oklch(0.5389 0.0661 210.12)', // tuned for contrast: upstream '#56949f'
    },
  },
  {
    slug: 'everforest',
    name: 'Everforest',
    source: 'https://github.com/sainnhe/everforest/blob/master/autoload/everforest.vim',
    dark: {
      bg: '#232a2e',
      surface: ['#2d353b', '#343f44', '#3d484d'],
      text: ['oklch(0.9699 0.0405 86.05)', 'oklch(0.8983 0.0186 153.43)', 'oklch(0.8267 0.02 155.58)', '#7a8478'], // secondary midway between primary and muted; tuned for contrast: upstream ['#d3c6aa', '#9da9a0', '#859289', '#7a8478']
      border: '#4f585e',
      accent: '#a7c080',
      success: '#83c092',
      warning: '#dbbc7f',
      danger: '#e67e80',
      info: '#7fbbb3',
    },
    light: {
      bg: '#efebd4',
      surface: ['#fdf6e3', '#f4f0d9', '#efebd4'],
      text: ['oklch(0.4354 0.0212 232.87)', 'oklch(0.4771 0.0292 143.51)', 'oklch(0.5188 0.0243 141.21)', '#a6b0a0'], // secondary midway between primary and muted; tuned for contrast: upstream ['#5c6a72', '#829181', '#939f91', '#a6b0a0']
      border: '#e0dcc7',
      accent: 'oklch(0.4597 0.156 118.23)', // tuned for contrast: upstream '#8da101'
      success: 'oklch(0.5035 0.1208 163.88)', // tuned for contrast: upstream '#35a77c'
      warning: 'oklch(0.5266 0.1545 80.27)', // tuned for contrast: upstream '#dfa000'
      danger: 'oklch(0.5407 0.1996 25.2)', // tuned for contrast: upstream '#f85552'
      info: 'oklch(0.5143 0.1118 236.35)', // tuned for contrast: upstream '#3a94c5'
    },
  },
  {
    slug: 'one',
    name: 'One',
    source: 'https://github.com/atom/one-dark-syntax/blob/master/styles/colors.less; https://github.com/atom/one-light-syntax/blob/master/styles/colors.less',
    dark: {
      bg: 'oklch(0.2625 0.0157 264.3)', // derived: syntax-bg L −0.03
      surface: ['#282c34', 'oklch(0.3325 0.0157 264.3)', 'oklch(0.3725 0.0157 264.3)'], // derived: syntax-bg, L +0.04, L +0.08
      text: ['oklch(0.9621 0.0202 262.99)', 'oklch(0.8902 0.0226 264.4)', 'oklch(0.8183 0.0225 262.91)', '#5c6370'], // secondary midway between primary and muted; tuned for contrast: upstream ['#abb2bf', '#828997', '#5c6370', '#5c6370']
      border: '#636d83',
      accent: '#61afef',
      success: '#98c379',
      warning: '#e5c07b',
      danger: '#e06c75',
      info: '#56b6c2',
    },
    light: {
      bg: 'oklch(0.9551 0 0)', // derived: syntax-bg L −0.03
      surface: ['#fafafa', 'oklch(1 0 0)', 'oklch(1 0 0)'], // derived: syntax-bg, L +0.04, L +0.08 (clamped to 1)
      text: ['#383a42', 'oklch(0.4398 0.0175 273.63)', 'oklch(0.53 0.0087 278.58)', '#a0a1a7'], // secondary midway between primary and muted; tuned for contrast: upstream ['#383a42', '#696c77', '#a0a1a7', '#a0a1a7']
      border: '#9d9d9f',
      accent: 'oklch(0.4917 0.193 263.25)', // tuned for contrast: upstream '#4078f2'
      success: 'oklch(0.5181 0.1419 143.46)', // tuned for contrast: upstream '#50a14f'
      warning: 'oklch(0.5384 0.138 76.2)', // tuned for contrast: upstream '#c18401'
      danger: 'oklch(0.5491 0.1792 28.34)', // tuned for contrast: upstream '#e45649'
      info: 'oklch(0.5214 0.1271 237.19)', // tuned for contrast: upstream '#0184bc'
    },
  },
  {
    slug: 'kanagawa',
    name: 'Kanagawa',
    source: 'https://github.com/rebelot/kanagawa.nvim/blob/master/lua/kanagawa/colors.lua',
    dark: {
      bg: '#1a1a22',
      surface: ['#1f1f28', '#2a2a37', '#363646'],
      text: ['oklch(0.9555 0.0391 99.09)', 'oklch(0.8862 0.0608 99.15)', 'oklch(0.817 0.0122 100.99)', '#717c7c'], // secondary midway between primary and muted; tuned for contrast: upstream ['#dcd7ba', '#c8c093', '#727169', '#717c7c']
      border: '#54546d',
      accent: 'oklch(0.668 0.087 301.7)', // tuned for contrast: upstream '#957fb8'
      success: '#98bb6c',
      warning: '#e6c384',
      danger: '#e46876',
      info: '#7e9cd8',
    },
    light: {
      bg: '#e5ddb0',
      surface: ['#f2ecbc', '#e7dba0', '#e4d794'],
      text: ['oklch(0.4219 0.0259 285.32)', 'oklch(0.4501 0.0684 282.89)', 'oklch(0.4782 0.0133 101.61)', '#716e61'], // secondary midway between primary and muted; tuned for contrast: upstream ['#545464', '#43436c', '#8a8980', '#716e61']
      border: '#e4d794',
      accent: 'oklch(0.4434 0.0901 301.41)', // tuned for contrast: upstream '#624c83'
      success: 'oklch(0.4851 0.0889 128.26)', // tuned for contrast: upstream '#6f894e'
      warning: 'oklch(0.4821 0.0702 102.42)', // tuned for contrast: upstream '#77713f'
      danger: 'oklch(0.5107 0.1715 16.48)', // tuned for contrast: upstream '#c84053'
      info: 'oklch(0.4911 0.0862 261.49)', // tuned for contrast: upstream '#4d699b'
    },
  },
  {
    slug: 'ayu',
    name: 'Ayu',
    source: 'https://github.com/ayu-theme/ayu-colors/tree/v8.0.1/src (dark.ts, light.ts)',
    dark: {
      bg: '#0b0e14',
      surface: ['#0d1017', '#0f131a', '#11151c'],
      text: ['oklch(0.958 0.01 93.6)', 'oklch(0.8896 0.0189 266.12)', 'oklch(0.8212 0.017 245.15)', '#acb6bf'], // secondary midway between primary and muted; mapped: syntax.comment opaque base colour (source alpha 0.55)
      // tuned for contrast: upstream ['#bfbdb6', '#565b66', '#acb6bf', '#acb6bf']
      border: '#11151c',
      accent: '#e6b450',
      success: '#aad94c',
      warning: '#ffb454',
      danger: '#d95757', // mapped: common.error (syntax.error absent in v8.0.1)
      info: '#39bae6',
    },
    light: {
      bg: '#f8f9fa',
      surface: ['#fcfcfc', '#f3f4f5', '#e7eaed'], // mapped: ui.line composited over ui.bg
      text: ['oklch(0.4299 0.0102 248.04)', 'oklch(0.4759 0.0144 251.62)', 'oklch(0.522 0.0084 260.73)', '#787b80'], // secondary midway between primary and muted; mapped: syntax.comment opaque base colour (source alpha 0.6)
      // tuned for contrast: upstream ['#5c6166', '#8a9199', '#787b80', '#787b80']
      border: '#e7eaed', // mapped: ui.line composited over ui.bg
      accent: 'oklch(0.5032 0.1587 69.81)', // tuned for contrast: upstream '#ffaa33'
      success: 'oklch(0.5379 0.1793 125.62)', // tuned for contrast: upstream '#86b300'
      warning: 'oklch(0.5575 0.1394 73.81)', // tuned for contrast: upstream '#f2ae49'
      danger: 'oklch(0.5763 0.1862 24.08)', // mapped: common.error (syntax.error absent in v8.0.1)
      // tuned for contrast: upstream '#e65050'
      info: 'oklch(0.5451 0.1004 222.97)', // tuned for contrast: upstream '#55b4d4'
    },
  },
]

export const BUILTIN_PALETTE_IDS: ReadonlySet<string> = new Set(BUILTIN_PALETTES.map(({ slug }) => `builtin:${slug}`))
