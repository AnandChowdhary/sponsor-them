import { cosmicSync, config } from "@anandchowdhary/cosmic";
import { Octokit } from "@octokit/rest";
import { readFile, writeFile } from "fs/promises";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";

cosmicSync("sponsor");
if (!existsSync(join(".", ".cache"))) mkdirSync(join(".", ".cache"));
const octokit = new Octokit({
  auth: config<string>("githubToken"),
});

const cachedRequest = async <T>(
  key: string,
  responseData: () => Promise<T>
): Promise<T> => {
  try {
    const data = await readFile(join(".", ".cache", `${key}.json`));
    if (data) return JSON.parse(data.toString());
  } catch (error) {}
  const data = await responseData();
  await writeFile(join(".", ".cache", `${key}.json`), JSON.stringify(data));
  return data;
};

export const sponsorThem = async () => {
  const repos = await cachedRequest("repos", () =>
    octokit.repos.listForAuthenticatedUser()
  );
  console.log(repos);
};
sponsorThem();