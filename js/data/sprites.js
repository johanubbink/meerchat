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
  /* ambient sky visitors (scene.ambient): a falling streak, head low-left */
  star: [
    "      .",
    "    .-'",
    "  .-='",
    "*=-'",
  ],
  /* a raptor gliding over, seen from below — wings out, tucked head */
  bird: [
    "-=.       .=-",
    "  '=:.  .:='",
    "     '=='",
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
  /* the night nap: duck's crouch with the eyes rowed shut (#@ pupils -> lids) */
  sleep: {
    base: "duck",
    rows: {
      13: "                                            .-======: '---..-====: :---..-======:",
    },
  },
  /* Sentry with a folded arm raised away (rows 20-33). The folded arms
     occlude the upper taper of the dark belly ellipse (fully visible at
     rows 34-47, cols 53-72), so raising an arm must REVEAL that ellipse:
     on the raised side the # patch extends to the belly contour (linear
     taper from the chest span at row 19 to the belly span at row 34),
     with the usual * / + boundary glyphs and = fur out to the untouched
     silhouette edge. Generated from the frame itself; these are the bases
     the arm poses in RIG build on. */
  sentry_noarm_l: {
    base: "sentry",
    rows: {
      20: "                                                 '=====*#############*=-----",
      21: "                                                  ^===*#############*#*----'",
      22: "                                                  .====*##############=---^",
      23: "                                                   :===*#############+----.",
      24: "                                                   -===*############*----=:",
      25: "                                                  :===*#############=----==",
      26: "                                                  -===*############+----===:",
      27: "                                                 :====*###########*-----===-",
      28: "                                                 -====*###########=--^=+===='",
      29: "                                                .====*###########+----**====^",
      30: "                                                '====*##########+-----=*+===-",
      31: "                                                ^====*#########*------^=+====.",
      32: "                                                -====*#########*=^^^^^-+*===='",
      33: "                                               .====*############+===+*#*====:",
    },
  },
  sentry_noarm_r: {
    base: "sentry",
    rows: {
      20: "                                                 '=---=+#############+=====-",
      21: "                                                  ^---=#############+======'",
      22: "                                                  .----*##############+===^",
      23: "                                                   :----*############+====.",
      24: "                                                   ----^+############+====:",
      25: "                                                  :=-----+###########+=====",
      26: "                                                  -==-----*###########+====:",
      27: "                                                 :====---^=###########+====-",
      28: "                                                 -====+----+#*#########+===='",
      29: "                                                .====+#=----*##########+====^",
      30: "                                                '====*+-----=*#########+====-",
      31: "                                                ^====+------^=##########+====.",
      32: "                                                -===+*=^^^^^-+##########+===='",
      33: "                                               .====+#*+===+*############+===:",
    },
  },
  sentry_noarm_both: {
    base: "sentry",
    rows: {
      20: "                                                 '=====*#############+=====-",
      21: "                                                  ^===*#############+======'",
      22: "                                                  .====*##############+===^",
      23: "                                                   :===*#############+====.",
      24: "                                                   -===*#############+====:",
      25: "                                                  :===*##############+=====",
      26: "                                                  -===*###############+====:",
      27: "                                                 :====*###############+====-",
      28: "                                                 -====*################+===='",
      29: "                                                .====*#################+====^",
      30: "                                                '====*#################+====-",
      31: "                                                ^====*##################+====.",
      32: "                                                -====*##################+===='",
      33: "                                               .====*####################+===:",
    },
  },
};

/* ============== RIG: the meerkat as parts ==============
   Expanded into F by __scene.expandRig (after expandFrames). The frames
   can't be cut into limbs by column, but the tail is a detached diagonal
   right of the skirt (the skirt never crosses col 90), and the canvas
   beside the torso (cols <=46 and >=78 at shoulder height) is empty — so
   tails are swapped inside TAIL_RECT and arms are purely additive
   overlays anchored at the shoulders (left ~(20,48), right ~(20,76)).
   All literal art keeps the meerkat charset; anchors were placed with
   the scene lab's ?grid=1 ruler. */

/* sentry's tail lives here; erased before a replacement tail is blitted */
const TAIL_RECT = { rows: [56, 70], cols: [90, 112] };

const RIG = {
  carve: {
    /* the resting tail itself, for the identity check and reuse */
    tail_rest: { from: "sentry", rows: [56, 70], cols: [90, 112] },
  },
  parts: {
    /* tail swept up in an arc, tip high — no ground contact */
    tail_up: {
      x: 90, y: 44,
      art: [
        "              .:.",
        "             :-'",
        "            :-'",
        "           .-'",
        "          .-^",
        "         .-^",
        "        .-^",
        "       :-'",
        "      :-'",
        "     .-'",
        "    .-^",
        "   .-^",
        "  :-'",
        ":--'",
        "--'",
      ],
    },
    /* tail drooped close in, tip resting on the sand */
    tail_down: {
      x: 90, y: 56,
      art: [
        "':.",
        " '-.",
        "  '-.",
        "   '-.",
        "    '-.",
        "     ^-.",
        "      ^-.",
        "       ^-:",
        "        ^-:",
        "        .-'",
        "        :-'",
        "       .-'",
        "       :-'",
        "       ':....",
        "        .....",
      ],
    },
    /* right paw out at ear height — the low beat of the wave */
    arm_wave_lo: {
      x: 75, y: 11,
      art: [
        "        .===.",
        "        :@===='",
        "       '====-",
        "       ^====:",
        "      .====^",
        "      -====:",
        "     .====-",
        "   .-====:",
        "-====-'",
      ],
    },
    /* right paw high above the head — the high beat */
    arm_wave_hi: {
      x: 75, y: 5,
      art: [
        "          .===.",
        "          :@===='",
        "          ^====-",
        "         .====^",
        "         -====:",
        "        .====^",
        "        -====:",
        "       .====-",
        "       -====:",
        "      .====-",
        "      ^====:",
        "     .====-",
        "    .====-",
        "  .-====:",
        "-====-'",
      ],
    },
    /* both-arms-up pair for the cheer */
    arm_cheer_r: {
      x: 76, y: 7,
      art: [
        "     .===.",
        "     :@===='",
        "    .====-",
        "    -====:",
        "   .====^",
        "   -====:",
        "  .====-",
        "  -====:",
        " .====-",
        " -====:",
        ".====-",
        "====-'",
      ],
    },
    arm_cheer_l: {
      x: 38, y: 7,
      art: [
        ".===.",
        "'====@:",
        " '====-",
        " ^====:",
        "  '====-",
        "  ^====:",
        "   '====-",
        "   ^====:",
        "    '====-",
        "    ^====:",
        "     '====-",
        "      '====-",
      ],
    },
    /* straight arm pointing left / right at shoulder height */
    arm_point_l: {
      x: 33, y: 19,
      art: [
        "  .:==+==========-'",
        ".=@===+=============",
        "  ':==+==========-'",
      ],
    },
    arm_point_r: {
      x: 73, y: 19,
      art: [
        "'-==========+==:.",
        "=============+===@=.",
        " '-==========+==:'",
      ],
    },
  },
  poses: {
    /* tail wag pair */
    wag_up:   { base: "sentry", tail: { erase: TAIL_RECT, part: "tail_up" } },
    wag_down: { base: "sentry", tail: { erase: TAIL_RECT, part: "tail_down" } },
    /* The greeting wave, two beats. Raised arms always ride an armless
       base so the baked-in folded arm never doubles them. */
    wave_lo: { base: "sentry_noarm_r", overlays: [{ part: "arm_wave_lo" }] },
    wave_hi: { base: "sentry_noarm_r", overlays: [{ part: "arm_wave_hi" }] },
    /* both paws in the air */
    cheer: {
      base: "sentry_noarm_both",
      overlays: [{ part: "arm_cheer_l" }, { part: "arm_cheer_r" }],
    },
    /* she spots something: head turns and the arm points the same way */
    point_l: { base: "sentry_noarm_l", head: "look_left", overlays: [{ part: "arm_point_l" }] },
    point_r: { base: "sentry_noarm_r", head: "look_right", overlays: [{ part: "arm_point_r" }] },
  },
};

if (typeof module !== "undefined" && module.exports) module.exports = { SPR, FD, RIG };
