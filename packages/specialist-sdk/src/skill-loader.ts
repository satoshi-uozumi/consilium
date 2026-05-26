import fs from "fs";
import path from "path";

export function loadSkill(specialistName: string): string {
  const skillPath = path.resolve(process.cwd(), `.consilium/specialists/${specialistName}/SKILL.md`);
  if (fs.existsSync(skillPath)) {
    return fs.readFileSync(skillPath, "utf-8");
  }
  return `# ${specialistName}\n\nNo SKILL.md found.`;
}
