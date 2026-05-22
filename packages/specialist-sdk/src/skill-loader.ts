import fs from "fs";
import path from "path";

export function loadSkill(specialistName: string): string {
  // User override takes precedence
  const override = path.resolve(process.cwd(), `.consilium/${specialistName}/SKILL.md`);
  if (fs.existsSync(override)) {
    return fs.readFileSync(override, "utf-8");
  }

  // Default shipped with the specialist
  const defaultSkill = path.resolve(process.cwd(), `specialists/${specialistName}/SKILL.md`);
  if (fs.existsSync(defaultSkill)) {
    return fs.readFileSync(defaultSkill, "utf-8");
  }

  return `# ${specialistName}\n\nNo SKILL.md found.`;
}
