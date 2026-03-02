import { buildDocTokens, buildBookDocument } from "../utils/tfidf";

// Test single book
const book = {
  id: 1,
  title: "จอมมารต่างโลก",
  description: "แฟนตาซี เวทมนตร์ ต่างโลก มอนสเตอร์",
  categories: ["Fantasy"],
};

const docText = buildBookDocument(book);
console.log("Document text:", docText);
console.log("\nTokens:");
const tokens = buildDocTokens(docText);
console.log(tokens);

// Check specific tokens
console.log("\nChecking for full words:");
console.log('Has "จอมมารต่างโลก":', tokens.includes("จอมมารต่างโลก"));
console.log('Has "แฟนตาซี":', tokens.includes("แฟนตาซี"));
console.log('Has "เวทมนตร์":', tokens.includes("เวทมนตร์"));
console.log('Has "ต่างโลก":', tokens.includes("ต่างโลก"));
console.log('Has "มอนสเตอร์":', tokens.includes("มอนสเตอร์"));
