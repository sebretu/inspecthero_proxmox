const regex = new RegExp('(\\d{1,3}/\\d{1,3}|\\d{1,3}\\.\\d{1,3}|PA10\\sS\\d|BMA|BMZ|FIZ|HM|ÜG)', 'g');
const text = "Some text 500/01 and 01/01 and 400/02 and FSD";
const matches = [...text.matchAll(regex)];
console.log("Matches:", matches.map(m => m[0]));
