let Octokit: any;

export async function getOctokit() {
  if (!Octokit) {
    // Dynamic import for ESM module
    const module = await eval('import("@octokit/rest")');
    Octokit = module.Octokit;
  }
  return Octokit;
}