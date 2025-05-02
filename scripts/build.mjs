/* eslint-disable no-console */
import * as builder from "electron-builder";
// eslint-disable-next-line no-restricted-imports
import config from "../.electron-builder.config.mjs";

const target = process.argv[2];

switch (target) {
  case "portable":
    config.win.target = "portable";
    break;
}

builder
  .build({
    universal: process.platform === "darwin",
    config,
  })
  .then((result) => {
    console.log(JSON.stringify(result));
  })
  .catch((error) => {
    throw error;
  });
