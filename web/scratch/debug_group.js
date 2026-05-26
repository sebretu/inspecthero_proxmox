const lineItems = [
  { text: "Fehlerstromschutzschalter", x: 122.4 },
  { text: "40A - 30mA", x: 140.9 },
  { text: "Festanschluss", x: 249.8 },
  { text: "Herd", x: 268.7 },
  { text: "Steckdosen", x: 363 },
  { text: "Arbeitsbereich", x: 382 },
  { text: "Steckdosen", x: 476.2 },
  { text: "Spülmaschine", x: 495.3 },
  { text: "Steckdosen", x: 589.5 },
  { text: "Mikrowelle", x: 608.5 }
];

const phrases = [];
let currentPhrase = null;

for (const item of lineItems) {
  const x = item.x;
  if (!currentPhrase) {
    currentPhrase = { text: item.text, x: x, lastX: x };
  } else {
    const diff = x - currentPhrase.lastX;
    console.log(`Comparing "${currentPhrase.text}" (lastX: ${currentPhrase.lastX}) with "${item.text}" (x: ${x}). Diff: ${diff}`);
    if (diff <= 30.0) {
      currentPhrase.text += " " + item.text;
      currentPhrase.lastX = x;
    } else {
      phrases.push(currentPhrase);
      currentPhrase = { text: item.text, x: x, lastX: x };
    }
  }
}
if (currentPhrase) {
  phrases.push(currentPhrase);
}

console.log("Resulting phrases:", phrases);
