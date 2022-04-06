'use strict'

const checker = require("license-checker");
const fs = require("fs");
const path = require("path");

const rootDir = "./docs"
const licenseFileDir = "third-party-licenses";
 
checker.init({
  start: "./",
  production: true,
  excludePrivatePackages: true,
  relativeLicensePath: true,
}, function(err, packages) {
  if (err) {
    throw err;
  }
  if (fs.existsSync(path.join(rootDir, licenseFileDir))) {
    fs.rmSync(path.join(rootDir, licenseFileDir), { recursive: true });
  }
  fs.mkdirSync(path.join(rootDir, licenseFileDir));
  const stream = fs.createWriteStream(path.join(rootDir, "/third-party-licenses.html"));
  stream.write(`<html>`);
  stream.write(`<body>`);
  stream.write(`<table border="1px">`);
  stream.write(`<tr>`);
  stream.write(`<th>Library</th>`);
  stream.write(`<th>License</th>`);
  stream.write(`<th>Publisher</th>`);
  stream.write(`<th>Repository</th>`);
  stream.write(`</tr>`);
  let n = 0;
  Object.entries(packages).forEach(([name, props]) => {
    stream.write(`<tr>`);
    stream.write(`<td>${name}</td>`);
    if (props.licenseFile) {
      const fileName = n + ".txt";
      fs.copyFileSync(props.licenseFile, path.join(path.join(rootDir, licenseFileDir), fileName));
      n += 1;
      stream.write(`<td><a href="${licenseFileDir}/${fileName}">${props.licenses}</a></td>`);
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
  });
  stream.write(`</table>`);
  stream.write(`</body>`);
  stream.write(`</html>`);
  stream.end();
});