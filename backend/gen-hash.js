const bcrypt = require("bcrypt");

async function run() {
  const password = "admin123";
  const hash = await bcrypt.hash(password, 10);
  console.log("HASH =", hash);
}

run();
