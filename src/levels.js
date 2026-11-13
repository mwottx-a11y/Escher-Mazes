// Level definitions. Pure data, shared by the game and the tests.
export const LEVELS = [
  {
    name: 'Relativity', year: 'after the lithograph of 1953', seed: 11,
    quote: '“Are you really sure that a floor can’t also be a ceiling?”',
    tip: 'Walk into a striped curve and the wall becomes your floor.',
    size: [3, 2, 3], keys: 2, extraOpen: 2, extraRamps: 1, grille: 0.22, vertBias: 2.2,
    pal: [{ tone: [0xa89a80, 0xeadfc6, 0x6e6453], trim: 0x3a332a, sky: [0xf3ead3, 0x8f8468], fog: 0xcfc4a8, dens: 0.022 }],
  },
  {
    name: 'Belvedere', year: 'after the lithograph of 1958', seed: 23,
    quote: '“Only those who attempt the absurd will achieve the impossible.”',
    tip: 'Some floors are missing. A leap of faith always lands somewhere.',
    size: [4, 3, 3], keys: 3, extraOpen: 7, extraRamps: 3, grille: 0.42, vertBias: 1.6,
    pal: [{ tone: [0x93a08c, 0xe1e7d4, 0x5d6a5c], trim: 0x2c342c, sky: [0xe9f0e0, 0x71877d], fog: 0xbfcbbb, dens: 0.02 }],
  },
  {
    name: 'Day and Night', year: 'after the woodcut of 1938', seed: 37,
    quote: '“We adore chaos because we love to produce order.”',
    tip: 'Touch a sun-and-moon orb to turn day into night. Different walls are solid in each.',
    size: [4, 3, 4], keys: 3, extraOpen: 5, extraRamps: 2, grille: 0.25, vertBias: 1.4,
    phases: { toggles: 4, swaps: 12 },
    pal: [
      { tone: [0xb7b2a6, 0xf2efe4, 0x7d796f], trim: 0x33312c, sky: [0xf1f4f2, 0x9fb4c4], fog: 0xd3dce0, dens: 0.02 },
      { tone: [0x3f4864, 0x5d6a8c, 0x262c40], trim: 0x0d0f18, sky: [0x27304a, 0x070913], fog: 0x121627, dens: 0.026 },
    ],
  },
  {
    name: 'Cubic Space Division', year: 'after the lithograph of 1952', seed: 41,
    quote: '“He who wonders discovers that this in itself is wonder.”',
    tip: 'This world has no outside. Walk far enough and you arrive where you began. That distant figure is you.',
    size: [3, 3, 3], wrap: true, keys: 4, extraOpen: 7, extraRamps: 3, grille: 0.4, vertBias: 1.5,
    pal: [{ tone: [0x8fa3b8, 0xdde6ee, 0x56667a], trim: 0x1f2a36, sky: [0xb9c7d4, 0xb9c7d4], fog: 0xb9c7d4, dens: 0.048 }],
  },
  {
    name: 'Metamorphosis', year: 'after the woodcuts of 1937–1968', seed: 53,
    quote: '“My work is a game, a very serious game.”',
    tip: 'Everything at once: endless space, day and night, and no fixed floor.',
    size: [4, 3, 4], wrap: true, keys: 5, extraOpen: 9, extraRamps: 4, grille: 0.35, vertBias: 1.5,
    phases: { toggles: 5, swaps: 14 },
    pal: [
      { tone: [0xc79a7a, 0xf0dcc4, 0x8a5a48], trim: 0x3b2018, sky: [0xe2c9ae, 0xe2c9ae], fog: 0xe2c9ae, dens: 0.045 },
      { tone: [0x5a3a60, 0x80588a, 0x321c3a], trim: 0x10060f, sky: [0x1b0f20, 0x1b0f20], fog: 0x1b0f20, dens: 0.05 },
    ],
  },
];
