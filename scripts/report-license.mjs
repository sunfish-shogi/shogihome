"use strict";

import fs from "fs";
import path from "path";
import checker from "license-checker";

const rootDir = "./docs";
const licenseFileDir = "third-party-licenses";

function writeHeader(stream) {
  stream.write(`<html>`);
  stream.write(`<body>`);
  stream.write(`<table border="1px">`);
  stream.write(`<tr>`);
  stream.write(`<th>Library</th>`);
  stream.write(`<th>License</th>`);
  stream.write(`<th>Publisher</th>`);
  stream.write(`<th>Repository</th>`);
  stream.write(`</tr>`);
}

function writeRow(index, stream, fullName, props) {
  const m = fullName.match(/^(.+)@[0-9.]*$/);
  const name = m ? m[1] : fullName;
  stream.write(`<tr>`);
  stream.write(`<td>${name}</td>`);
  if (props.licenseFile) {
    const fileName = index + ".txt";
    fs.copyFileSync(
      props.licenseFile,
      path.join(path.join(rootDir, licenseFileDir), fileName)
    );
    stream.write(
      `<td><a href="${licenseFileDir}/${fileName}">${props.licenses}</a></td>`
    );
  } else {
    stream.write(`<td>${props.licenses}</td>`);
  }
  stream.write(`<td>${props.publisher || ""}</td>`);
  stream.write(`<td>`);
  if (props.repository) {
    stream.write(`<a href="${props.repository}">${props.repository}</a>`);
  }
  stream.write(`</td>`);
  stream.write(`</tr>`);
}

function writeFooter(stream) {
  stream.write(`</table>`);
  stream.write(`</body>`);
  stream.write(`</html>`);
  stream.end();
}

checker.init(
  {
    start: "./",
    production: true,
    excludePrivatePackages: true,
    relativeLicensePath: true,
    onlyAllow: "MIT;ISC;Apache-2.0;BSD-2-Clause;BSD-3-Clause;0BSD",
  },
  function (err, packages) {
    if (err) {
      throw err;
    }
    if (fs.existsSync(path.join(rootDir, licenseFileDir))) {
      fs.rmSync(path.join(rootDir, licenseFileDir), { recursive: true });
    }
    fs.mkdirSync(path.join(rootDir, licenseFileDir));
    const stream = fs.createWriteStream(
      path.join(rootDir, "/third-party-licenses.html")
    );
    writeHeader(stream);
    let index = 0;
    Object.entries(packages).forEach(([name, props]) => {
      writeRow(index, stream, name, props);
      index += 1;
    });
    writeFooter(stream);
  }
);
