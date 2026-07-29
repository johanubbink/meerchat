"use strict";
/* tiny shared CLI parser: --flag value pairs -> { flag: value } */
module.exports = function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 2)
    args[argv[i].replace(/^--/, "")] = argv[i + 1];
  return args;
};
