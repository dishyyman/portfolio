/*
  i-read-it-somewhere.js: shows a random phrase each time the button is clicked.

  This one's yours to write! Each step below has hints. Write your code under
  each "TODO" and check it in the browser as you go.

  Tip: open the browser's console (right-click the page > Inspect > Console)
  and use console.log(something) to see what your code is doing.
*/


// ===== STEP 1: THE LIST OF PHRASES =====

const phrases = ["For every minute that passes in the US, at least 60 seconds pass in more than three countries in Europe.", 
"There's two states that you exist in. You either are waiting in line at a Raising Canes or you aren't.",
"I was born at a very young age... you probably were too.",
"Whenever someone says 'too', ask them if they're referring to the sequel or the orignal. Example: 'I want to go home too.' 'Home 2, the sequel?'"];

// ===== STEP 2: FIND THE ELEMENTS ON THE PAGE =====

const phraseButton = document.getElementById("phrase-btn");
const phraseText = document.getElementById("phrase");

// ===== STEP 3: PICK A RANDOM PHRASE =====

// remembers the last phrase so the same one never shows twice in a row.
// `let` instead of `const`, because this changes on every click.
let lastPhrase = "";

const getRandomPhrase = () => {
  let randomPhrase;

  // A do...while loop runs once, then keeps going while the condition is true.
  // So: pick a phrase, and if it's the same as last time, pick again.
  // The phrases.length > 1 check stops it from looping forever if the list has only one phrase.
  do {
    const randomIndex = Math.floor(Math.random() * phrases.length);
    randomPhrase = phrases[randomIndex];
  } while (randomPhrase === lastPhrase && phrases.length > 1);

  lastPhrase = randomPhrase;
  return randomPhrase;
};

// ===== STEP 4: SHOW THE PHRASE =====

const showPhrase = () => {
  const randomPhrase = getRandomPhrase();
  phraseText.textContent = randomPhrase;

  // replay the fade-in animation (the .fade-in class is in the CSS file).

  phraseText.classList.remove("fade-in");
  void phraseText.offsetWidth;
  phraseText.classList.add("fade-in");
};

// ===== STEP 5: LISTEN FOR CLICKS =====

phraseButton.addEventListener("click", showPhrase);

