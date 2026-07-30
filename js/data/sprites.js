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

/* delta-encoded poses: {name: {base: frameName, rows: {rowIdx: line}}} —
   dance poses land with the dance milestone */
const FD = {};

if (typeof module !== "undefined" && module.exports) module.exports = { SPR, FD };
