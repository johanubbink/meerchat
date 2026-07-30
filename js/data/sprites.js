/* Scene sprites for the stage: sun, moon, trees — plus FD, delta-encoded
   extra meerkat poses expanded into F at load by __scene.expandFrames.
   Same 10-glyph charset as frames.js (# ' * + - . : = @ ^); a space is
   transparent to the compositor and "~" is an opaque space.
   Kept as a data-only classic script (module tail for Node tests). */

const SPR = {
  sun: [
    "     .     ",
    " '  ===  ' ",
    "  =#####=  ",
    " =#######= ",
    ".=#######=.",
    " =#######= ",
    "  =#####=  ",
    " '  ===  ' ",
    "     '     ",
  ],
  moon: [
    "   .=-.",
    "  =##^",
    " =##'",
    " =##",
    " =##.",
    "  =##.",
    "   '=-'",
  ],
  /* Camelthorn acacias (Acacia erioloba): flat umbrella canopy in airy
     tiers, forked trunk, roots flaring at the dune line. x is the column,
     sink is how many rows the base sits below the ground line. */
  trees: [
    {
      name: "tree1",
      x: 0,
      sink: 2,
      art: [
        "        '   .    '   .  '  .        ",
        "     .:-==+++++++++++++++==-:.      ",
        "   .:=+++++++++++++++++++++++=:.    ",
        "  .-=+++++++++++++++++++++++++=-.   ",
        "  '-=+++++++++++++++++++++++++=-'   ",
        "   ':-=+++++++++++++++++++++=-:'    ",
        "     '-=++=-'  \\=+++=/  '-=++=-'    ",
        "        '\\'     \\=+=/      '/'      ",
        "          \\\\     \\|/      //        ",
        "           \\\\     |      //         ",
        "            \\\\    |     //          ",
        "             '\\   |   /'            ",
        "               \\  |  /              ",
        "                \\ | /               ",
        "                 \\|/                ",
        "                  |                 ",
        "                 :|:                ",
        "                 :|:                ",
        "                .:|:.               ",
        "                :=|=:               ",
        "             .:-==+==-:.            ",
      ],
    },
    {
      name: "tree2",
      x: 117,
      sink: 2,
      art: [
        "      '  .   '  .  '   ",
        "   .:-=++++++++++=-:.  ",
        "  .:=++++++++++++++=:. ",
        "  '-=++++++++++++++=-' ",
        "   ':-=++++++++++=-:'  ",
        "     '-=+=-' \\=+=/ '-' ",
        "        '\\'   \\|/   /  ",
        "          \\\\   |   /   ",
        "           \\\\  |  /    ",
        "            '\\ | /     ",
        "              \\|/      ",
        "               |       ",
        "              :|:      ",
        "              :|:      ",
        "             .:|:.     ",
        "           .:-=+=-:.   ",
      ],
    },
  ],
};

/* Extra meerkat poses, expanded into F at load by __scene.expandFrames.
   These are band splices: the frames are image-derived, so poses differ in
   clean horizontal bands (head rows 0-16, tail rows 54-70) but a torso row
   is one continuous ink run — the paws are shaded into the chest, so limbs
   cannot be separated by column. Splicing a head band onto a flicked tail
   gives poses the original six don't contain.
   Rows 71-72 are never spliced: they carry the baked ground/feet marks
   that must stay on the scene's dune line. */
const FD = {
  /* head left, tail swung — the left half-beat of the sentry shuffle */
  dance_l: {
    base: "sentry",
    parts: [
      { from: "look_left", rows: [0, 16] },
      { from: "flick", rows: [54, 70] },
    ],
  },
  /* head right, tail still — the right half-beat */
  dance_r: {
    base: "sentry",
    parts: [{ from: "look_right", rows: [0, 16] }],
  },
  /* eyes shut mid-spin, tail swung: the flourish */
  dance_spin: {
    base: "sentry",
    parts: [
      { from: "blink", rows: [0, 16] },
      { from: "flick", rows: [54, 70] },
    ],
  },
};

if (typeof module !== "undefined" && module.exports) module.exports = { SPR, FD };
