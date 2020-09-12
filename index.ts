import { cosmicSync, config } from "@anandchowdhary/cosmic";
import { Octokit } from "@octokit/rest";
import { readFile, writeFile } from "fs/promises";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import axios from "axios";

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
  let data: any = null;
  try {
    data = await responseData();
  } catch (error) {}
  await writeFile(join(".", ".cache", `${key}.json`), JSON.stringify(data));
  return data;
};

export const sponsorThem = async () => {
  const repos = await cachedRequest("repos", () =>
    octokit.paginate(octokit.repos.listForAuthenticatedUser)
  );
  const dependencies: { [index: string]: number } = {};
  for await (const repo of repos) {
    console.log(`Fetching contents for ${repo.owner.login}/${repo.name}`);
    const files = await cachedRequest(
      `contents-${repo.full_name.replace("/", "-")}`,
      () =>
        octokit.repos.getContent({
          owner: repo.owner.login,
          repo: repo.name,
          path: ".",
        })
    );
    if (
      files &&
      Array.isArray(files.data) &&
      files.data.find((file) => file.name === "package.json")
    ) {
      console.log("Fetching package.json");
      const file = await cachedRequest(
        `content-${repo.full_name.replace("/", "-")}-package`,
        () =>
          octokit.repos.getContent({
            owner: repo.owner.login,
            repo: repo.name,
            path: "package.json",
          })
      );
      const packageJson = JSON.parse(
        Buffer.from(file.data.content, "base64").toString()
      );
      Object.keys(packageJson.dependencies ?? {}).forEach((dependency) => {
        dependencies[dependency] = dependencies[dependency] ?? 0;
        dependencies[dependency] += 1;
      });
    }
  }
  let dependenciesOrdered: Array<{
    name: string;
    count: number;
    funding?: string;
  }> = [];
  Object.keys(dependencies).forEach((dependency) => {
    dependenciesOrdered.push({
      name: dependency,
      count: dependencies[dependency],
    });
  });
  dependenciesOrdered = dependenciesOrdered.sort((a, b) => b.count - a.count);
  for await (const dependency of Object.keys(dependencies)) {
    console.log("Fetching package.json", dependency);
    let packageJson: any = null;
    try {
      packageJson = JSON.parse(
        (await cachedRequest(`dependency-json-${dependency}`, async () => {
          return (
            await axios.get(`https://unpkg.com/${dependency}/package.json`)
          ).data;
        })) ?? null
      );
    } catch (error) {}
    if (packageJson && packageJson.funding)
      dependenciesOrdered = dependenciesOrdered.map((i) => {
        if (i.name === dependency) i.funding = packageJson.funding;
        return i;
      });
    console.log(dependenciesOrdered.filter((i) => i.funding));
  }
};

export const followingSponsors = async () => {
  const toSponsor: string[] = [];
  const following = await cachedRequest("following", () =>
    octokit.users.listFollowedByAuthenticated()
  );
  for await (const user of following.data) {
    const result = await cachedRequest(
      `sponsor-${user.login}`,
      async () =>
        (await axios.get(`https://github.com/sponsors/${user.login}`)).request
          .res.responseUrl
    );
    if (result.includes("/sponsors/")) toSponsor.push(user.login);
  }
  console.log(toSponsor);
};
followingSponsors();
