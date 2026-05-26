const fs = require("fs");
let content = fs.readFileSync("src/lib/translations.ts", "utf8");

const keysEN = `      showAll: "Show all",
      showLess: "Show less",`;
const keysPL = `      showAll: "Pokaż wszystkie",
      showLess: "Pokaż mniej",`;
const keysDE = `      showAll: "Alle anzeigen",
      showLess: "Weniger anzeigen",`;
const keysSK = `      showAll: "Zobraziť všetko",
      showLess: "Zobraziť menej",`;

content = content.replace(/(en:\s*\{[\s\S]*?common:\s*\{)/, "$1\n" + keysEN);
content = content.replace(/(pl:\s*\{[\s\S]*?common:\s*\{)/, "$1\n" + keysPL);
content = content.replace(/(de:\s*\{[\s\S]*?common:\s*\{)/, "$1\n" + keysDE);
content = content.replace(/(sk:\s*\{[\s\S]*?common:\s*\{)/, "$1\n" + keysSK);

fs.writeFileSync("src/lib/translations.ts", content);
