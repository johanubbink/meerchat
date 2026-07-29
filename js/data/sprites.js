/* Scene sprites for the stage: sun, moon, trees — plus FD, delta-encoded
   extra meerkat poses expanded into F at load by __scene.expandFrames.
   Same 10-glyph charset as frames.js (# ' * + - . : = @ ^); a space is
   transparent to the compositor and "~" is an opaque space.
   Kept as a data-only classic script (module tail for Node tests). */

const SPR = {
  sun: [
    "   .::.   ",
    " .::::::. ",
    ":::::::::",
    " '::::::' ",
    "   '::'   ",
  ],
  moon: [
    "  .##'",
    " ##^",
    " ##",
    "  '##.",
  ],
  /* camelthorn trees land with the trees milestone */
  trees: [],
};

/* delta-encoded poses: {name: {base: frameName, rows: {rowIdx: line}}} —
   dance poses land with the dance milestone */
const FD = {};

if (typeof module !== "undefined" && module.exports) module.exports = { SPR, FD };
