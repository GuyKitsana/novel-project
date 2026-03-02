
export function normalizeSeriesTitle(input: string): string {
  if (!input || typeof input !== "string") {
    return "";
  }

  let normalized = input.trim();


  normalized = normalized.replace(/\s*เล่ม(ที่|#)?\s*\d+\s*$/i, "");

  normalized = normalized.replace(/\s*\(ฉบับ[^)]*\)\s*$/i, "");
  normalized = normalized.replace(/\s*\(พิมพ์ครั้งที่[^)]*\)\s*$/i, "");
 
  normalized = normalized.replace(/\s*ภาค\s*\d+\s*$/i, "");
  normalized = normalized.replace(/\s*Part\s+\d+\s*$/i, "");
  

  normalized = normalized.replace(/\s+/g, " ").trim();
  
  return normalized.toLowerCase();
}

export function extractVolumeNoFromTitle(title: string): number | null {
  if (!title || typeof title !== "string") {
    return null;
  }

  // Thai patterns: "เล่ม 12", "เล่มที่ 12", "เล่ม #12"
  const thaiMatch = title.match(/เล่ม(ที่|#)?\s*(\d+)/i);
  if (thaiMatch && thaiMatch[2]) {
    const num = parseInt(thaiMatch[2], 10);
    if (!Number.isNaN(num) && num > 0) {
      return num;
    }
  }

  // English patterns: "Vol. 12", "Volume 12", "Vol 12"
  const engMatch = title.match(/Vol(ume)?\.?\s*(\d+)/i);
  if (engMatch && engMatch[2]) {
    const num = parseInt(engMatch[2], 10);
    if (!Number.isNaN(num) && num > 0) {
      return num;
    }
  }

  // Part pattern: "Part 12", "ภาค 12"
  const partMatch = title.match(/(Part|ภาค)\s*(\d+)/i);
  if (partMatch && partMatch[2]) {
    const num = parseInt(partMatch[2], 10);
    if (!Number.isNaN(num) && num > 0) {
      return num;
    }
  }

  return null;
}
