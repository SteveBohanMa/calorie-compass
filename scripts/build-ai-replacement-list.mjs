import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const foods = JSON.parse(await fs.readFile(path.join(root, "src", "foods.json"), "utf8"));
const curation = JSON.parse(await fs.readFile(path.join(root, "verification-v25-images", "openverse-curation.json"), "utf8"));

// Exact-query results that still failed visual review (wrong subject, wrong preparation,
// packaging/people/text instead of a food close-up, or duplicate imagery for different dishes).
const visuallyRejected = new Set(`
f005 f011 f019 f027 f043 f045 f049 f050
v24-003 v24-007 v24-008 v24-009 v24-013 v24-014 v24-015 v24-019 v24-020 v24-022 v24-023 v24-029
v24-031 v24-035 v24-036 v24-037 v24-043 v24-044 v24-048 v24-049 v24-050 v24-052 v24-053 v24-056
v24-059 v24-060 v24-061 v24-065 v24-066 v24-071 v24-072 v24-075 v24-077 v24-078 v24-079 v24-080
v24-081 v24-083 v24-084 v24-087 v24-088 v24-089 v24-090 v24-091 v24-092 v24-093 v24-095
v24-111 v24-113 v24-115 v24-121 v24-125 v24-133 v24-135 v24-136 v24-138 v24-140 v24-141 v24-142
v24-143 v24-144 v24-145 v24-149 v24-150 v24-152 v24-154 v24-155 v24-156 v24-157 v24-158 v24-159
v24-160 v24-164 v24-165 v24-166 v24-167 v24-169 v24-170 v24-171 v24-173 v24-174 v24-176 v24-179
v24-180 v24-187 v24-189 v24-190 v24-191 v24-194 v24-196 v24-197 v24-198 v24-199 v24-200 v24-201
v24-202 v24-203 v24-204 v24-205 v24-206 v24-210 v24-212 v24-213 v24-214 v24-215 v24-216 v24-217
v24-218 v24-219 v24-220 v24-221 v24-222 v24-223 v24-224 v24-225 v24-226 v24-231 v24-232 v24-233
v24-234 v24-235 v24-236 v24-240 v24-243 v24-244 v24-248 v24-249
`.trim().split(/\s+/));

const curationById = new Map(curation.map((item) => [item.id, item]));
const replacements = foods
  .filter((food) => {
    const result = curationById.get(food.Id);
    return visuallyRejected.has(food.Id) || !result || result.status !== "curated" || result.confidence !== "exact";
  })
  .map((food) => ({
    id: food.Id,
    name: food.NameEn,
    preparation: food.PreparationEn,
  }));

await fs.writeFile(path.join(root, "verification-v25-images", "ai-replacement-list.json"), `${JSON.stringify(replacements, null, 2)}\n`);
console.log(JSON.stringify({ total: foods.length, aiReplacements: replacements.length, retainedWebPhotos: foods.length - replacements.length }, null, 2));
